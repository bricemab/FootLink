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
