/**
 * Vérification end-to-end du feed (phase 6).
 *
 * Lancement (depuis la racine du dépôt) :
 *   pnpm --filter @footlink/api exec tsx <chemin ABSOLU vers ce fichier>
 *
 * 🔴 **C'est la suite la plus importante du dépôt à ce jour.** Le feed est
 * écrit en SQL brut : ni le typage ni le typecheck ne protègent quoi que ce
 * soit ici. Une erreur de jointure, un `JSON_CONTAINS` mal formé ou un haversine
 * approximatif produisent un feed *plausible* mais faux — et un feed faux ne se
 * remarque pas, il déçoit lentement.
 *
 * Les fixtures utilisent des coordonnées RÉELLES, pour que les distances soient
 * vérifiables à la main :
 *
 *   Grimisuat  46.2645 / 7.3898   (le club)
 *   Sion       46.2331 / 7.3606   ≈ 4 km
 *   Martigny   46.1028 / 7.0722   ≈ 30 km
 *   Lausanne   46.5197 / 6.6323   ≈ 65 km
 *
 * Variables :
 *   E2E_BASE  URL de base de l'API (défaut http://localhost:3000/api/v1)
 *
 * Comptes et clubs vivent sur @e2e.footlink.test et sont supprimés à la fin, y
 * compris si un contrôle échoue.
 *
 * Note : les écritures passent par la CLI Prisma (`db execute`) et non par
 * `@prisma/client` — un script hors d'`apps/api` ne résout pas le même client
 * généré (contrepartie du `nodeLinker: hoisted`, cf. HANDOFF §7).
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
const CLUB_PREFIX = `FC E2E FEED ${RUN}`;

const GRIMISUAT = { lat: 46.2645, lng: 7.3898 };
const SION = { lat: 46.2331, lng: 7.3606 };
const MARTIGNY = { lat: 46.1028, lng: 7.0722 };
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

interface FeedItem {
  id: string;
  matchKind: string;
  matchedPoste: string;
  distanceKm: number;
  posteRecherche?: string;
  firstName?: string;
}

async function feed(token: string, path: string): Promise<{ status: number; items: FeedItem[] }> {
  const res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } });
  const body: unknown = await res.json().catch(() => null);
  return { status: res.status, items: Array.isArray(body) ? (body as FeedItem[]) : [] };
}

/**
 * 🔴 **La saison vient du helper partagé, elle n'est PAS recalculée ici.**
 *
 * Elle l'était, avec une bascule au 1er juillet — le vrai seuil est le 1er août.
 * Le 28 juillet, la fixture insérait donc des annonces en « 2026/2027 » que le
 * serveur ne cherchait pas, et le feed joueur revenait vide : huit contrôles au
 * rouge pour un code parfaitement correct. Une règle métier recopiée dans un
 * test finit par tester le test.
 *
 * ⚠️ Le paquet est chargé par son CHEMIN COMPILÉ et non par son nom : depuis
 * `tools/`, `@footlink/shared` ne se résout pas — c'est un paquet du workspace,
 * lié dans `apps/api/node_modules` et non à la racine (contrepartie du
 * `nodeLinker: hoisted`, cf. HANDOFF §7). C'est aussi pour ça que les autres
 * suites n'importent rien du workspace.
 */
interface SharedSeason {
  getCurrentSeasonLabel: (date: Date) => string;
  getSeasonStartYear: (date: Date) => number;
}

// `createRequire` et non `await import` : le script est transpile en CommonJS,
// ou l'await de premier niveau n'existe pas.
const shared = createRequire(import.meta.url)(
  resolve(REPO_ROOT, 'packages/shared/dist/index.js'),
) as SharedSeason;

function currentSeason(): string {
  return shared.getCurrentSeasonLabel(new Date());
}

/** Année de naissance d'un actif : 28 ans à la saison en cours. */
function adultBirthYear(): number {
  return shared.getSeasonStartYear(new Date()) - 28;
}

function seed(): void {
  const season = currentSeason();
  const birthYear = adultBirthYear();

  // --- Deux clubs : l'un validé, l'autre en attente -------------------------
  sql(`
    INSERT INTO \`User\` (id,email,role,status,emailVerifiedAt,locale,createdAt,updatedAt) VALUES
      ('fda${RUN}','fd-admin-${RUN}@${DOMAIN}','CLUB_ADMIN','ACTIVE',NOW(),'FR',NOW(),NOW()),
      ('fdb${RUN}','fd-admin2-${RUN}@${DOMAIN}','CLUB_ADMIN','ACTIVE',NOW(),'FR',NOW(),NOW()),
      ('fp1${RUN}','fd-p1-${RUN}@${DOMAIN}','PLAYER','ACTIVE',NOW(),'FR',NOW(),NOW()),
      ('fp2${RUN}','fd-p2-${RUN}@${DOMAIN}','PLAYER','ACTIVE',NOW(),'FR',NOW(),NOW()),
      ('fp3${RUN}','fd-p3-${RUN}@${DOMAIN}','PLAYER','ACTIVE',NOW(),'FR',NOW(),NOW()),
      ('fp4${RUN}','fd-p4-${RUN}@${DOMAIN}','PLAYER','ACTIVE',NOW(),'FR',NOW(),NOW());
  `);
  sql(`
    INSERT INTO \`Club\` (id,name,status,canton,locality,lat,lng,updatedAt) VALUES
      ('fc1${RUN}','${CLUB_PREFIX} OK','APPROVED','VS','Grimisuat',${GRIMISUAT.lat},${GRIMISUAT.lng},NOW()),
      ('fc2${RUN}','${CLUB_PREFIX} PENDING','PENDING','VS','Grimisuat',${GRIMISUAT.lat},${GRIMISUAT.lng},NOW());
  `);
  sql(`
    INSERT INTO \`ClubMember\` (id,clubId,userId,role,isOwner) VALUES
      ('fm1${RUN}','fc1${RUN}','fda${RUN}','CLUB_ADMIN',1),
      ('fm2${RUN}','fc2${RUN}','fdb${RUN}','CLUB_ADMIN',1);
  `);
  // Équipes : masculine 4e ligue, féminine 4e ligue, et une catégorie junior
  // qu'un adulte ne peut pas jouer.
  sql(`
    INSERT INTO \`Team\` (id,clubId,category,gender,createdAt) VALUES
      ('ft1${RUN}','fc1${RUN}','QUATRIEME_LIGUE','MALE',NOW()),
      ('ft2${RUN}','fc1${RUN}','QUATRIEME_LIGUE_F','FEMALE',NOW()),
      ('ft3${RUN}','fc1${RUN}','JUNIORS_C','MALE',NOW()),
      ('ft4${RUN}','fc2${RUN}','QUATRIEME_LIGUE','MALE',NOW());
  `);
  /*
   * Annonces. Les statuts non publiés et la saison passée sont là pour vérifier
   * qu'ils ne remontent JAMAIS — un brouillon visible dans le feed serait une
   * fuite, pas un défaut d'affichage.
   */
  sql(`
    INSERT INTO \`Listing\` (id,teamId,posteRecherche,secondaryPostes,status,season,createdAt,updatedAt) VALUES
      ('fl1${RUN}','ft1${RUN}','GARDIEN',NULL,'ACTIVE','${season}',NOW(),NOW()),
      ('fl2${RUN}','ft1${RUN}','ATTAQUANT','["GARDIEN"]','ACTIVE','${season}',NOW(),NOW()),
      ('fl3${RUN}','ft1${RUN}','MILIEU_CENTRAL',NULL,'DRAFT','${season}',NOW(),NOW()),
      ('fl4${RUN}','ft1${RUN}','DEFENSEUR_CENTRAL',NULL,'EXPIRED','${season}',NOW(),NOW()),
      ('fl5${RUN}','ft1${RUN}','LATERAL_DROIT',NULL,'ACTIVE','2000/2001',NOW(),NOW()),
      ('fl6${RUN}','ft2${RUN}','GARDIEN',NULL,'ACTIVE','${season}',NOW(),NOW()),
      ('fl7${RUN}','ft3${RUN}','GARDIEN',NULL,'ACTIVE','${season}',NOW(),NOW()),
      ('fl8${RUN}','ft4${RUN}','GARDIEN',NULL,'ACTIVE','${season}',NOW(),NOW());
  `);
  /*
   * Joueurs, tous gardiens masculins et adultes — seule la POSITION et le RAYON
   * changent, pour isoler ce qui est mesuré.
   */
  sql(`
    INSERT INTO \`PlayerProfile\`
      (id,userId,firstName,lastName,birthYear,gender,isMinor,isSeekingClub,isVisible,searchRadiusKm,canton,locality,lat,lng,hideCurrentClub,updatedAt) VALUES
      ('fq1${RUN}','fp1${RUN}','Proche','Sion',${birthYear},'MALE',0,1,1,25,'VS','Sion',${SION.lat},${SION.lng},0,NOW()),
      ('fq2${RUN}','fp2${RUN}','Loin','Lausanne',${birthYear},'MALE',0,1,1,25,'VD','Lausanne',${LAUSANNE.lat},${LAUSANNE.lng},0,NOW()),
      ('fq3${RUN}','fp3${RUN}','Large','Lausanne',${birthYear},'MALE',0,1,1,200,'VD','Lausanne',${LAUSANNE.lat},${LAUSANNE.lng},0,NOW()),
      ('fq4${RUN}','fp4${RUN}','Discret','Martigny',${birthYear},'MALE',0,1,0,200,'VS','Martigny',${MARTIGNY.lat},${MARTIGNY.lng},0,NOW());
  `);
  sql(`
    INSERT INTO \`PlayerPosition\` (id,playerId,poste,isPrimary) VALUES
      ('fz1${RUN}','fq1${RUN}','GARDIEN',1),
      ('fz2${RUN}','fq2${RUN}','GARDIEN',1),
      ('fz3${RUN}','fq3${RUN}','GARDIEN',1),
      ('fz4${RUN}','fq4${RUN}','GARDIEN',1);
  `);
}

function cleanup(): void {
  sql(`
    DELETE FROM \`PlayerInterest\` WHERE playerId LIKE 'fq%${RUN}';
    DELETE FROM \`ClubInterest\` WHERE playerId LIKE 'fq%${RUN}';
    DELETE FROM \`Block\` WHERE blockerUserId LIKE 'f%${RUN}' OR blockedUserId LIKE 'f%${RUN}';
    DELETE FROM \`Listing\` WHERE id LIKE 'fl%${RUN}';
    DELETE FROM \`PlayerPosition\` WHERE id LIKE 'fz%${RUN}';
    DELETE FROM \`PlayerProfile\` WHERE id LIKE 'fq%${RUN}';
    DELETE FROM \`Team\` WHERE id LIKE 'ft%${RUN}';
    DELETE FROM \`ClubMember\` WHERE id LIKE 'fm%${RUN}';
    DELETE FROM \`Club\` WHERE id LIKE 'fc%${RUN}';
    DELETE FROM \`User\` WHERE email LIKE '%${RUN}@${DOMAIN}';
  `);
}

async function main(): Promise<void> {
  seed();
  try {
    const proche = tokenFor(`fp1${RUN}`, 'PLAYER');
    const loin = tokenFor(`fp2${RUN}`, 'PLAYER');
    const large = tokenFor(`fp3${RUN}`, 'PLAYER');
    const admin = tokenFor(`fda${RUN}`, 'CLUB_ADMIN');

    // --- Le feed du joueur -------------------------------------------------
    const near = await feed(proche, '/feed/listings?limit=50');
    check('le feed répond', near.status === 200, near.status);
    const ids = near.items.map((item) => item.id);

    check('annonce publiée au poste principal : proposée', ids.includes(`fl1${RUN}`));
    check('annonce qui ACCEPTE le poste en secondaire : proposée', ids.includes(`fl2${RUN}`));

    check('brouillon jamais proposé', !ids.includes(`fl3${RUN}`));
    check('annonce échue jamais proposée', !ids.includes(`fl4${RUN}`));
    check('saison passée jamais proposée', !ids.includes(`fl5${RUN}`));
    check('équipe féminine invisible d’un joueur masculin', !ids.includes(`fl6${RUN}`));
    check('catégorie junior invisible d’un adulte', !ids.includes(`fl7${RUN}`));
    check('club non validé jamais proposé', !ids.includes(`fl8${RUN}`));

    // --- Pertinence et distance -------------------------------------------
    const exact = near.items.find((item) => item.id === `fl1${RUN}`);
    const accepte = near.items.find((item) => item.id === `fl2${RUN}`);
    check(
      'le poste cherché exactement est annoncé comme tel',
      exact?.matchKind === 'POSTE_PRINCIPAL',
      exact?.matchKind,
    );
    check(
      'le poste seulement accepté est annoncé comme tel',
      accepte?.matchKind === 'POSTE_ACCEPTE',
      accepte?.matchKind,
    );
    check(
      'le poste cherché exactement passe AVANT celui qui est juste accepté',
      ids.indexOf(`fl1${RUN}`) < ids.indexOf(`fl2${RUN}`),
      ids,
    );
    check(
      'la distance Sion -> Grimisuat est plausible (2 à 8 km)',
      exact !== undefined && exact.distanceKm >= 2 && exact.distanceKm <= 8,
      exact?.distanceKm,
    );

    // --- Le rayon ----------------------------------------------------------
    const tooFar = await feed(loin, '/feed/listings?limit=50');
    check(
      'hors du rayon du joueur : rien',
      tooFar.status === 200 && !tooFar.items.some((item) => item.id === `fl1${RUN}`),
      tooFar.items.length,
    );
    const wide = await feed(large, '/feed/listings?limit=50');
    const wideNear = wide.items.find((item) => item.id === `fl1${RUN}`);
    check('avec un rayon large : proposée', wideNear !== undefined);
    check(
      'la distance Lausanne -> Grimisuat est plausible (55 à 80 km)',
      wideNear !== undefined && wideNear.distanceKm >= 55 && wideNear.distanceKm <= 80,
      wideNear?.distanceKm,
    );

    // --- Le feed du club ---------------------------------------------------
    const players = await feed(admin, `/feed/listings/fl1${RUN}/players?limit=50`);
    check('le feed club répond', players.status === 200, players.status);
    const names = players.items.map((item) => item.firstName);
    check('le joueur proche est proposé au club', names.includes('Proche'));
    check(
      '🔴 le rayon du JOUEUR s’applique aussi au club : 25 km ne remonte pas à 65 km',
      !names.includes('Loin'),
      names,
    );
    check('un rayon large remonte, lui', names.includes('Large'));
    check('un profil masqué n’est jamais proposé', !names.includes('Discret'), names);

    // --- Un intérêt déjà exprimé sort du feed ------------------------------
    sql(
      `INSERT INTO \`PlayerInterest\` (id,playerId,listingId,kind,createdAt)
       VALUES ('fi1${RUN}','fq1${RUN}','fl1${RUN}','APPLIED',NOW());`,
    );
    const after = await feed(proche, '/feed/listings?limit=50');
    check(
      'une annonce à laquelle on a postulé ne revient pas',
      !after.items.some((item) => item.id === `fl1${RUN}`),
    );

    // --- Le blocage, dans les deux sens ------------------------------------
    sql(
      `INSERT INTO \`Block\` (id,blockerUserId,blockedUserId,createdAt)
       VALUES ('fb1${RUN}','fda${RUN}','fp3${RUN}',NOW());`,
    );
    const blocked = await feed(large, '/feed/listings?limit=50');
    check(
      'bloqué PAR le club : ses annonces disparaissent',
      !blocked.items.some((item) => item.id === `fl1${RUN}`),
      blocked.items.map((item) => item.id),
    );
    const blockedSide = await feed(admin, `/feed/listings/fl1${RUN}/players?limit=50`);
    check(
      'et le joueur bloqué disparaît du feed club',
      !blockedSide.items.some((item) => item.firstName === 'Large'),
    );
  } finally {
    cleanup();
  }

  console.log(failures === 0 ? '\nTOUT PASSE' : `\n${failures} CONTROLE(S) EN ECHEC`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
