/**
 * Vérification end-to-end des photos de profil : billet pré-signé, téléversement
 * direct, confirmation, et surtout les **abus** que le serveur doit refuser.
 *
 * Lancement (depuis la racine du dépôt) :
 *   pnpm --filter @footlink/api exec tsx <chemin ABSOLU vers ce fichier>
 *
 * Exige une instance lancée AVEC les variables S3_* renseignées, et un accès
 * réseau au bucket. Crée ses comptes sur @e2e.footlink.test et nettoie derrière
 * lui, y compris les objets déposés dans le bucket.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import jwt from 'jsonwebtoken';

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000/api/v1';
const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const RUN = Date.now().toString(36);
const DOMAIN = 'e2e.footlink.test';

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

function env(key: string): string {
  const line = readFileSync(resolve(REPO_ROOT, 'apps', 'api', '.env'), 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') ?? '';
}

async function call<T>(
  path: string,
  token: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: T | undefined }> {
  const response = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as T) : undefined };
}

/** Compte jetable déjà vérifié : l'inscription a sa propre couverture. */
function makeUser(suffix: string, secret: string): { id: string; token: string } {
  const id = `e2emedia${RUN}${suffix}`;
  const email = `media-${RUN}-${suffix}@${DOMAIN}`;
  sql(
    `INSERT INTO \`User\` (id,email,role,status,emailVerifiedAt,locale,createdAt,updatedAt)
     VALUES ('${id}','${email}','PLAYER','ACTIVE',NOW(),'FR',NOW(),NOW());`,
  );
  return {
    id,
    token: jwt.sign({ sub: id, role: 'PLAYER', email }, secret, { expiresIn: '15m' }),
  };
}

interface Ticket {
  uploadUrl: string;
  key: string;
  expiresIn: number;
  maxBytes: number;
}

/** Un PNG 1x1 valide : assez réel pour que le stockage l'accepte. */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

async function run(secret: string): Promise<void> {
  const alice = makeUser('alice', secret);
  const bob = makeUser('bob', secret);

  // --- Billet de téléversement ----------------------------------------------
  const ticket = await call<Ticket>('/media/avatar/upload-url', alice.token, {
    method: 'POST',
    body: { contentType: 'image/png' },
  });
  check('billet de televersement -> 201', ticket.status === 201, ticket.body);
  check(
    'la cle est prefixee par l identifiant du proprietaire',
    ticket.body?.key.startsWith(`avatars/${alice.id}/`) === true,
    ticket.body?.key,
  );
  check(
    'URL pre-signee a duree courte',
    (ticket.body?.expiresIn ?? 9999) <= 300,
    ticket.body?.expiresIn,
  );

  const badType = await call('/media/avatar/upload-url', alice.token, {
    method: 'POST',
    body: { contentType: 'application/pdf' },
  });
  check('type non image refuse -> 400', badType.status === 400, badType.status);

  const anonymous = await fetch(`${BASE}/media/avatar/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType: 'image/png' }),
  });
  check('billet sans jeton -> 401', anonymous.status === 401, anonymous.status);

  if (!ticket.body) {
    throw new Error('Sans billet, la suite des contrôles serait vide de sens.');
  }
  const { uploadUrl, key } = ticket.body;

  // --- Confirmer avant d'avoir téléversé doit échouer ------------------------
  const early = await call('/media/avatar/confirm', alice.token, {
    method: 'POST',
    body: { key },
  });
  check('confirmation avant televersement -> 400', early.status === 400, early.status);

  // --- Téléversement direct, sans passer par le backend ---------------------
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: PNG_1x1,
  });
  check('televersement direct vers le stockage', put.ok, `HTTP ${put.status}`);

  // --- Un autre utilisateur ne peut pas s'attribuer cet objet ---------------
  const stolen = await call('/media/avatar/confirm', bob.token, {
    method: 'POST',
    body: { key },
  });
  check(
    "un tiers ne peut pas rattacher l objet d autrui -> 400",
    stolen.status === 400,
    stolen.status,
  );

  const forged = await call('/media/avatar/confirm', alice.token, {
    method: 'POST',
    body: { key: `avatars/${bob.id}/vole.png` },
  });
  check('cle forgee hors de son prefixe -> 400', forged.status === 400, forged.status);

  // --- Confirmation légitime ------------------------------------------------
  const confirmed = await call<{ avatarUrl: string | null }>('/media/avatar/confirm', alice.token, {
    method: 'POST',
    body: { key },
  });
  check('confirmation par le proprietaire -> 201', confirmed.status === 201, confirmed.body);
  check(
    'URL de lecture signee renvoyee',
    typeof confirmed.body?.avatarUrl === 'string' && confirmed.body.avatarUrl.includes('X-Amz'),
    confirmed.body?.avatarUrl?.slice(0, 60),
  );

  // L'URL signée doit réellement servir l'image.
  if (confirmed.body?.avatarUrl) {
    const read = await fetch(confirmed.body.avatarUrl);
    const bytes = read.ok ? Buffer.from(await read.arrayBuffer()) : Buffer.alloc(0);
    check(
      'l URL de lecture sert bien l image televersee',
      read.ok && bytes.equals(PNG_1x1),
      `HTTP ${read.status}, ${bytes.length} octets`,
    );
  }

  // --- Le bucket n'est pas lisible sans signature ---------------------------
  // On ne fige pas le code exact : R2 refuse avec 400, d'autres implémentations
  // S3 répondent 401 ou 403. Ce qui compte est que la requête échoue ET que
  // l'image ne soit pas servie.
  const naked = await fetch(`${env('S3_ENDPOINT')}/${env('S3_BUCKET')}/${key}`);
  const nakedBody = Buffer.from(await naked.arrayBuffer());
  check(
    'objet inaccessible sans URL signee',
    !naked.ok && !nakedBody.equals(PNG_1x1),
    `HTTP ${naked.status}, ${nakedBody.length} octets`,
  );

  // --- Suppression : droit à l'effacement ----------------------------------
  const removed = await call('/media/avatar', alice.token, { method: 'DELETE' });
  check('suppression de l avatar -> 200/204', removed.status === 200 || removed.status === 204, removed.status);
}

function readAccessSecret(): string | undefined {
  return process.env.JWT_ACCESS_SECRET || env('JWT_ACCESS_SECRET') || undefined;
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
    sql(`DELETE FROM \`User\` WHERE email LIKE '%@${DOMAIN}';`);
  }

  console.log(failures === 0 ? '\nTOUT PASSE' : `\n${failures} CONTROLE(S) EN ECHEC`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
