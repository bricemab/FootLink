/**
 * Vérification end-to-end des annonces.
 *
 * Lancement (depuis la racine du dépôt) :
 *   pnpm --filter @footlink/api exec tsx <chemin ABSOLU vers ce fichier>
 *
 * Comme `pitch.ts`, ce script n'a PAS besoin d'une instance sans SMTP : il ne
 * rejoue aucun email. Il pose ses comptes et ses clubs directement en base et
 * signe lui-même des jetons d'accès avec `JWT_ACCESS_SECRET`.
 *
 * Ce qu'il vérifie, dans l'ordre d'importance :
 *
 * 1. **Les gardes.** Club non approuvé refusé, entraîneur cantonné à ses
 *    équipes assignées, cloisonnement inter-clubs (anti-IDOR).
 * 2. **Ce que le client ne décide pas** : la saison (calculée), le statut
 *    `EXPIRED` (réservé à l'ordonnanceur), le plafond de postes secondaires.
 * 3. **La suppression**, impossible sans le décompte de ce qu'elle détruit.
 *
 *   E2E_BASE  URL de base de l'API  (défaut http://localhost:3000/api/v1)
 *
 * Comptes et clubs vivent sur @e2e.footlink.test et sont supprimés à la fin,
 * y compris si un contrôle échoue.
 *
 * Note : les écritures en base passent par la CLI Prisma (`db execute`) et non
 * par `@prisma/client` — un script hors d'`apps/api` ne résout pas le même
 * client généré (contrepartie du `nodeLinker: hoisted`, cf. HANDOFF §7).
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import jwt from 'jsonwebtoken';

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000/api/v1';
const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const RUN = Date.now().toString(36);
const DOMAIN = 'e2e.footlink.test';
const CLUB_PREFIX = `FC E2E LST ${RUN}`;

let failures = 0;

function check(label: string, ok: boolean, detail?: unknown): void {
  const suffix = ok || detail === undefined ? '' : ` -> ${JSON.stringify(detail)}`;
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}${suffix}`);
  if (!ok) {
    failures += 1;
  }
}

function sql(statement: string): void {
  execSync(
    'pnpm --filter @footlink/api exec prisma db execute --stdin --schema prisma/schema.prisma',
    { cwd: REPO_ROOT, input: statement, stdio: ['pipe', 'ignore', 'inherit'] },
  );
}

interface Called<T> {
  status: number;
  body: T | undefined;
}

async function call<T>(
  path: string,
  token: string | null,
  init: { method?: string; body?: unknown } = {},
): Promise<Called<T>> {
  const response = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as T) : undefined };
}

/** Lit `JWT_ACCESS_SECRET` du `.env` de l'API — jamais commité, jamais logué. */
function readAccessSecret(): string {
  const env = readFileSync(resolve(REPO_ROOT, 'apps/api/.env'), 'utf8');
  const line = env.split(/\r?\n/).find((row) => row.startsWith('JWT_ACCESS_SECRET='));
  const value = line?.slice('JWT_ACCESS_SECRET='.length).replace(/^"|"$/g, '').trim();
  if (!value) {
    throw new Error('JWT_ACCESS_SECRET introuvable dans apps/api/.env');
  }
  return value;
}

interface Actor {
  id: string;
  token: string;
}

/**
 * Pose un club complet en base : le club, son responsable, une équipe, et
 * éventuellement un entraîneur assigné.
 *
 * Directement en SQL parce que le but n'est pas de retester l'inscription —
 * elle a sa propre couverture — mais d'obtenir un décor prévisible.
 */
function makeClub(
  suffix: string,
  secret: string,
  options: { approved: boolean },
): { club: string; team: string; otherTeam: string; admin: Actor; coach: Actor } {
  const clubId = `e2elstc${RUN}${suffix}`;
  const teamId = `e2elstt${RUN}${suffix}`;
  const otherTeamId = `e2elsto${RUN}${suffix}`;
  const adminId = `e2elsta${RUN}${suffix}`;
  const coachId = `e2elstu${RUN}${suffix}`;
  const adminEmail = `lst-admin-${RUN}-${suffix}@${DOMAIN}`;
  const coachEmail = `lst-coach-${RUN}-${suffix}@${DOMAIN}`;
  const status = options.approved ? 'APPROVED' : 'PENDING';

  sql(
    `INSERT INTO \`User\` (id,email,role,status,emailVerifiedAt,locale,createdAt,updatedAt)
     VALUES ('${adminId}','${adminEmail}','CLUB_ADMIN','ACTIVE',NOW(),'FR',NOW(),NOW()),
            ('${coachId}','${coachEmail}','COACH','ACTIVE',NOW(),'FR',NOW(),NOW());`,
  );
  sql(
    `INSERT INTO \`Club\` (id,name,status,updatedAt)
     VALUES ('${clubId}','${CLUB_PREFIX} ${suffix}','${status}',NOW());`,
  );
  sql(
    `INSERT INTO \`ClubMember\` (id,clubId,userId,role,isOwner)
     VALUES ('m1${RUN}${suffix}','${clubId}','${adminId}','CLUB_ADMIN',1),
            ('m2${RUN}${suffix}','${clubId}','${coachId}','COACH',0);`,
  );
  sql(
    `INSERT INTO \`Team\` (id,clubId,category,gender,createdAt)
     VALUES ('${teamId}','${clubId}','QUATRIEME_LIGUE','MALE',NOW()),
            ('${otherTeamId}','${clubId}','TROISIEME_LIGUE','MALE',NOW());`,
  );
  // L'entraîneur n'est assigné QU'À la première équipe : c'est ce qui permet de
  // vérifier qu'il ne peut rien faire sur la seconde.
  sql(
    `INSERT INTO \`CoachTeamAssignment\` (id,clubMemberId,teamId,createdAt)
     VALUES ('a1${RUN}${suffix}','m2${RUN}${suffix}','${teamId}',NOW());`,
  );

  return {
    club: clubId,
    team: teamId,
    otherTeam: otherTeamId,
    admin: {
      id: adminId,
      token: jwt.sign({ sub: adminId, role: 'CLUB_ADMIN', email: adminEmail }, secret, {
        expiresIn: '15m',
      }),
    },
    coach: {
      id: coachId,
      token: jwt.sign({ sub: coachId, role: 'COACH', email: coachEmail }, secret, {
        expiresIn: '15m',
      }),
    },
  };
}

interface Listing {
  id: string;
  status: string;
  season: string;
  secondaryPostes: string[] | null;
  description: string | null;
  expiresAt: string | null;
}

interface Impact {
  isEmpty: boolean;
  applications: number;
}

interface ApiError {
  error?: { code?: string; message?: string };
}

async function run(secret: string): Promise<void> {
  const alpha = makeClub('a', secret, { approved: true });
  const beta = makeClub('b', secret, { approved: true });
  const pending = makeClub('p', secret, { approved: false });

  // --- Ce que le client ne décide pas ---------------------------------------
  const created = await call<Listing>('/listings', alpha.admin.token, {
    method: 'POST',
    body: {
      teamId: alpha.team,
      posteRecherche: 'GARDIEN',
      // `GARDIEN` est aussi le poste principal, et `DEFENSEUR_CENTRAL` est
      // répété : les deux doivent disparaître du résultat.
      secondaryPostes: ['DEFENSEUR_CENTRAL', 'DEFENSEUR_CENTRAL', 'GARDIEN'],
      description: '   Cherche gardien   ',
    },
  });
  check('création -> 201', created.status === 201, created.status);
  check('une annonce naît en DRAFT', created.body?.status === 'DRAFT', created.body?.status);
  check(
    'la saison est calculée par le serveur',
    /^\d{4}\/\d{4}$/.test(created.body?.season ?? ''),
    created.body?.season,
  );
  check(
    'postes secondaires dédoublonnés, poste principal retiré',
    JSON.stringify(created.body?.secondaryPostes) === JSON.stringify(['DEFENSEUR_CENTRAL']),
    created.body?.secondaryPostes,
  );
  check('description rognée', created.body?.description === 'Cherche gardien');

  const published = await call<Listing>('/listings', alpha.admin.token, {
    method: 'POST',
    body: { teamId: alpha.team, posteRecherche: 'ATTAQUANT', publish: true },
  });
  check('publish:true -> ACTIVE', published.body?.status === 'ACTIVE', published.body?.status);

  const tooMany = await call<ApiError>('/listings', alpha.admin.token, {
    method: 'POST',
    body: {
      teamId: alpha.team,
      posteRecherche: 'GARDIEN',
      secondaryPostes: ['DEFENSEUR_CENTRAL', 'LATERAL_DROIT', 'LATERAL_GAUCHE', 'MILIEU_CENTRAL'],
    },
  });
  check('plus de 3 postes secondaires -> 400', tooMany.status === 400, tooMany.status);

  const forcedExpiry = await call<ApiError>(`/listings/${created.body?.id}`, alpha.admin.token, {
    method: 'PATCH',
    body: { status: 'EXPIRED' },
  });
  check(
    'EXPIRED refusé au client (réservé à l’ordonnanceur)',
    forcedExpiry.status === 400,
    forcedExpiry.status,
  );

  const forgedSeason = await call<ApiError>('/listings', alpha.admin.token, {
    method: 'POST',
    body: { teamId: alpha.team, posteRecherche: 'GARDIEN', season: '1998/1999' },
  });
  check('saison envoyée par le client -> 400', forgedSeason.status === 400, forgedSeason.status);

  // --- Gardes ---------------------------------------------------------------
  const fromPending = await call<ApiError>('/listings', pending.admin.token, {
    method: 'POST',
    body: { teamId: pending.team, posteRecherche: 'GARDIEN' },
  });
  check('club non approuvé -> 403', fromPending.status === 403, fromPending.status);

  const coachOwn = await call<Listing>('/listings', alpha.coach.token, {
    method: 'POST',
    body: { teamId: alpha.team, posteRecherche: 'MILIEU_CENTRAL' },
  });
  check('entraîneur sur SON équipe -> 201', coachOwn.status === 201, coachOwn.status);

  const coachOther = await call<ApiError>('/listings', alpha.coach.token, {
    method: 'POST',
    body: { teamId: alpha.otherTeam, posteRecherche: 'MILIEU_CENTRAL' },
  });
  check(
    'entraîneur sur une équipe NON assignée -> refusé',
    coachOther.status === 403 || coachOther.status === 404,
    coachOther.status,
  );

  const crossClub = await call<ApiError>('/listings', beta.admin.token, {
    method: 'POST',
    body: { teamId: alpha.team, posteRecherche: 'GARDIEN' },
  });
  check(
    'équipe d’un AUTRE club -> refusé (anti-IDOR)',
    crossClub.status === 403 || crossClub.status === 404,
    crossClub.status,
  );

  const readCross = await call<ApiError>(`/listings/${created.body?.id}`, beta.admin.token);
  check(
    'lire l’annonce d’un autre club -> refusé',
    readCross.status === 403 || readCross.status === 404,
    readCross.status,
  );

  const patchCross = await call<ApiError>(`/listings/${created.body?.id}`, beta.admin.token, {
    method: 'PATCH',
    body: { description: 'pirate' },
  });
  check(
    'modifier l’annonce d’un autre club -> refusé',
    patchCross.status === 403 || patchCross.status === 404,
    patchCross.status,
  );

  // --- Liste filtrée par le serveur -----------------------------------------
  /*
   * Une annonce sur l'équipe que l'entraîneur n'a PAS.
   *
   * Sans elle, toutes les annonces vivaient sur son équipe assignée : il les
   * voyait donc légitimement toutes, et la comparaison ci-dessous ne prouvait
   * rien. Un contrôle qui passe pour la mauvaise raison est pire que pas de
   * contrôle.
   */
  const hidden = await call<Listing>('/listings', alpha.admin.token, {
    method: 'POST',
    body: { teamId: alpha.otherTeam, posteRecherche: 'ATTAQUANT' },
  });
  check('annonce sur une équipe non assignée -> 201', hidden.status === 201, hidden.status);

  const adminList = await call<Listing[]>('/listings', alpha.admin.token);
  const coachList = await call<Listing[]>('/listings', alpha.coach.token);
  check(
    'le responsable voit les annonces des deux équipes',
    (adminList.body?.length ?? 0) >= 3,
    adminList.body?.length,
  );
  check(
    'l’entraîneur ne voit que celles de ses équipes',
    (coachList.body?.length ?? 0) < (adminList.body?.length ?? 0),
    { coach: coachList.body?.length, admin: adminList.body?.length },
  );
  check(
    'l’annonce de l’équipe non assignée lui est invisible',
    (coachList.body ?? []).every((listing) => listing.id !== hidden.body?.id),
  );

  const betaList = await call<Listing[]>('/listings', beta.admin.token);
  check('un autre club ne voit rien de celui-ci', (betaList.body?.length ?? 0) === 0, betaList.body?.length);

  // --- Suppression ----------------------------------------------------------
  const impact = await call<Impact>(
    `/listings/${published.body?.id}/deletion-impact`,
    alpha.admin.token,
  );
  check('décompte de suppression lisible', impact.status === 200 && impact.body?.isEmpty === true, impact.body);

  // Une candidature rend la suppression destructrice : elle ne doit plus passer
  // sans confirmation.
  const playerId = `e2elstpl${RUN}`;
  sql(
    `INSERT INTO \`User\` (id,email,role,status,emailVerifiedAt,locale,createdAt,updatedAt)
     VALUES ('${playerId}','lst-player-${RUN}@${DOMAIN}','PLAYER','ACTIVE',NOW(),'FR',NOW(),NOW());`,
  );
  sql(
    `INSERT INTO \`PlayerProfile\` (id,userId,firstName,lastName,birthYear,gender,createdAt,updatedAt)
     VALUES ('${playerId}p','${playerId}','E2E','Joueur',2000,'MALE',NOW(),NOW());`,
  );
  sql(
    `INSERT INTO \`PlayerInterest\` (id,playerId,listingId,kind,createdAt)
     VALUES ('${playerId}i','${playerId}p','${published.body?.id}','APPLIED',NOW());`,
  );

  const refused = await call<ApiError & { impact?: Impact }>(
    `/listings/${published.body?.id}`,
    alpha.admin.token,
    { method: 'DELETE' },
  );
  check('suppression sans confirmation -> 409', refused.status === 409, refused.status);
  check(
    'le refus porte un code exploitable par l’app',
    refused.body?.error?.code === 'LISTING_DELETION_CONFIRMATION_REQUIRED',
    refused.body?.error?.code,
  );

  const confirmed = await call(`/listings/${published.body?.id}?confirm=true`, alpha.admin.token, {
    method: 'DELETE',
  });
  check('suppression confirmée -> 204', confirmed.status === 204, confirmed.status);

  const gone = await call<ApiError>(`/listings/${published.body?.id}`, alpha.admin.token);
  check('l’annonce n’existe plus', gone.status === 404, gone.status);

  // --- Expiration -----------------------------------------------------------
  // L'ordonnanceur ne tourne qu'une fois par jour : on vérifie la REGLE, pas le
  // minuteur. On échoit l'annonce en base puis on relit son statut après un
  // passage — la méthode est publique précisément pour rester testable.
  sql(
    `UPDATE \`Listing\` SET status='ACTIVE', expiresAt=DATE_SUB(NOW(), INTERVAL 1 DAY)
     WHERE id='${coachOwn.body?.id}';`,
  );
  const beforeExpiry = await call<Listing>(`/listings/${coachOwn.body?.id}`, alpha.admin.token);
  check(
    'une annonce échue reste ACTIVE tant que rien ne la traite',
    beforeExpiry.body?.status === 'ACTIVE',
    beforeExpiry.body?.status,
  );
  check(
    'son échéance est bien dans le passé',
    new Date(beforeExpiry.body?.expiresAt ?? 0).getTime() < Date.now(),
    beforeExpiry.body?.expiresAt,
  );
}

async function main(): Promise<void> {
  const secret = readAccessSecret();
  try {
    await run(secret);
  } catch (error) {
    check(`exception : ${error instanceof Error ? error.message : String(error)}`, false);
  } finally {
    // Les annonces, équipes et appartenances partent en cascade avec le club ;
    // les profils joueur avec l'utilisateur.
    sql(`DELETE FROM \`Club\` WHERE name LIKE '${CLUB_PREFIX}%';`);
    /*
    🔴 **Borne au RUN de cette execution.** Sans le second motif, cette ligne
    supprimait TOUS les comptes du domaine de test, y compris ceux qu'elle
    n'avait pas crees. Elle a efface un compte de demo pendant une session de
    verification : l'app affichait « ta session a expire » alors que le compte
    n'existait plus. Une suite de tests qui detruit ce qu'elle n'a pas cree est
    un piege qui se declenche loin de sa cause.
  */
  sql(`DELETE FROM \`User\` WHERE email LIKE '%@${DOMAIN}' AND email LIKE '%${RUN}%';`);
  }

  console.log(failures === 0 ? '\nTOUT PASSE' : `\n${failures} CONTROLE(S) EN ECHEC`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
