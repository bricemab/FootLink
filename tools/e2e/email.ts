/**
 * Vérification de l'identité des adresses email.
 *
 * Deux adresses qui aboutissent dans la même boîte sont le même compte :
 * `brice@gmail.com`, `brice+foot@gmail.com` et `b.rice@gmail.com` ne doivent
 * jamais donner trois comptes FootLink.
 *
 * Lancement (depuis la racine du dépôt) :
 *   pnpm --filter @footlink/api exec tsx <chemin ABSOLU vers ce fichier>
 *
 * Le script n'appelle JAMAIS un endpoint qui envoie un email : les comptes
 * sont posés directement en base, et le conflit d'adresse est levé par l'API
 * avant toute tentative d'envoi. Aucun message ne part vers une adresse
 * inexistante.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Chemin relatif vers le paquet compilé, et non `@footlink/shared` : `tools/`
// n'est pas un paquet du workspace, donc le lien n'existe qu'à l'intérieur
// d'`apps/*` et de `packages/*`. Même racine que le piège `@prisma/client`
// décrit dans HANDOFF §7. Lancer `pnpm --filter @footlink/shared build` avant.
import { normalizeEmail } from '../../packages/shared/dist/index.js';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000/api/v1';
const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const RUN = Date.now().toString(36);
const DOMAIN = 'e2e.footlink.test';
const CLUB_NAME = `FC E2E Email ${RUN}`;

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

async function call<T>(
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
): Promise<{ status: number; body: T | undefined }> {
  const response = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as T) : undefined };
}

interface ApiError {
  error?: { code?: string };
}


/** La règle elle-même, sans réseau : c'est là que vivent les cas limites. */
function checkRule(): void {
  const same: [string, string][] = [
    ['brice@gmail.com', 'brice+xxx@gmail.com'],
    ['brice@gmail.com', 'b.r.i.c.e@gmail.com'],
    ['brice@gmail.com', 'Brice+Club@GMAIL.com'],
    ['brice@gmail.com', 'brice@googlemail.com'],
    ['coach@bluewin.ch', 'coach+avf@bluewin.ch'],
    ['coach@bluewin.ch', '  Coach@Bluewin.ch  '],
  ];
  for (const [a, b] of same) {
    check(`« ${a} » = « ${b.trim()} »`, normalizeEmail(a) === normalizeEmail(b), {
      a: normalizeEmail(a),
      b: normalizeEmail(b),
    });
  }

  // Hors Google, le point est significatif : les confondre fusionnerait des
  // personnes différentes, une faute bien plus grave qu'un doublon toléré.
  const different: [string, string][] = [
    ['jean.dupont@bluewin.ch', 'jeandupont@bluewin.ch'],
    ['brice@gmail.com', 'brice@outlook.com'],
    ['brice@gmail.com', 'brice2@gmail.com'],
  ];
  for (const [a, b] of different) {
    check(`« ${a} » ≠ « ${b} »`, normalizeEmail(a) !== normalizeEmail(b), {
      a: normalizeEmail(a),
      b: normalizeEmail(b),
    });
  }

  check(
    'une adresse absurde est laissée telle quelle',
    normalizeEmail('+foo@gmail.com') === '+foo@gmail.com',
    normalizeEmail('+foo@gmail.com'),
  );
}

async function checkApi(secret: string): Promise<void> {
  const base = `identity-${RUN}`;
  const id = `e2email${RUN}`;
  const email = `${base}@${DOMAIN}`;

  sql(
    `INSERT INTO \`User\` (id,email,role,status,emailVerifiedAt,locale,createdAt,updatedAt)
     VALUES ('${id}','${email}','PLAYER','ACTIVE',NOW(),'FR',NOW(),NOW());`,
  );

  // L'inscription échoue AVANT toute tentative d'envoi d'email : rien ne part.
  const tagged = await call<ApiError>('/auth/register', {
    method: 'POST',
    body: { email: `${base}+club@${DOMAIN}`, password: 'FootLink2026' },
  });
  check('inscription avec un suffixe +… -> 409', tagged.status === 409, tagged.status);
  check(
    'code métier EMAIL_ALREADY_USED',
    tagged.body?.error?.code === 'EMAIL_ALREADY_USED',
    tagged.body?.error?.code,
  );

  const cased = await call<ApiError>('/auth/register', {
    method: 'POST',
    body: { email: `${base.toUpperCase()}@${DOMAIN}`, password: 'FootLink2026' },
  });
  check('inscription avec une casse différente -> 409', cased.status === 409, cased.status);

  // Le compte du test a un mot de passe : il est « utilisable ». Demander un
  // code d'inscription dessus doit échouer explicitement, au lieu d'avancer
  // vers un écran de code où aucun code n'arrive. On ne teste QUE ce cas : une
  // adresse libre déclencherait un vrai envoi d'email.
  sql(`UPDATE \`User\` SET passwordHash='e2e-placeholder-hash' WHERE id='${id}';`);
  const codeForExisting = await call<ApiError>('/auth/signup/request-code', {
    method: 'POST',
    body: { email },
  });
  check(
    'demande de code sur un compte existant -> 409',
    codeForExisting.status === 409,
    codeForExisting.status,
  );
  check(
    'code métier EMAIL_ALREADY_USED sur request-code',
    codeForExisting.body?.error?.code === 'EMAIL_ALREADY_USED',
    codeForExisting.body?.error?.code,
  );

  // --- Vérification non-consommatrice du code d'inscription -----------------
  // On pose un compte à moitié inscrit (sans mot de passe) + un jeton EMAIL_VERIFY
  // dont on connaît le code, puis on contrôle qu'un code faux est rejeté et le
  // bon accepté SANS consommer le jeton. Aucun email envoyé.
  const codeUserId = `e2ecode${RUN}`;
  const codeEmail = `code-${RUN}@${DOMAIN}`;
  const knownCode = '424242';
  const codeHash = await argon2.hash(knownCode);
  sql(
    `INSERT INTO \`User\` (id,email,role,status,locale,createdAt,updatedAt)
     VALUES ('${codeUserId}','${codeEmail}','PLAYER','ACTIVE','FR',NOW(),NOW());`,
  );
  sql(
    `INSERT INTO \`Token\` (id,type,userId,tokenHash,attempts,expiresAt,createdAt)
     VALUES ('tok${RUN}','EMAIL_VERIFY','${codeUserId}','${codeHash}',0,
             DATE_ADD(NOW(), INTERVAL 1 HOUR),NOW());`,
  );

  const wrongCheck = await call<ApiError>('/auth/signup/check-code', {
    method: 'POST',
    body: { email: codeEmail, code: '000000' },
  });
  check('code faux au check -> 400', wrongCheck.status === 400, wrongCheck.status);
  check(
    'code métier SIGNUP_CODE_INVALID',
    wrongCheck.body?.error?.code === 'SIGNUP_CODE_INVALID',
    wrongCheck.body?.error?.code,
  );

  const goodCheck = await call('/auth/signup/check-code', {
    method: 'POST',
    body: { email: codeEmail, code: knownCode },
  });
  check('bon code au check -> 204', goodCheck.status === 204, goodCheck.status);

  // Le jeton ne doit PAS avoir été consommé par le check : la consommation
  // (verify-code, avec mot de passe) doit encore marcher juste après.
  const consume = await call('/auth/signup/verify-code', {
    method: 'POST',
    body: { email: codeEmail, code: knownCode, password: 'FootLink2026' },
  });
  check('le check ne consomme pas le jeton (verify-code -> 201)', consume.status === 201, consume.status);

  // --- Login sur un compte Google : on le dit --------------------------------
  // Compte avec googleId mais SANS mot de passe : se connecter par mot de passe
  // doit renvoyer un code dédié, pas l'erreur générique.
  const gId = `e2egoog${RUN}`;
  const gEmail = `google-${RUN}@${DOMAIN}`;
  sql(
    `INSERT INTO \`User\` (id,email,role,status,googleId,emailVerifiedAt,locale,createdAt,updatedAt)
     VALUES ('${gId}','${gEmail}','PLAYER','ACTIVE','g-${RUN}',NOW(),'FR',NOW(),NOW());`,
  );
  const googleLogin = await call<ApiError>('/auth/login', {
    method: 'POST',
    body: { email: gEmail, password: 'FootLink2026' },
  });
  check('login mot de passe sur compte Google -> 401', googleLogin.status === 401, googleLogin.status);
  check(
    'code métier ACCOUNT_IS_GOOGLE',
    googleLogin.body?.error?.code === 'ACCOUNT_IS_GOOGLE',
    googleLogin.body?.error?.code,
  );

  // --- Entrée entraîneur par Google -----------------------------------------
  // ⚠️ Couverture partielle, et c'est assumé : forger un jeton Google valide
  // est impossible (le serveur le fait vérifier par Google). On contrôle donc
  // seulement que l'endpoint existe, qu'il est public, et que la vérification
  // du jeton passe AVANT tout le reste.
  //
  // Les deux comportements qui comptent — une adresse sans invitation est
  // refusée SANS RIEN CRÉER, et un entraîneur invité est activé (Google lié,
  // email validé, invitation brûlée) — se vérifient sur l'appareil avec un vrai
  // compte Google. Fait le 25 juillet 2026 ; à refaire à la main si ce flux
  // change.
  const coachRoute = await call<ApiError>('/auth/google/coach', {
    method: 'POST',
    body: { idToken: 'jeton-invalide' },
  });
  check('entrée coach Google : jeton invalide -> 401', coachRoute.status === 401, coachRoute.status);

  // Une adresse inconnue reste une erreur GÉNÉRIQUE (pas d'énumération).
  const unknown = await call<ApiError>('/auth/login', {
    method: 'POST',
    body: { email: `nobody-${RUN}@${DOMAIN}`, password: 'FootLink2026' },
  });
  check(
    'login sur adresse inconnue ne révèle rien (pas ACCOUNT_IS_GOOGLE)',
    unknown.status === 401 && unknown.body?.error?.code !== 'ACCOUNT_IS_GOOGLE',
    unknown.body?.error?.code,
  );

  // --- Un compte ne peut être rattaché qu'à un seul club --------------------
  const token = jwt.sign({ sub: id, role: 'PLAYER', email }, secret, { expiresIn: '15m' });
  const first = await call('/clubs/requests', {
    method: 'POST',
    token,
    body: { clubName: CLUB_NAME, locality: 'Sion' },
  });
  check('première demande de club -> 201', first.status === 201, first.body);

  const second = await call<ApiError>('/clubs/requests', {
    method: 'POST',
    token,
    body: { clubName: `${CLUB_NAME} bis`, locality: 'Sion' },
  });
  check('deuxième demande depuis le même compte -> 409', second.status === 409, second.status);
  check(
    'code métier CLUB_ALREADY_LINKED (et non « email déjà pris »)',
    second.body?.error?.code === 'CLUB_ALREADY_LINKED',
    second.body?.error?.code,
  );
}

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

  checkRule();
  console.log('');
  try {
    await checkApi(secret);
  } catch (error) {
    check(`exception : ${error instanceof Error ? error.message : String(error)}`, false);
  } finally {
    sql(`DELETE FROM \`Club\` WHERE name LIKE '${CLUB_NAME}%';`);
    sql(`DELETE FROM \`User\` WHERE email LIKE '%@${DOMAIN}';`);
  }

  console.log(failures === 0 ? '\nTOUT PASSE' : `\n${failures} CONTROLE(S) EN ECHEC`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
