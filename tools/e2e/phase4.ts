/**
 * Vérification end-to-end de la Phase 4 (équipes + comptes entraîneurs) et du
 * durcissement « rien sans email validé ».
 *
 * Lancement (depuis la racine du dépôt) :
 *   npx tsx tools/e2e/phase4.ts
 *
 * Prérequis : une instance de l'API doit tourner AVEC SMTP désactivé, pour que
 * les emails partent en jsonTransport et que leurs jetons soient logués — c'est
 * la seule façon de rejouer une validation d'email ou une invitation entraîneur
 * sans boîte mail réelle. Voir tools/e2e/README.md.
 *
 *   E2E_BASE  URL de base de l'API      (défaut http://localhost:3100/api/v1)
 *   E2E_LOG   fichier de log de l'API   (obligatoire : on y lit les jetons)
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.E2E_BASE ?? 'http://localhost:3100/api/v1';
const LOG = process.env.E2E_LOG;
const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const RUN = Date.now().toString(36);
const PASSWORD = 'FootLink2026';

// Domaine réservé aux tests : jamais d'envoi réel, et le nettoyage final cible
// exactement ce domaine.
const DOMAIN = 'e2e.footlink.test';

interface ApiResult<T> {
  status: number;
  body: T;
}

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  checks += 1;
  if (condition) {
    console.log(`  OK   ${label}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL ${label}`);
  if (detail !== undefined) {
    console.error(`       ${JSON.stringify(detail)}`);
  }
}

async function api<T = unknown>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.token === undefined ? {} : { Authorization: `Bearer ${options.token}` }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body = text.length === 0 ? (undefined as T) : (JSON.parse(text) as T);
  return { status: response.status, body };
}

function sql(statement: string): void {
  execSync('pnpm --filter @footlink/api exec prisma db execute --stdin --schema prisma/schema.prisma', {
    cwd: REPO_ROOT,
    input: statement,
    stdio: ['pipe', 'ignore', 'inherit'],
  });
}

// Les jetons email n'existent en clair QUE dans l'email : on les relit dans le
// log de l'instance de test (jsonTransport). Petit délai possible entre la
// réponse HTTP et l'écriture du fichier -> on réessaie.
async function readEmailToken(recipient: string): Promise<string> {
  if (!LOG) {
    throw new Error('E2E_LOG non défini : impossible de relire les jetons email.');
  }
  const pattern = new RegExp(`-> ${recipient.replace(/[.+]/g, '\\$&')} \\| token=([\\w.~-]+)`, 'g');
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const matches = [...readFileSync(LOG, 'utf8').matchAll(pattern)];
    const last = matches.at(-1);
    if (last) {
      return last[1];
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`Aucun jeton email trouvé pour ${recipient} dans ${LOG}`);
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface ClubRequestResponse {
  tokens: Tokens;
  club: { id: string; name: string; status: string };
}

interface TeamResponse {
  id: string;
  category: string;
  gender: string;
  name: string | null;
}

interface CoachResponse {
  clubMemberId: string;
  email: string;
  hasAccepted: boolean;
  teams: { id: string }[];
}

interface ErrorResponse {
  error?: { code?: string; message?: string | string[] };
}

async function main(): Promise<void> {
  const adminEmail = `admin-${RUN}@${DOMAIN}`;
  const coachEmail = `coach-${RUN}@${DOMAIN}`;
  const superEmail = `super-${RUN}@${DOMAIN}`;
  const rivalEmail = `rival-${RUN}@${DOMAIN}`;

  console.log(`\nBase : ${BASE}`);

  // --- 1. Demande de compte club (public) ---------------------------------
  console.log('\n1. Demande de compte club');
  const request = await api<ClubRequestResponse>('POST', '/clubs/requests', {
    body: { clubName: `FC E2E ${RUN}`, email: adminEmail, password: PASSWORD, regionCode: 'avf' },
  });
  check('la demande est acceptée', request.status === 201, request.body);
  check('le club est créé en PENDING', request.body.club?.status === 'PENDING', request.body.club);
  const adminToken = request.body.tokens.accessToken;
  const clubId = request.body.club.id;

  // --- 2. Rien n'est accessible tant que l'email n'est pas validé ----------
  console.log("\n2. Blocage tant que l'email n'est pas validé");
  const blockedClub = await api<ErrorResponse>('GET', '/clubs/me', { token: adminToken });
  check('GET /clubs/me est refusé', blockedClub.status === 403, blockedClub.body);
  check(
    'le code EMAIL_NOT_VERIFIED est renvoyé',
    blockedClub.body.error?.code === 'EMAIL_NOT_VERIFIED',
    blockedClub.body,
  );
  const blockedTeams = await api<ErrorResponse>('GET', '/teams', { token: adminToken });
  check('GET /teams est refusé', blockedTeams.status === 403, blockedTeams.body);
  const blockedPlayers = await api<ErrorResponse>('GET', '/players/me', { token: adminToken });
  check('GET /players/me est refusé', blockedPlayers.status === 403, blockedPlayers.body);

  const me = await api<{ emailVerified: boolean }>('GET', '/auth/me', { token: adminToken });
  check('GET /auth/me reste accessible', me.status === 200, me.body);
  check('/auth/me annonce emailVerified=false', me.body.emailVerified === false, me.body);

  // --- 3. Validation de l'email -------------------------------------------
  console.log("\n3. Validation de l'email");
  const verifyToken = await readEmailToken(adminEmail);
  const verified = await api('POST', '/auth/verify-email', { body: { token: verifyToken } });
  check('la validation réussit', verified.status === 200, verified.body);
  const clubAfter = await api<{ club: { status: string } }>('GET', '/clubs/me', {
    token: adminToken,
  });
  check('GET /clubs/me devient accessible', clubAfter.status === 200, clubAfter.body);

  // --- 4. Un club non validé ne peut rien créer ---------------------------
  console.log('\n4. Garde « club non approuvé »');
  const earlyTeam = await api<ErrorResponse>('POST', '/teams', {
    token: adminToken,
    body: { category: 'TROISIEME_LIGUE' },
  });
  check('créer une équipe est refusé', earlyTeam.status === 403, earlyTeam.body);
  const earlyCoach = await api<ErrorResponse>('POST', '/clubs/me/coaches', {
    token: adminToken,
    body: { email: coachEmail },
  });
  check('créer un entraîneur est refusé', earlyCoach.status === 403, earlyCoach.body);

  // --- 5. Approbation par le SUPER_ADMIN ----------------------------------
  console.log('\n5. Approbation du club par le SUPER_ADMIN');
  await api('POST', '/auth/register', { body: { email: superEmail, password: PASSWORD } });
  sql(
    `UPDATE \`User\` SET role='SUPER_ADMIN', emailVerifiedAt=NOW() WHERE email='${superEmail}';`,
  );
  const superLogin = await api<Tokens>('POST', '/auth/login', {
    body: { email: superEmail, password: PASSWORD },
  });
  const superToken = superLogin.body.accessToken;
  const approve = await api('POST', `/admin/clubs/${clubId}/approve`, { token: superToken });
  check('le club est approuvé', approve.status === 200, approve.body);

  const forbiddenAdmin = await api<ErrorResponse>('GET', '/admin/clubs', { token: adminToken });
  check(
    "l'admin de club n'accède pas aux routes SUPER_ADMIN",
    forbiddenAdmin.status === 403,
    forbiddenAdmin.body,
  );

  // --- 6. Équipes ----------------------------------------------------------
  console.log('\n6. Création des équipes');
  const teamA = await api<TeamResponse>('POST', '/teams', {
    token: adminToken,
    body: { category: 'TROISIEME_LIGUE', gender: 'MALE', name: 'Trois A' },
  });
  check('la première équipe est créée', teamA.status === 201, teamA.body);
  const teamB = await api<TeamResponse>('POST', '/teams', {
    token: adminToken,
    body: { category: 'JUNIORS_B', gender: 'MALE', name: 'Juniors B — 1' },
  });
  check('la seconde équipe est créée', teamB.status === 201, teamB.body);

  const duplicate = await api<ErrorResponse>('POST', '/teams', {
    token: adminToken,
    body: { category: 'TROISIEME_LIGUE', gender: 'MALE', name: 'Trois A' },
  });
  check('le doublon exact est refusé', duplicate.status === 409, duplicate.body);

  const adminTeams = await api<TeamResponse[]>('GET', '/teams', { token: adminToken });
  check(
    "l'admin voit les 2 équipes de son club",
    adminTeams.body.length === 2,
    adminTeams.body.map((team) => team.name),
  );

  // --- 7. Compte entraîneur + invitation ----------------------------------
  console.log('\n7. Compte entraîneur');
  const coach = await api<CoachResponse>('POST', '/clubs/me/coaches', {
    token: adminToken,
    body: { email: coachEmail, teamIds: [teamA.body.id] },
  });
  check("l'entraîneur est créé", coach.status === 201, coach.body);
  check("l'invitation est en attente", coach.body.hasAccepted === false, coach.body);
  check('une équipe lui est assignée', coach.body.teams.length === 1, coach.body.teams);

  const foreignTeam = await api<ErrorResponse>('POST', '/clubs/me/coaches', {
    token: adminToken,
    body: { email: `other-${RUN}@${DOMAIN}`, teamIds: ['clnotarealteamid00000000'] },
  });
  check(
    "assigner une équipe d'un autre club est refusé",
    foreignTeam.status === 400,
    foreignTeam.body,
  );

  const inviteToken = await readEmailToken(coachEmail);
  const accepted = await api<Tokens>('POST', '/auth/coach-invite/accept', {
    body: { token: inviteToken, password: PASSWORD },
  });
  check("l'invitation est acceptée", accepted.status === 201, accepted.body);
  const coachToken = accepted.body.accessToken;

  const replay = await api<ErrorResponse>('POST', '/auth/coach-invite/accept', {
    body: { token: inviteToken, password: PASSWORD },
  });
  check('le jeton d’invitation est à usage unique', replay.status === 400, replay.body);

  // --- 8. Isolation de l'entraîneur ---------------------------------------
  console.log("\n8. Isolation de l'entraîneur");
  const coachTeams = await api<TeamResponse[]>('GET', '/teams', { token: coachToken });
  check(
    "l'entraîneur ne voit que son équipe assignée",
    coachTeams.body.length === 1 && coachTeams.body[0].id === teamA.body.id,
    coachTeams.body.map((team) => team.name),
  );
  const coachOnOwnTeam = await api('GET', `/teams/${teamA.body.id}`, { token: coachToken });
  check('il accède à son équipe', coachOnOwnTeam.status === 200, coachOnOwnTeam.body);
  const coachOnOtherTeam = await api<ErrorResponse>('GET', `/teams/${teamB.body.id}`, {
    token: coachToken,
  });
  check(
    "il n'accède pas à une équipe non assignée",
    coachOnOtherTeam.status === 403,
    coachOnOtherTeam.body,
  );
  const coachCreatesTeam = await api<ErrorResponse>('POST', '/teams', {
    token: coachToken,
    body: { category: 'QUATRIEME_LIGUE' },
  });
  check('il ne peut pas créer d’équipe', coachCreatesTeam.status === 403, coachCreatesTeam.body);
  const coachListsCoaches = await api<ErrorResponse>('GET', '/clubs/me/coaches', {
    token: coachToken,
  });
  check('il ne gère pas les entraîneurs', coachListsCoaches.status === 403, coachListsCoaches.body);

  // --- 9. Réassignation ----------------------------------------------------
  console.log('\n9. Réassignation des équipes');
  const reassigned = await api<CoachResponse>('PUT', `/clubs/me/coaches/${coach.body.clubMemberId}/teams`, {
    token: adminToken,
    body: { teamIds: [teamA.body.id, teamB.body.id] },
  });
  check('la réassignation réussit', reassigned.status === 200, reassigned.body);
  const coachTeamsAfter = await api<TeamResponse[]>('GET', '/teams', { token: coachToken });
  check("l'entraîneur voit désormais 2 équipes", coachTeamsAfter.body.length === 2, coachTeamsAfter.body.length);

  // --- 10. Cloisonnement entre clubs --------------------------------------
  console.log('\n10. Cloisonnement entre deux clubs');
  const rival = await api<ClubRequestResponse>('POST', '/clubs/requests', {
    body: { clubName: `FC Rival ${RUN}`, email: rivalEmail, password: PASSWORD },
  });
  const rivalVerify = await readEmailToken(rivalEmail);
  await api('POST', '/auth/verify-email', { body: { token: rivalVerify } });
  await api('POST', `/admin/clubs/${rival.body.club.id}/approve`, { token: superToken });
  const rivalToken = rival.body.tokens.accessToken;

  const rivalSeesTeams = await api<TeamResponse[]>('GET', '/teams', { token: rivalToken });
  check('le club rival ne voit aucune équipe', rivalSeesTeams.body.length === 0, rivalSeesTeams.body);
  const rivalReadsTeam = await api<ErrorResponse>('GET', `/teams/${teamA.body.id}`, {
    token: rivalToken,
  });
  check("le club rival ne lit pas l'équipe voisine", rivalReadsTeam.status === 404, rivalReadsTeam.body);
  const rivalUpdatesTeam = await api<ErrorResponse>('PATCH', `/teams/${teamA.body.id}`, {
    token: rivalToken,
    body: { name: 'piraté' },
  });
  check(
    "le club rival ne modifie pas l'équipe voisine",
    rivalUpdatesTeam.status === 404,
    rivalUpdatesTeam.body,
  );
  const rivalStealsCoach = await api<ErrorResponse>(
    'DELETE',
    `/clubs/me/coaches/${coach.body.clubMemberId}`,
    { token: rivalToken },
  );
  check(
    "le club rival ne supprime pas l'entraîneur voisin",
    rivalStealsCoach.status === 404,
    rivalStealsCoach.body,
  );

  // --- 11. Retrait de l'entraîneur ----------------------------------------
  console.log("\n11. Retrait de l'entraîneur");
  const removed = await api('DELETE', `/clubs/me/coaches/${coach.body.clubMemberId}`, {
    token: adminToken,
  });
  check("l'entraîneur est retiré", removed.status === 204, removed.body);
  const coachAfterRemoval = await api<ErrorResponse>('GET', '/teams', { token: coachToken });
  check(
    "son jeton ne donne plus accès aux équipes",
    coachAfterRemoval.status === 401 || coachAfterRemoval.status === 403,
    coachAfterRemoval,
  );

  // --- 12. Suppression d'équipe -------------------------------------------
  console.log("\n12. Suppression d'équipe");
  const deleted = await api('DELETE', `/teams/${teamB.body.id}`, { token: adminToken });
  check("l'équipe sans annonce est supprimée", deleted.status === 204, deleted.body);
  const teamsEnd = await api<TeamResponse[]>('GET', '/teams', { token: adminToken });
  check('il reste 1 équipe', teamsEnd.body.length === 1, teamsEnd.body.length);

  // --- Nettoyage -----------------------------------------------------------
  console.log('\nNettoyage des données de test');
  sql(
    `DELETE FROM \`Club\` WHERE name LIKE 'FC E2E %' OR name LIKE 'FC Rival %';` +
      `DELETE FROM \`User\` WHERE email LIKE '%@${DOMAIN}';`,
  );

  console.log(`\n${checks - failures}/${checks} vérifications réussies.`);
  if (failures > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
