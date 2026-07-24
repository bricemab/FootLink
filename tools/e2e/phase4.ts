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
  const request = (): Promise<Response> =>
    fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(options.token === undefined ? {} : { Authorization: `Bearer ${options.token}` }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

  let response: Response;
  try {
    response = await request();
  } catch {
    // Les appels `sql()` bloquent la boucle d'événements plusieurs secondes :
    // le serveur ferme entre-temps les sockets keep-alive inactives, et la
    // requête suivante part sur une connexion morte (ECONNRESET). Un seul
    // réessai suffit, la nouvelle connexion est saine.
    response = await request();
  }

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
  firstName: string | null;
  lastName: string | null;
  hasAccepted: boolean;
  teams: { id: string }[];
}

/** POST /teams renvoie l'équipe ET l'entraîneur créé au passage, s'il y en a un. */
interface CreateTeamResponse {
  team: TeamResponse;
  coach: CoachResponse | null;
}

interface DeletionImpact {
  listings: number;
  applications: number;
  matches: number;
  conversations: number;
  messages: number;
  isEmpty: boolean;
}

interface ErrorResponse {
  error?: { code?: string; message?: string | string[]; impact?: DeletionImpact };
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

  // Changer de langue doit rester possible sans email validé : c'est justement
  // quand on ne comprend pas l'écran de validation qu'on en a besoin.
  const switchLocale = await api<{ locale: string }>('PATCH', '/users/me/locale', {
    token: adminToken,
    body: { locale: 'DE' },
  });
  check('la langue se change sans email validé', switchLocale.status === 200, switchLocale.body);
  const meAfterLocale = await api<{ locale: string }>('GET', '/auth/me', { token: adminToken });
  check('la langue est bien persistée', meAfterLocale.body.locale === 'DE', meAfterLocale.body);
  const badLocale = await api<ErrorResponse>('PATCH', '/users/me/locale', {
    token: adminToken,
    body: { locale: 'ES' },
  });
  check('une langue non supportée est refusée', badLocale.status === 400, badLocale.body);
  await api('PATCH', '/users/me/locale', { token: adminToken, body: { locale: 'FR' } });

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
  // Charge utile volontairement VALIDE : sinon on testerait la validation du
  // DTO (400) au lieu de la garde « club non approuvé » (403).
  const earlyCoach = await api<ErrorResponse>('POST', '/clubs/me/coaches', {
    token: adminToken,
    body: { email: coachEmail, firstName: 'Yann', lastName: 'Bianchi' },
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
  const teamA = await api<CreateTeamResponse>('POST', '/teams', {
    token: adminToken,
    body: { category: 'TROISIEME_LIGUE', gender: 'MALE', name: 'Trois A' },
  });
  check('la première équipe est créée', teamA.status === 201, teamA.body);
  check('aucun entraîneur si on ne le demande pas', teamA.body.coach === null, teamA.body.coach);
  const teamB = await api<CreateTeamResponse>('POST', '/teams', {
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

  // --- 6bis. Équipe créée AVEC son entraîneur ------------------------------
  console.log("\n6bis. Création d'une équipe avec son entraîneur");
  const withCoachEmail = `duo-${RUN}@${DOMAIN}`;
  const teamWithCoach = await api<CreateTeamResponse>('POST', '/teams', {
    token: adminToken,
    body: {
      category: 'QUATRIEME_LIGUE',
      gender: 'MALE',
      name: 'Quatre A',
      coach: { email: withCoachEmail, firstName: 'Diego', lastName: 'Rossi' },
    },
  });
  check("l'équipe et l'entraîneur sont créés ensemble", teamWithCoach.status === 201, teamWithCoach.body);
  check(
    "le nom de l'entraîneur est enregistré",
    teamWithCoach.body.coach?.firstName === 'Diego' && teamWithCoach.body.coach?.lastName === 'Rossi',
    teamWithCoach.body.coach,
  );
  check(
    "il est assigné à l'équipe créée",
    teamWithCoach.body.coach?.teams[0]?.id === teamWithCoach.body.team.id,
    teamWithCoach.body.coach?.teams,
  );
  check(
    "il reçoit bien une invitation",
    (await readEmailToken(withCoachEmail)).length > 0,
  );

  // Entraîneur invalide -> aucune équipe orpheline ne doit rester derrière.
  const teamsBeforeFailure = (await api<TeamResponse[]>('GET', '/teams', { token: adminToken })).body
    .length;
  const rejectedDuo = await api<ErrorResponse>('POST', '/teams', {
    token: adminToken,
    body: {
      category: 'CINQUIEME_LIGUE',
      coach: { email: withCoachEmail, firstName: 'Diego', lastName: 'Rossi' },
    },
  });
  check('un entraîneur déjà membre est refusé', rejectedDuo.status === 409, rejectedDuo.body);
  const teamsAfterFailure = (await api<TeamResponse[]>('GET', '/teams', { token: adminToken })).body
    .length;
  check(
    "l'équipe n'est pas créée si l'entraîneur est refusé",
    teamsAfterFailure === teamsBeforeFailure,
    { teamsBeforeFailure, teamsAfterFailure },
  );

  // --- 7. Compte entraîneur + invitation ----------------------------------
  console.log('\n7. Compte entraîneur');
  const coach = await api<CoachResponse>('POST', '/clubs/me/coaches', {
    token: adminToken,
    body: { email: coachEmail, firstName: 'Yann', lastName: 'Bianchi', teamIds: [teamA.body.team.id] },
  });
  check("l'entraîneur est créé", coach.status === 201, coach.body);
  check("l'invitation est en attente", coach.body.hasAccepted === false, coach.body);
  check('une équipe lui est assignée', coach.body.teams.length === 1, coach.body.teams);
  check(
    'son identité est exposée au club',
    coach.body.firstName === 'Yann' && coach.body.lastName === 'Bianchi',
    coach.body,
  );

  const namelessCoach = await api<ErrorResponse>('POST', '/clubs/me/coaches', {
    token: adminToken,
    body: { email: `sansnom-${RUN}@${DOMAIN}` },
  });
  check('un entraîneur sans nom est refusé', namelessCoach.status === 400, namelessCoach.body);

  const foreignTeam = await api<ErrorResponse>('POST', '/clubs/me/coaches', {
    token: adminToken,
    body: {
      email: `other-${RUN}@${DOMAIN}`,
      firstName: 'Alex',
      lastName: 'Dupont',
      teamIds: ['clnotarealteamid00000000'],
    },
  });
  check(
    "assigner une équipe d'un autre club est refusé",
    foreignTeam.status === 400,
    foreignTeam.body,
  );

  const inviteCode = await readEmailToken(coachEmail);
  check('le code reçu fait 6 chiffres', /^\d{6}$/.test(inviteCode), inviteCode);

  // --- 7bis. L'écran d'entrée de l'entraîneur s'adapte ---------------------
  console.log("\n7bis. Étape d'entrée décidée par le serveur");
  const stepInvited = await api<{ step: string }>('POST', '/auth/coach-invite/status', {
    body: { email: coachEmail },
  });
  check('une invitation en attente demande le code', stepInvited.body.step === 'CODE', stepInvited.body);

  const stepUnknown = await api<{ step: string }>('POST', '/auth/coach-invite/status', {
    body: { email: `inconnu-${RUN}@${DOMAIN}` },
  });
  check('une adresse inconnue ne mène nulle part', stepUnknown.body.step === 'UNKNOWN', stepUnknown.body);

  const verifyWrong = await api<ErrorResponse>('POST', '/auth/coach-invite/verify', {
    body: { email: coachEmail, code: inviteCode === '000000' ? '111111' : '000000' },
  });
  check('vérifier un code faux échoue', verifyWrong.status === 400, verifyWrong.body);

  const verifyRight = await api('POST', '/auth/coach-invite/verify', {
    body: { email: coachEmail, code: inviteCode },
  });
  check('vérifier le bon code réussit', verifyRight.status === 204, verifyRight.body);

  const resendUnknown = await api('POST', '/auth/coach-invite/resend', {
    body: { email: `inconnu-${RUN}@${DOMAIN}` },
  });
  check(
    "renvoyer un code à une adresse inconnue répond quand même 204",
    resendUnknown.status === 204,
    resendUnknown.status,
  );

  // Un code faux ne doit rien révéler et doit compter comme une tentative.
  const wrongCode = await api<ErrorResponse>('POST', '/auth/coach-invite/accept', {
    body: { email: coachEmail, code: inviteCode === '000000' ? '111111' : '000000', password: PASSWORD },
  });
  check('un code faux est refusé', wrongCode.status === 400, wrongCode.body);
  check(
    'le refus ne dit pas si le compte existe',
    wrongCode.body.error?.code === 'COACH_INVITE_INVALID',
    wrongCode.body,
  );
  const unknownEmail = await api<ErrorResponse>('POST', '/auth/coach-invite/accept', {
    body: { email: `fantome-${RUN}@${DOMAIN}`, code: '123456', password: PASSWORD },
  });
  check(
    'un email inconnu renvoie exactement la même erreur',
    unknownEmail.status === 400 && unknownEmail.body.error?.code === 'COACH_INVITE_INVALID',
    unknownEmail.body,
  );

  const accepted = await api<Tokens>('POST', '/auth/coach-invite/accept', {
    body: { email: coachEmail, code: inviteCode, password: PASSWORD },
  });
  check("l'invitation est acceptée", accepted.status === 201, accepted.body);
  const coachToken = accepted.body.accessToken;

  const replay = await api<ErrorResponse>('POST', '/auth/coach-invite/accept', {
    body: { email: coachEmail, code: inviteCode, password: PASSWORD },
  });
  check('le code d’invitation est à usage unique', replay.status === 400, replay.body);

  const coachMe = await api<{ emailVerified: boolean }>('GET', '/auth/me', { token: coachToken });
  check(
    "activer le compte a validé l'email du même coup",
    coachMe.body.emailVerified === true,
    coachMe.body,
  );

  const stepActivated = await api<{ step: string }>('POST', '/auth/coach-invite/status', {
    body: { email: coachEmail },
  });
  check(
    'un compte activé demande désormais le mot de passe',
    stepActivated.body.step === 'PASSWORD',
    stepActivated.body,
  );

  // --- 8. Isolation de l'entraîneur ---------------------------------------
  console.log("\n8. Isolation de l'entraîneur");
  const coachTeams = await api<TeamResponse[]>('GET', '/teams', { token: coachToken });
  check(
    "l'entraîneur ne voit que son équipe assignée",
    coachTeams.body.length === 1 && coachTeams.body[0].id === teamA.body.team.id,
    coachTeams.body.map((team) => team.name),
  );
  const coachOnOwnTeam = await api('GET', `/teams/${teamA.body.team.id}`, { token: coachToken });
  check('il accède à son équipe', coachOnOwnTeam.status === 200, coachOnOwnTeam.body);
  const coachOnOtherTeam = await api<ErrorResponse>('GET', `/teams/${teamB.body.team.id}`, {
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
    body: { teamIds: [teamA.body.team.id, teamB.body.team.id] },
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
  const rivalReadsTeam = await api<ErrorResponse>('GET', `/teams/${teamA.body.team.id}`, {
    token: rivalToken,
  });
  check("le club rival ne lit pas l'équipe voisine", rivalReadsTeam.status === 404, rivalReadsTeam.body);
  const rivalUpdatesTeam = await api<ErrorResponse>('PATCH', `/teams/${teamA.body.team.id}`, {
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

  const emptyImpact = await api<DeletionImpact>(
    'GET',
    `/teams/${teamB.body.team.id}/deletion-impact`,
    { token: adminToken },
  );
  check("l'impact d'une équipe vide est nul", emptyImpact.body.isEmpty === true, emptyImpact.body);

  const deleted = await api('DELETE', `/teams/${teamB.body.team.id}`, { token: adminToken });
  check(
    "une équipe sans rien à détruire part sans confirmation",
    deleted.status === 204,
    deleted.body,
  );

  // Une équipe qui porte une annonce ne doit PAS partir sans confirmation.
  const listingTeam = await api<CreateTeamResponse>('POST', '/teams', {
    token: adminToken,
    body: { category: 'DEUXIEME_LIGUE', gender: 'MALE', name: 'Deux A' },
  });
  sql(
    `INSERT INTO \`Listing\` (id, teamId, posteRecherche, status, season, createdAt, updatedAt) ` +
      `VALUES ('e2elisting${RUN}', '${listingTeam.body.team.id}', 'GARDIEN', 'ACTIVE', '2026/2027', NOW(3), NOW(3));`,
  );

  const impact = await api<DeletionImpact>(
    'GET',
    `/teams/${listingTeam.body.team.id}/deletion-impact`,
    { token: adminToken },
  );
  check("l'impact remonte l'annonce", impact.body.listings === 1, impact.body);
  check("l'impact n'est pas vide", impact.body.isEmpty === false, impact.body);

  const refused = await api<ErrorResponse>('DELETE', `/teams/${listingTeam.body.team.id}`, {
    token: adminToken,
  });
  check('la suppression est refusée sans confirmation', refused.status === 409, refused.body);
  check(
    'le refus porte un code exploitable par l’app',
    refused.body.error?.code === 'TEAM_DELETION_CONFIRMATION_REQUIRED',
    refused.body,
  );
  check(
    'le refus contient le décompte à afficher dans l’alerte',
    refused.body.error?.impact?.listings === 1,
    refused.body.error?.impact,
  );

  const confirmed = await api('DELETE', `/teams/${listingTeam.body.team.id}?confirm=true`, {
    token: adminToken,
  });
  check('la suppression confirmée passe', confirmed.status === 204, confirmed.body);

  const impactGone = await api<ErrorResponse>(
    'GET',
    `/teams/${listingTeam.body.team.id}/deletion-impact`,
    { token: adminToken },
  );
  check("l'équipe n'existe plus", impactGone.status === 404, impactGone.body);

  // --- 12bis. Verrouillage du code après trop d'essais ---------------------
  console.log("\n12bis. Le code d'invitation se brûle après 5 essais ratés");
  // L'endpoint est volontairement rate-limité (c'est la première protection
  // contre la force brute d'un code à 6 chiffres). Cette section en consomme
  // le quota : on attend la fenêtre suivante pour tester le VERROU applicatif
  // sans être coupé par le rate-limit.
  console.log('   (attente de la fenêtre de rate-limit, ~1 min)');
  await new Promise((done) => setTimeout(done, 61_000));

  const lockedEmail = `verrou-${RUN}@${DOMAIN}`;
  const lockedCoach = await api<CoachResponse>('POST', '/clubs/me/coaches', {
    token: adminToken,
    body: { email: lockedEmail, firstName: 'Nadia', lastName: 'Perret' },
  });
  const realCode = await readEmailToken(lockedEmail);
  const wrong = realCode === '000000' ? '111111' : '000000';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await api('POST', '/auth/coach-invite/accept', {
      body: { email: lockedEmail, code: wrong, password: PASSWORD },
    });
  }
  const afterLock = await api<ErrorResponse>('POST', '/auth/coach-invite/accept', {
    body: { email: lockedEmail, code: realCode, password: PASSWORD },
  });
  check(
    'même le bon code ne passe plus une fois verrouillé',
    afterLock.body.error?.code === 'COACH_INVITE_LOCKED',
    afterLock.body,
  );

  // L'entraîneur se débloque lui-même, sans repasser par son club.
  const selfResend = await api('POST', '/auth/coach-invite/resend', {
    body: { email: lockedEmail },
  });
  check("l'entraîneur peut redemander un code lui-même", selfResend.status === 204, selfResend.status);
  const freshCode = await readEmailToken(lockedEmail);
  check('le code renvoyé est neuf', freshCode !== realCode, { realCode, freshCode });
  const unlocked = await api<Tokens>('POST', '/auth/coach-invite/accept', {
    body: { email: lockedEmail, code: freshCode, password: PASSWORD },
  });
  check('le nouveau code débloque le compte', unlocked.status === 201, unlocked.body);
  const staleCode = await api<ErrorResponse>('POST', '/auth/coach-invite/accept', {
    body: { email: lockedEmail, code: realCode, password: PASSWORD },
  });
  check("l'ancien code est bien mort", staleCode.status === 400, staleCode.body);

  // --- 13. Page de rebond des liens d'email --------------------------------
  console.log("\n13. Page de rebond des liens d'email");
  const bounceUrl = `${BASE.replace(/\/api\/v1$/, '')}/l/coach-invite?email=a%40b.ch&code=123456`;
  const bounce = await fetch(bounceUrl);
  const bounceHtml = await bounce.text();
  check('la page répond', bounce.status === 200, bounce.status);
  check(
    "elle ouvre l'app sur l'écran d'activation, pré-rempli",
    bounceHtml.includes('footlink://register/coach?email=a%40b.ch&code=123456'),
  );
  check('elle prévoit le repli vers le store', bounceHtml.includes('play.google.com'));
  const unknownAction = await fetch(`${BASE.replace(/\/api\/v1$/, '')}/l/nimporte-quoi`);
  check('une action inconnue est refusée', unknownAction.status === 400, unknownAction.status);

  // --- 14. Rate-limit sur l'activation entraîneur --------------------------
  // Le verrou applicatif brûle un code après 5 essais, mais rien n'empêcherait
  // d'essayer un million de codes sur un million d'emails : c'est le
  // rate-limit qui borne le débit. En dernier, parce qu'il épuise le quota.
  console.log("\n14. Rate-limit sur l'activation entraîneur");
  let sawThrottle = false;
  for (let attempt = 0; attempt < 15 && !sawThrottle; attempt += 1) {
    const response = await api('POST', '/auth/coach-invite/accept', {
      body: { email: `brute-${RUN}@${DOMAIN}`, code: '424242', password: PASSWORD },
    });
    sawThrottle = response.status === 429;
  }
  check('les essais en rafale finissent bloqués (429)', sawThrottle);

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
