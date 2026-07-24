/**
 * Vérification end-to-end du terrain d'un club : autocomplétion swisstopo,
 * déduction serveur du canton / de la commune / de l'association, et stockage
 * des coordonnées en PLEINE précision (contrairement au profil joueur).
 *
 * Lancement (depuis la racine du dépôt) :
 *   pnpm --filter @footlink/api exec tsx <chemin ABSOLU vers ce fichier>
 *
 * Contrairement à `phase4.ts`, ce script n'a PAS besoin d'une instance sans
 * SMTP : il ne rejoue aucun email. Il pose ses comptes directement en base avec
 * `emailVerifiedAt` déjà rempli, et signe lui-même des jetons d'accès avec
 * `JWT_ACCESS_SECRET` — inutile d'envoyer de vrais emails à des adresses
 * inexistantes juste pour obtenir une session.
 *
 * Il exige en revanche un accès réseau à geo.admin.ch : c'est justement ce
 * qu'on vérifie.
 *
 *   E2E_BASE  URL de base de l'API  (défaut http://localhost:3000/api/v1)
 *
 * Comptes et clubs vivent sur @e2e.footlink.test et sont supprimés à la fin,
 * y compris si un contrôle échoue.
 *
 * Note : les lectures en base passent par la CLI Prisma (`db execute`) et non
 * par `@prisma/client`. Un script situé hors d'`apps/api` ne résout pas le même
 * client généré — c'est la contrepartie du `nodeLinker: hoisted`.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import jwt from 'jsonwebtoken';

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000/api/v1';
const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const RUN = Date.now().toString(36);
const DOMAIN = 'e2e.footlink.test';
const CLUB_PREFIX = `FC E2E ${RUN}`;

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

async function once<T>(
  path: string,
  token: string | null,
  init: { method?: string; body?: unknown },
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

/**
 * `POST /clubs/requests` est limité à 5 demandes par minute et par IP — une
 * protection voulue, qu'on ne contourne pas. Ce script en fait plus que ça :
 * quand la fenêtre est pleine, on l'attend au lieu de compter un échec. Sans
 * cela, deux exécutions rapprochées se marcheraient dessus (le même piège que
 * `phase4.ts`), et le script accuserait le code d'un bug qui n'existe pas.
 */
async function call<T>(
  path: string,
  token: string | null,
  init: { method?: string; body?: unknown } = {},
): Promise<Called<T>> {
  const first = await once<T>(path, token, init);
  if (first.status !== 429) {
    return first;
  }
  console.log('    (fenêtre de rate-limit pleine, attente de 60 s)');
  await new Promise((done) => setTimeout(done, 61_000));
  return once<T>(path, token, init);
}

/**
 * Compte jetable déjà vérifié. Le but de ce script n'est pas de retester
 * l'inscription — elle a sa propre couverture dans `phase4.ts`.
 */
function makeUser(suffix: string, secret: string): string {
  const id = `e2epitch${RUN}${suffix}`;
  const email = `pitch-${RUN}-${suffix}@${DOMAIN}`;
  sql(
    `INSERT INTO \`User\` (id, email, role, status, emailVerifiedAt, locale, createdAt, updatedAt)
     VALUES ('${id}', '${email}', 'PLAYER', 'ACTIVE', NOW(), 'FR', NOW(), NOW());`,
  );
  return jwt.sign({ sub: id, role: 'PLAYER', email }, secret, { expiresIn: '15m' });
}

interface Suggestion {
  id: string;
  label: string;
  context: string;
}

interface Resolved {
  id: string;
  label: string;
  lat: number;
  lng: number;
  canton: string;
  locality: string;
  regionCode: string | null;
  aerialUrl: string;
}

interface MyClub {
  club: {
    canton: string | null;
    locality: string | null;
    regionCode: string | null;
    stadiumName: string | null;
    websiteUrl: string | null;
    lat: string | null;
    lng: string | null;
  };
}

// Chaque recherche Mapbox consomme une SESSION facturée (franchise mensuelle).
// Les contrôles qui la frappent ne tournent donc que sur demande explicite ;
// par défaut on part d'un point connu, et tout le reste — déduction serveur du
// canton, précision, client menteur, hors-Suisse — se vérifie sans un seul
// appel Mapbox (swisstopo est gratuit et sans quota).
const LIVE_SEARCH = process.env.E2E_LIVE_SEARCH === '1';
const TOURBILLON = { lat: 46.232906, lng: 7.375564, label: 'Stade de Tourbillon' };

/** Point de départ des contrôles. En mode LIVE, il vient d'une vraie recherche. */
async function resolvePitch(token: string): Promise<{ lat: number; lng: number; label: string }> {
  if (!LIVE_SEARCH) {
    console.log(
      '    (recherche Mapbox ignorée : E2E_LIVE_SEARCH!=1 — 0 session facturée.\n' +
        '     Qualité de recherche et vue satellite NON couvertes ce run.)',
    );
    return TOURBILLON;
  }

  const session = `e2e${RUN}session`;

  // Le cas qui a motivé le passage à Mapbox : un terrain de club de village,
  // absent du registre officiel swisstopo, que les gens cherchent par son nom.
  const village = await call<Suggestion[]>(
    `/geo/places?q=${encodeURIComponent('Stade de Pranoé Grimisuat')}&session=${session}`,
    token,
  );
  check('recherche « Stade de Pranoé Grimisuat » -> 200', village.status === 200, village.body);
  check(
    'le terrain du village est trouvé par son NOM',
    Boolean(village.body?.some((place) => /pranoé|pranoe/i.test(place.label))),
    village.body?.slice(0, 3),
  );

  // Le mot générique varie selon les gens (« stade », « terrain », « centre
  // sportif ») et ne fait pas partie du nom du lieu. Sans repli, « terrain de
  // pranoé » ne remontait QUE des rues.
  const genericWord = await call<Suggestion[]>(
    `/geo/places?q=${encodeURIComponent('terrain de pranoé grimisuat')}&session=${session}g`,
    token,
  );
  check(
    '« terrain de … » trouve aussi le stade (repli sur le mot générique)',
    Boolean(genericWord.body?.some((place) => /stade de pranoé|stade de pranoe/i.test(place.label))),
    genericWord.body?.slice(0, 4),
  );

  const byName = await call<Suggestion[]>(
    `/geo/places?q=stade%20de%20tourbillon&session=${session}`,
    token,
  );
  check('recherche par NOM de stade -> 200', byName.status === 200, byName.body);
  const suggestion = byName.body?.find((place) => /tourbillon/i.test(place.label));
  check('« Stade de Tourbillon » trouvé', Boolean(suggestion), byName.body?.slice(0, 2));
  check(
    'identifiants uniques (sinon React refuse la liste)',
    new Set(byName.body?.map((place) => place.id)).size === (byName.body?.length ?? 0),
  );
  check(
    'aucun HTML résiduel dans les libellés',
    !byName.body?.some((place) => /[<>]/.test(place.label)),
  );

  const byAddress = await call<Suggestion[]>(
    `/geo/places?q=route%20de%20la%20crettaz%20grimisuat&session=${session}`,
    token,
  );
  check('recherche par ADRESSE -> 200', byAddress.status === 200);
  check('au moins une adresse trouvée', (byAddress.body?.length ?? 0) > 0);

  const short = await call(`/geo/places?q=ab&session=${session}`, token);
  check('requête de moins de 3 caractères -> 400', short.status === 400, short.status);

  const noSession = await call('/geo/places?q=sion', token);
  check('recherche sans session -> 400', noSession.status === 400, noSession.status);

  const anonymous = await call(`/geo/places?q=sion&session=${session}`, null);
  check('recherche sans jeton -> 401', anonymous.status === 401, anonymous.status);

  if (!suggestion) {
    throw new Error('Aucune suggestion : la suite des contrôles serait vide de sens.');
  }

  // --- Résolution du point choisi -------------------------------------------
  const detail = await call<Resolved>(
    `/geo/places/${encodeURIComponent(suggestion.id)}?session=${session}`,
    token,
  );
  check('résolution du lieu choisi -> 200', detail.status === 200, detail.body);
  const resolved = detail.body;
  check(
    'coordonnées en Suisse',
    Boolean(resolved && resolved.lat > 45.7 && resolved.lat < 47.9 && resolved.lng > 5.9 && resolved.lng < 10.6),
    resolved,
  );
  // Ce que l'app utilise pour présélectionner l'association sans redemander.
  check('canton renvoyé dès la sélection', resolved?.canton === 'VS', resolved?.canton);
  check('commune renvoyée dès la sélection', resolved?.locality === 'Sion', resolved?.locality);
  check('association suggérée dès la sélection', resolved?.regionCode === 'avf', resolved?.regionCode);

  // La vue satellite est fabriquée côté serveur : l'app n'a pas le jeton, et
  // les mentions retirées de l'image doivent l'être des DEUX (logo et texte),
  // sinon on sort des conditions d'utilisation Mapbox.
  check(
    "URL satellite renvoyée par l'API",
    Boolean(resolved?.aerialUrl?.startsWith('https://api.mapbox.com/styles/')),
    resolved?.aerialUrl?.slice(0, 60),
  );
  check(
    'mentions incrustées retirées (compensées sous l’image)',
    Boolean(
      resolved?.aerialUrl?.includes('logo=false') && resolved.aerialUrl.includes('attribution=false'),
    ),
  );
  const aerial = await fetch(resolved!.aerialUrl);
  check(
    'la vue satellite se charge vraiment',
    aerial.ok && (aerial.headers.get('content-type') ?? '').startsWith('image'),
    `${aerial.status} ${aerial.headers.get('content-type')}`,
  );

  if (!resolved) {
    throw new Error('Pas de coordonnées : la suite des contrôles serait vide de sens.');
  }
  return { lat: resolved.lat, lng: resolved.lng, label: resolved.label };
}

async function run(secret: string): Promise<void> {
  const token = makeUser('main', secret);

  const pitch = await resolvePitch(token);

  // --- Création du club à partir du seul point -------------------------------
  const created = await call('/clubs/requests', token, {
    method: 'POST',
    body: {
      clubName: `${CLUB_PREFIX} Pitch`,
      lat: pitch.lat,
      lng: pitch.lng,
      stadiumName: pitch.label,
      addressLine: pitch.label,
      // Volontairement sans schéma : c'est ce que les gens tapent.
      websiteUrl: 'fcsion.ch',
    },
  });
  check('demande de club avec terrain -> 201', created.status === 201, created.body);

  // On relit par l'API : c'est ce que verra l'app, et ça évite un second client
  // Prisma dans ce script.
  const mine = await call<MyClub>('/clubs/me', token);
  const club = mine.body?.club;
  check('canton déduit PAR LE SERVEUR = VS', club?.canton === 'VS', club?.canton);
  check('commune déduite PAR LE SERVEUR = Sion', club?.locality === 'Sion', club?.locality);
  check('association déduite du canton = avf', club?.regionCode === 'avf', club?.regionCode);
  check('nom du terrain conservé', Boolean(club?.stadiumName), club?.stadiumName);
  check(
    'site du club normalisé en https://',
    club?.websiteUrl === 'https://fcsion.ch',
    club?.websiteUrl,
  );

  // Le site est facultatif : une valeur absurde doit être refusée, mais son
  // absence ne doit rien casser.
  const badSite = await call('/clubs/requests', makeUser('site', secret), {
    method: 'POST',
    body: { clubName: `${CLUB_PREFIX} Site`, lat: pitch.lat, lng: pitch.lng, websiteUrl: 'pas une url' },
  });
  check('site invalide -> 400', badSite.status === 400, badSite.status);

  const lat = Number(club?.lat);
  const lng = Number(club?.lng);
  check(
    'coordonnées en pleine précision (pas la grille ~1 km des joueurs)',
    Number.isFinite(lat) && Math.abs(lat - Math.round(lat * 100) / 100) > 1e-6,
    lat,
  );
  check(
    'coordonnées fidèles au point choisi',
    Math.abs(lat - pitch.lat) < 1e-4 && Math.abs(lng - pitch.lng) < 1e-4,
    { stocke: [lat, lng], demande: [pitch.lat, pitch.lng] },
  );

  // --- Le client ne décide pas de sa localisation ---------------------------
  // `canton` n'existe plus dans le DTO : la validation stricte
  // (`forbidNonWhitelisted`) le refuse avant même d'atteindre le service.
  const rejected = await call('/clubs/requests', makeUser('canton', secret), {
    method: 'POST',
    body: { clubName: `${CLUB_PREFIX} Canton`, lat: pitch.lat, lng: pitch.lng, canton: 'NE' },
  });
  check('canton envoyé par le client -> 400', rejected.status === 400, rejected.status);

  // `locality` reste accepté (repli quand la recherche est HS), mais dès qu'un
  // point est fourni, c'est le point qui fait foi.
  const liar = makeUser('liar', secret);
  const lie = await call('/clubs/requests', liar, {
    method: 'POST',
    body: {
      clubName: `${CLUB_PREFIX} Menteur`,
      lat: pitch.lat,
      lng: pitch.lng,
      locality: 'Neuchâtel',
    },
  });
  check('demande avec localité mensongère -> 201', lie.status === 201, lie.body);
  const lied = await call<MyClub>('/clubs/me', liar);
  check(
    'commune recalculée depuis le point, pas celle envoyée',
    lied.body?.club.locality === 'Sion',
    lied.body?.club.locality,
  );
  check(
    'canton recalculé depuis le point',
    lied.body?.club.canton === 'VS',
    lied.body?.club.canton,
  );

  // --- Points invalides -----------------------------------------------------
  const abroad = await call('/clubs/requests', makeUser('abroad', secret), {
    method: 'POST',
    body: { clubName: `${CLUB_PREFIX} Hors Suisse`, lat: 48.8566, lng: 2.3522 },
  });
  check('terrain hors de Suisse -> 400', abroad.status === 400, abroad.status);

  const lake = await call('/clubs/requests', makeUser('lake', secret), {
    method: 'POST',
    body: { clubName: `${CLUB_PREFIX} Leman`, lat: 46.45, lng: 6.6 },
  });
  check('terrain hors territoire communal (Léman) -> 400', lake.status === 400, lake.status);
}

/**
 * `tsx` ne charge pas de `.env` (c'est NestJS qui le fait au démarrage de
 * l'API). On lit donc le secret nous-mêmes, sans dépendance supplémentaire.
 * Il ne sort jamais de ce processus et n'est jamais affiché.
 */
function readAccessSecret(): string | undefined {
  if (process.env.JWT_ACCESS_SECRET) {
    return process.env.JWT_ACCESS_SECRET;
  }
  let raw: string;
  try {
    raw = readFileSync(resolve(REPO_ROOT, 'apps', 'api', '.env'), 'utf8');
  } catch {
    return undefined;
  }
  const line = raw.split(/\r?\n/).find((entry) => entry.startsWith('JWT_ACCESS_SECRET='));
  return line?.slice('JWT_ACCESS_SECRET='.length).trim().replace(/^["']|["']$/g, '');
}

async function main(): Promise<void> {
  const secret = readAccessSecret();
  if (!secret) {
    console.error("JWT_ACCESS_SECRET introuvable (ni dans l'environnement, ni dans apps/api/.env).");
    process.exit(1);
  }

  try {
    await run(secret);
  } catch (error) {
    check(`exception : ${error instanceof Error ? error.message : String(error)}`, false);
  } finally {
    // Les ClubMember partent en cascade avec le User ; les Club, non.
    sql(`DELETE FROM \`Club\` WHERE name LIKE '${CLUB_PREFIX}%';`);
    sql(`DELETE FROM \`User\` WHERE email LIKE '%@${DOMAIN}';`);
  }

  console.log(failures === 0 ? '\nTOUT PASSE' : `\n${failures} CONTROLE(S) EN ECHEC`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
