/**
 * Vérification end-to-end des interactions (phase 7).
 *
 * Lancement (depuis la racine du dépôt) :
 *   pnpm --filter @footlink/api exec tsx <chemin ABSOLU vers ce fichier>
 *
 * 🔴 **Le contrôle central de cette suite est celui du `SAVED`.** Enregistrer
 * est un signet PRIVÉ : personne n'est notifié, et surtout un enregistrement ne
 * doit JAMAIS produire de `Match`, même si le club, de son côté, a retenu le
 * joueur. Si cette règle cède, quelqu'un qui met une annonce « de côté pour y
 * réfléchir » se retrouve en conversation avec un club sans l'avoir voulu —
 * exactement ce que le produit promet de ne pas faire.
 *
 * Les autres pièges couverts ici :
 *
 * - postuler deux fois ne doit ni dupliquer ni renotifier ;
 * - enregistrer par-dessus une candidature la RETIRERAIT en silence : refusé ;
 * - retirer après un `Match` laisserait une conversation orpheline : refusé ;
 * - postuler à une annonce qu'on ne peut pas voir (hors rayon, club non validé,
 *   blocage) est un IDOR : 404, jamais 403 — un 403 confirmerait l'existence.
 *
 * Comptes et clubs vivent sur @e2e.footlink.test et sont supprimés à la fin, y
 * compris si un contrôle échoue.
 *
 * Note : les écritures de fixtures passent par la CLI Prisma (`db execute`) et
 * non par `@prisma/client` — un script hors d'`apps/api` ne résout pas le même
 * client généré (contrepartie du `nodeLinker: hoisted`, cf. HANDOFF §7).
 */
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000/api/v1';
const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const RUN = Date.now().toString(36).slice(-6);
const DOMAIN = 'e2e.footlink.test';

const GRIMISUAT = { lat: 46.2645, lng: 7.3898 };
const SION = { lat: 46.2331, lng: 7.3606 };
const LAUSANNE = { lat: 46.5197, lng: 6.6323 };

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

const env = Object.fromEntries(
  readFileSync(resolve(REPO_ROOT, 'apps/api/.env'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

function tokenFor(userId: string, role: string): string {
  return jwt.sign(
    { sub: userId, email: `${userId}@${DOMAIN}`, role },
    env.JWT_ACCESS_SECRET as string,
    { expiresIn: '10m' },
  );
}

interface Json {
  status: number;
  body: unknown;
}

async function call(token: string, method: string, path: string): Promise<Json> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  return { status: res.status, body: text.length > 0 ? JSON.parse(text) : null };
}

/** La saison vient du helper partagé — jamais recopiée (cf. tools/e2e/feed.ts). */
interface SharedSeason {
  getCurrentSeasonLabel: (date: Date) => string;
  getSeasonStartYear: (date: Date) => number;
}
const shared = createRequire(import.meta.url)(
  resolve(REPO_ROOT, 'packages/shared/dist/index.js'),
) as SharedSeason;

const season = shared.getCurrentSeasonLabel(new Date());
const birthYear = shared.getSeasonStartYear(new Date()) - 28;

/** Compte les notifications d'un type pour un utilisateur, via l'API interne. */
async function countNotifications(userId: string, type: string): Promise<number> {
  const rows = await query(
    `SELECT COUNT(*) AS n FROM Notification WHERE userId = '${userId}' AND type = '${type}'`,
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * `prisma db execute` n'affiche pas de résultat : pour LIRE, on passe par le
 * client généré, chargé par son chemin dans `apps/api` (même raison que pour le
 * paquet partagé).
 */
interface PrismaLike {
  $queryRawUnsafe: (sql: string) => Promise<Record<string, unknown>[]>;
  $disconnect: () => Promise<void>;
}
const { PrismaClient } = createRequire(resolve(REPO_ROOT, 'apps/api/package.json'))(
  '@prisma/client',
) as { PrismaClient: new () => PrismaLike };
const prisma = new PrismaClient();

function query(statement: string): Promise<Record<string, unknown>[]> {
  return prisma.$queryRawUnsafe(statement);
}

function seed(): void {
  sql(`
    INSERT INTO \`User\` (id,email,role,status,emailVerifiedAt,locale,createdAt,updatedAt) VALUES
      ('ia${RUN}','i-admin-${RUN}@${DOMAIN}','CLUB_ADMIN','ACTIVE',NOW(),'FR',NOW(),NOW()),
      ('ic${RUN}','i-coach-${RUN}@${DOMAIN}','COACH','ACTIVE',NOW(),'FR',NOW(),NOW()),
      ('ip1${RUN}','i-p1-${RUN}@${DOMAIN}','PLAYER','ACTIVE',NOW(),'FR',NOW(),NOW()),
      ('ip2${RUN}','i-p2-${RUN}@${DOMAIN}','PLAYER','ACTIVE',NOW(),'FR',NOW(),NOW()),
      ('ip3${RUN}','i-p3-${RUN}@${DOMAIN}','PLAYER','ACTIVE',NOW(),'FR',NOW(),NOW());
  `);
  sql(`
    INSERT INTO \`Club\` (id,name,status,canton,locality,lat,lng,updatedAt) VALUES
      ('icl${RUN}','FC E2E INTER ${RUN}','APPROVED','VS','Grimisuat',${GRIMISUAT.lat},${GRIMISUAT.lng},NOW());
  `);
  sql(`
    INSERT INTO \`ClubMember\` (id,clubId,userId,role,isOwner) VALUES
      ('im${RUN}','icl${RUN}','ia${RUN}','CLUB_ADMIN',1),
      ('imc${RUN}','icl${RUN}','ic${RUN}','COACH',0);
  `);
  sql(`
    INSERT INTO \`Team\` (id,clubId,category,gender,createdAt) VALUES
      ('it1${RUN}','icl${RUN}','DEUXIEME_LIGUE','MALE',NOW()),
      ('it2${RUN}','icl${RUN}','TROISIEME_LIGUE','MALE',NOW());
  `);
  sql(`
    INSERT INTO \`Listing\` (id,teamId,posteRecherche,secondaryPostes,status,season,createdAt,updatedAt) VALUES
      ('il1${RUN}','it1${RUN}','GARDIEN',NULL,'ACTIVE','${season}',NOW(),NOW()),
      ('il2${RUN}','it2${RUN}','GARDIEN',NULL,'ACTIVE','${season}',NOW(),NOW());
  `);
  sql(`
    INSERT INTO \`PlayerProfile\`
      (id,userId,firstName,lastName,birthYear,gender,isMinor,isSeekingClub,isVisible,searchRadiusKm,canton,locality,lat,lng,hideCurrentClub,updatedAt) VALUES
      ('iq1${RUN}','ip1${RUN}','Actif','Sion',${birthYear},'MALE',0,1,1,50,'VS','Sion',${SION.lat},${SION.lng},0,NOW()),
      ('iq2${RUN}','ip2${RUN}','Garde','Sion',${birthYear},'MALE',0,1,1,50,'VS','Sion',${SION.lat},${SION.lng},0,NOW()),
      ('iq3${RUN}','ip3${RUN}','Loin','Lausanne',${birthYear},'MALE',0,1,1,10,'VD','Lausanne',${LAUSANNE.lat},${LAUSANNE.lng},0,NOW());
  `);
  sql(`
    INSERT INTO \`PlayerPosition\` (id,playerId,poste,isPrimary) VALUES
      ('iz1${RUN}','iq1${RUN}','GARDIEN',1),
      ('iz2${RUN}','iq2${RUN}','GARDIEN',1),
      ('iz3${RUN}','iq3${RUN}','GARDIEN',1);
  `);
}

function cleanup(): void {
  sql(`
    DELETE FROM \`Notification\` WHERE userId LIKE 'i%${RUN}';
    DELETE FROM \`ConversationRead\` WHERE userId LIKE 'i%${RUN}';
    DELETE FROM \`Message\` WHERE conversationId IN (
      SELECT id FROM Conversation WHERE matchId IN (SELECT id FROM \`Match\` WHERE listingId LIKE 'il%${RUN}')
    );
    DELETE FROM \`Conversation\` WHERE matchId IN (SELECT id FROM \`Match\` WHERE listingId LIKE 'il%${RUN}');
    DELETE FROM \`Match\` WHERE listingId LIKE 'il%${RUN}';
    DELETE FROM \`ListingDismissal\` WHERE playerId LIKE 'iq%${RUN}';
    DELETE FROM \`PlayerInterest\` WHERE playerId LIKE 'iq%${RUN}';
    DELETE FROM \`ClubInterest\` WHERE playerId LIKE 'iq%${RUN}';
    DELETE FROM \`Block\` WHERE blockerUserId LIKE 'i%${RUN}' OR blockedUserId LIKE 'i%${RUN}';
    DELETE FROM \`Listing\` WHERE id LIKE 'il%${RUN}';
    DELETE FROM \`PlayerPosition\` WHERE id LIKE 'iz%${RUN}';
    DELETE FROM \`PlayerProfile\` WHERE id LIKE 'iq%${RUN}';
    DELETE FROM \`CoachTeamAssignment\` WHERE clubMemberId LIKE 'im%${RUN}';
    DELETE FROM \`Team\` WHERE id LIKE 'it%${RUN}';
    DELETE FROM \`ClubMember\` WHERE id LIKE 'im%${RUN}';
    DELETE FROM \`Club\` WHERE id LIKE 'ic%${RUN}' OR id LIKE 'icl${RUN}' OR id LIKE 'icx${RUN}';
    DELETE FROM \`User\` WHERE email LIKE '%${RUN}@${DOMAIN}';
  `);
}

async function main(): Promise<void> {
  seed();
  try {
    const p1 = tokenFor(`ip1${RUN}`, 'PLAYER');
    const p2 = tokenFor(`ip2${RUN}`, 'PLAYER');
    const p3 = tokenFor(`ip3${RUN}`, 'PLAYER');
    const admin = tokenFor(`ia${RUN}`, 'CLUB_ADMIN');
    const coach = tokenFor(`ic${RUN}`, 'COACH');

    // --- Enregistrer : un signet, et RIEN d'autre --------------------------
    const saved = await call(p1, 'POST', `/interactions/listings/il1${RUN}/save`);
    check('enregistrer repond 204', saved.status === 204, saved);

    const savedRows = await query(
      `SELECT kind FROM PlayerInterest WHERE playerId = 'iq1${RUN}' AND listingId = 'il1${RUN}'`,
    );
    check('enregistrer ecrit bien un SAVED', savedRows[0]?.kind === 'SAVED', savedRows);

    check(
      '🔴 enregistrer ne notifie PERSONNE',
      (await countNotifications(`ia${RUN}`, 'APPLICATION')) === 0,
    );

    const feedAfterSave = await call(p1, 'GET', '/feed/listings?limit=50');
    const feedIds = (feedAfterSave.body as { id: string }[]).map((x) => x.id);
    check('une annonce enregistree sort du feed', !feedIds.includes(`il1${RUN}`), feedIds);

    const mineSaved = await call(p1, 'GET', '/interactions/mine?kind=SAVED');
    const savedList = mineSaved.body as { id: string; kind: string; matched: boolean }[];
    check(
      '…mais se retrouve dans « Enregistrees »',
      savedList.length === 1 && savedList[0]?.id === `il1${RUN}`,
      savedList,
    );
    check('elle n’est pas marquee comme un match', savedList[0]?.matched === false);

    // --- Le club retient ce joueur : toujours PAS de match -----------------
    const like = await call(admin, 'POST', `/interactions/listings/il1${RUN}/players/iq1${RUN}/like`);
    check('le club peut retenir un joueur', like.status === 200, like);
    check(
      '🔴 SAVED + interet du club ne fait PAS de match',
      (like.body as { matched: boolean }).matched === false,
      like.body,
    );
    const noMatch = await query(
      `SELECT COUNT(*) AS n FROM \`Match\` WHERE listingId = 'il1${RUN}' AND playerId = 'iq1${RUN}'`,
    );
    check('…et aucun Match en base', Number(noMatch[0]?.n) === 0, noMatch);
    check(
      'le joueur est notifie de l’interet du club',
      (await countNotifications(`ip1${RUN}`, 'CLUB_INTEREST')) === 1,
    );

    // --- Enregistrer par-dessus une candidature : refusé -------------------
    const applied = await call(p1, 'POST', `/interactions/listings/il1${RUN}/apply`);
    check('postuler par-dessus un enregistrement passe', applied.status === 200, applied);
    check(
      '🔴 le match se fait quand les DEUX cotes ont postule',
      (applied.body as { matched: boolean }).matched === true,
      applied.body,
    );
    const conv = await query(
      `SELECT c.id AS id FROM Conversation c JOIN \`Match\` m ON m.id = c.matchId
       WHERE m.listingId = 'il1${RUN}' AND m.playerId = 'iq1${RUN}'`,
    );
    check('une conversation est creee avec le match', conv.length === 1, conv);
    check(
      'les deux cotes sont notifies du match',
      (await countNotifications(`ip1${RUN}`, 'MATCH')) === 1 &&
        (await countNotifications(`ia${RUN}`, 'MATCH')) === 1,
    );

    const reSave = await call(p1, 'POST', `/interactions/listings/il1${RUN}/save`);
    check(
      '🔴 enregistrer par-dessus une candidature est REFUSE',
      reSave.status === 409,
      reSave,
    );

    // --- Retirer après un match : refusé -----------------------------------
    const removeMatched = await call(p1, 'DELETE', `/interactions/listings/il1${RUN}`);
    check('retirer apres un match est refuse', removeMatched.status === 409, removeMatched);

    /*
      --- Postuler : notification, idempotence, retour dans le feed ---------

      ⚠️ On mesure un ECART, pas un total : l'administrateur a deja recu une
      notification pour la candidature precedente. Un compteur absolu passait
      par hasard tant qu'il n'y avait qu'une candidature dans la suite, et
      cassait des qu'on en ajoutait une — le test aurait alors accuse le code.
    */
    const appliedBefore = await countNotifications(`ia${RUN}`, 'APPLICATION');
    const apply2 = await call(p2, 'POST', `/interactions/listings/il2${RUN}/apply`);
    check('postuler repond 200', apply2.status === 200, apply2);
    check('postuler seul ne fait pas de match', (apply2.body as { matched: boolean }).matched === false);
    check(
      'le club est notifie de la candidature',
      (await countNotifications(`ia${RUN}`, 'APPLICATION')) === appliedBefore + 1,
    );
    check(
      '⚠️ un entraineur NON assigne n’est pas notifie',
      (await countNotifications(`ic${RUN}`, 'APPLICATION')) === 0,
    );

    await call(p2, 'POST', `/interactions/listings/il2${RUN}/apply`);
    check(
      'repostuler ne renotifie pas',
      (await countNotifications(`ia${RUN}`, 'APPLICATION')) === appliedBefore + 1,
    );

    const removed = await call(p2, 'DELETE', `/interactions/listings/il2${RUN}`);
    check('retirer sa candidature repond 204', removed.status === 204, removed);
    const feedBack = await call(p2, 'GET', '/feed/listings?limit=50');
    check(
      'l’annonce retiree redevient proposable',
      (feedBack.body as { id: string }[]).some((x) => x.id === `il2${RUN}`),
    );

    // --- Le rejet, et son annulation ---------------------------------------
    await call(p2, 'POST', `/feed/listings/il2${RUN}/dismiss`);
    const afterDismiss = await call(p2, 'GET', '/feed/listings?limit=50');
    check(
      'une annonce ecartee sort du feed',
      !(afterDismiss.body as { id: string }[]).some((x) => x.id === `il2${RUN}`),
    );
    const undo = await call(p2, 'DELETE', `/feed/listings/il2${RUN}/dismiss`);
    check('annuler le rejet repond 204', undo.status === 204, undo);
    const afterUndo = await call(p2, 'GET', '/feed/listings?limit=50');
    check(
      '🔴 l’annonce revient apres annulation',
      (afterUndo.body as { id: string }[]).some((x) => x.id === `il2${RUN}`),
    );

    await call(p2, 'POST', `/feed/listings/il2${RUN}/dismiss`);
    await call(p2, 'POST', `/interactions/listings/il2${RUN}/apply`);
    const dismissLeft = await query(
      `SELECT COUNT(*) AS n FROM ListingDismissal WHERE playerId = 'iq2${RUN}' AND listingId = 'il2${RUN}'`,
    );
    check('postuler efface un rejet precedent', Number(dismissLeft[0]?.n) === 0, dismissLeft);

    // --- Anti-IDOR ---------------------------------------------------------
    const tooFar = await call(p3, 'POST', `/interactions/listings/il1${RUN}/apply`);
    check(
      '🔴 postuler hors de son rayon : 404, pas 403',
      tooFar.status === 404,
      tooFar,
    );

    sql(
      `INSERT INTO \`Block\` (id,blockerUserId,blockedUserId,createdAt)
       VALUES ('ib1${RUN}','ia${RUN}','ip2${RUN}',NOW());`,
    );
    const blocked = await call(p2, 'POST', `/interactions/listings/il2${RUN}/save`);
    check('un joueur bloque par le club ne peut plus agir', blocked.status === 404, blocked);
    sql(`DELETE FROM \`Block\` WHERE id = 'ib1${RUN}';`);

    // --- Cote club : la garde des equipes ----------------------------------
    const coachLike = await call(
      coach,
      'POST',
      `/interactions/listings/il1${RUN}/players/iq1${RUN}/like`,
    );
    check(
      '⚠️ un entraineur sans equipe assignee ne peut pas retenir',
      coachLike.status === 403,
      coachLike,
    );

    const likes = await call(admin, 'GET', `/interactions/listings/il1${RUN}/likes`);
    check(
      'le club retrouve qui il a deja retenu',
      (likes.body as string[]).includes(`iq1${RUN}`),
      likes.body,
    );

    const unlikeMatched = await call(
      admin,
      'DELETE',
      `/interactions/listings/il1${RUN}/players/iq1${RUN}/like`,
    );
    check('le club ne peut pas se retracter apres un match', unlikeMatched.status === 409, unlikeMatched);
  } finally {
    cleanup();
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? '\nTOUT PASSE' : `\n${failures} CONTROLE(S) EN ECHEC`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
