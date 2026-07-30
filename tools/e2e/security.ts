/**
 * Vérification end-to-end des correctifs de l'audit de sécurité du 26/07/2026.
 *
 * Lancement (depuis la racine du dépôt) :
 *   pnpm --filter @footlink/api exec tsx <chemin ABSOLU vers ce fichier>
 *
 * ⚠️ **À lancer SEUL.** `POST /auth/login` a son propre seau de 10 requêtes par
 * minute et par IP (`@Throttle` par route) ; cette suite en consomme 7. Lancée
 * en parallèle d'une autre suite, elle prend des 429 qui ressemblent à des
 * régressions — le piège s'est déjà payé une fois (cf. HANDOFF).
 *
 * Ce qu'elle couvre, et pourquoi ces contrôles-là :
 *
 * 1. **En-têtes de sécurité et CORS** (audit #3, #12). Vérifiables sans compte,
 *    donc aucune raison de ne pas les vérifier.
 * 2. **Politique de mot de passe** (audit #13) : 9 caractères refusés, 10 acceptés.
 * 3. **Verrou de compte au login** (audit #13). Contrôlé par son COMPORTEMENT,
 *    jamais en lisant le compteur : `prisma db execute` ne retourne pas de
 *    lignes. On force donc l'état en base par des `UPDATE` **conditionnels**, et
 *    c'est la réponse de l'API qui révèle si la condition portait.
 * 4. **Détection de réutilisation d'un refresh token** (audit #10) : rejouer un
 *    jeton rotaté doit tuer TOUTE la famille, pas seulement le jeton rejoué.
 * 5. **Consommation atomique des jetons** (audit #11).
 *
 * Variables :
 *   E2E_BASE  URL de base de l'API (défaut http://localhost:3000/api/v1)
 *
 * Non couvert ici, et il faut le savoir : **l'échappement HTML des emails**
 * (audit #1). Le transport simulé ne journalise que sujet, destinataire et
 * jeton — jamais le corps HTML — donc rien d'observable de l'extérieur. Ce
 * correctif repose sur la relecture du code de `mail.service.ts`.
 *
 * Les comptes vivent sur @e2e.footlink.test et sont supprimés à la fin, y
 * compris si un contrôle échoue.
 *
 * Note : les écritures en base passent par la CLI Prisma (`db execute`) et non
 * par `@prisma/client` — un script hors d'`apps/api` ne résout pas le même
 * client généré (contrepartie du `nodeLinker: hoisted`, cf. HANDOFF §7).
 */
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000/api/v1';
const ORIGIN = BASE.replace(/\/api\/v1\/?$/, '');
const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const RUN = Date.now().toString(36);
const DOMAIN = 'e2e.footlink.test';
const PASSWORD = 'FootLink2026';
const email = `sec-${RUN}@${DOMAIN}`;

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
  headers: Headers;
}

async function call<T>(
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<Called<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.headers ?? {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await res.text();
  let body: T | undefined;
  try {
    body = text.length > 0 ? (JSON.parse(text) as T) : undefined;
  } catch {
    body = undefined;
  }
  return { status: res.status, body, headers: res.headers };
}

const login = (password: string): Promise<Called<{ accessToken: string; refreshToken: string }>> =>
  call('POST', '/auth/login', { body: { email, password } });

async function main(): Promise<void> {
  try {
    // ---------------------------------------------------------------- en-têtes
    const config = await call('GET', '/app/config');
    check('en-tête X-Content-Type-Options', config.headers.get('x-content-type-options') === 'nosniff');
    check('en-tête X-Frame-Options', config.headers.get('x-frame-options') === 'DENY');
    check('en-tête Referrer-Policy', config.headers.get('referrer-policy') === 'no-referrer');
    check(
      "CSP verrouillée sur l'API JSON",
      config.headers.get('content-security-policy') === "default-src 'none'",
      config.headers.get('content-security-policy'),
    );

    // La page de rebond des liens d'email est le SEUL HTML servi : sa CSP est
    // assouplie pour l'inline qu'elle utilise, et pour rien de plus.
    const bounce = await fetch(`${ORIGIN}/l/verify-email?token=x`);
    const bounceCsp = bounce.headers.get('content-security-policy') ?? '';
    check("CSP assouplie sur /l/ pour l'inline", bounceCsp.includes("script-src 'unsafe-inline'"), bounceCsp);
    check("CSP de /l/ garde default-src 'none'", bounceCsp.includes("default-src 'none'"), bounceCsp);

    // ------------------------------------------------------------------- CORS
    const preflight = await fetch(`${BASE}/auth/login`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    });
    check(
      'CORS : aucun Allow-Credentials (auth par header Bearer, aucun cookie)',
      preflight.headers.get('access-control-allow-credentials') === null,
      preflight.headers.get('access-control-allow-credentials'),
    );

    // ------------------------------------------------- politique mot de passe
    const short = await call('POST', '/auth/register', {
      body: { email: `short-${RUN}@${DOMAIN}`, password: 'Footlink1' },
    });
    check('mot de passe de 9 caractères refusé', short.status === 400, short.status);

    const created = await call('POST', '/auth/register', { body: { email, password: PASSWORD } });
    check('mot de passe de 12 caractères accepté', created.status === 201, created.body);

    // --------------------------------------------------- verrou au login (#13)
    // 3 échecs : sous le seuil de 10, le compte doit rester utilisable.
    for (let i = 0; i < 3; i += 1) {
      await login('MauvaisMotDePasse99');
    }
    const stillOpen = await login(PASSWORD);
    check('3 échecs : le bon mot de passe passe encore', stillOpen.status === 200, stillOpen.status);

    /*
     * Le succès ci-dessus doit avoir remis le compteur à zéro. On ne peut pas le
     * LIRE, alors on pose un verrou UNIQUEMENT si le compteur est resté non nul.
     * L'API répond ensuite : 200 = le compteur avait bien été remis à zéro,
     * 401 = il ne l'avait pas été.
     */
    sql(
      `UPDATE User SET loginLockedUntil = DATE_ADD(NOW(), INTERVAL 15 MINUTE)
       WHERE email = '${email}' AND failedLoginAttempts <> 0;`,
    );
    const afterReset = await login(PASSWORD);
    check(
      'un login réussi remet le compteur d’échecs à zéro',
      afterReset.status === 200,
      afterReset.status,
    );

    // Seuil atteint : forcé en base, parce que le throttle par IP (10/min) rend
    // 10 échecs inatteignables depuis une seule adresse — c'est précisément
    // pourquoi ce verrou existe (credential stuffing distribué).
    sql(
      `UPDATE User SET failedLoginAttempts = 10,
         loginLockedUntil = DATE_ADD(NOW(), INTERVAL 15 MINUTE)
       WHERE email = '${email}';`,
    );
    const locked = await login(PASSWORD);
    check('compte verrouillé : le bon mot de passe est refusé', locked.status === 401, locked.status);
    check(
      'le refus ne révèle pas le verrou (pas d’oracle sur l’existence du compte)',
      !JSON.stringify(locked.body ?? {}).toLowerCase().includes('lock'),
      locked.body,
    );

    /*
     * ⚠️ `INTERVAL 1 DAY` et non `1 SECOND`, et ce n'est pas de la prudence
     * gratuite : `NOW()` en SQL brut renvoie l'heure LOCALE du serveur MySQL
     * (+02:00 ici) alors que Prisma relit le `DATETIME` comme de l'UTC. Un
     * verrou « expiré d'une seconde » se relit donc DEUX HEURES dans le futur,
     * et le contrôle échoue en accusant le code applicatif. Un jour d'écart
     * reste sans ambiguïté quel que soit le fuseau du poste.
     *
     * Le code applicatif n'est pas concerné : il n'écrit ces dates que via
     * Prisma (`new Date()`), donc en UTC de bout en bout. Seul le SQL brut —
     * c'est-à-dire ces scripts — doit y faire attention.
     */
    sql(
      `UPDATE User SET loginLockedUntil = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE email = '${email}';`,
    );
    const unlocked = await login(PASSWORD);
    check('verrou expiré : accès rendu', unlocked.status === 200, unlocked.status);

    // ------------------------------- réutilisation d'un refresh token (#10)
    const first = unlocked.body;
    check('le login renvoie bien un refresh token', typeof first?.refreshToken === 'string');
    if (!first) {
      return;
    }

    const rotated = await call<{ refreshToken: string }>('POST', '/auth/refresh', {
      body: { refreshToken: first.refreshToken },
    });
    check('rotation du refresh token', rotated.status === 200, rotated.status);

    /*
     * 🔴 **Rejeu IMMÉDIAT d'un jeton dont le successeur n'a jamais servi.**
     *
     * Ce n'est pas un vol, c'est une réponse perdue en route : le serveur a
     * rotaté, l'app n'a jamais reçu le nouveau jeton, elle rejoue donc l'ancien
     * de bonne foi. Ça arrive pour de vrai sur mobile — réseau coupé à
     * mi-requête, application mise en arrière-plan, processus tué. Avant, ce cas
     * révoquait TOUTE la famille et déconnectait quelqu'un qui n'avait rien fait
     * de mal, sans qu'il puisse comprendre pourquoi.
     *
     * ⚠️ Ce contrôle attendait 401 jusqu'au 30/07/2026. Le changement est
     * DÉLIBÉRÉ et il assouplit le correctif #10 de l'audit : voir
     * `REPLAY_GRACE_MS` dans `token.service.ts` pour ce qu'il coûte exactement.
     */
    const replayed = await call<{ refreshToken: string; accessToken: string }>('POST', '/auth/refresh', {
      body: { refreshToken: first.refreshToken },
    });
    check(
      '🔴 rejeu immédiat, successeur inutilisé : toléré (réponse perdue, pas un vol)',
      replayed.status === 200,
      replayed.status,
    );

    /*
     * Le rattrapage doit rendre une session RÉELLEMENT utilisable — c'est tout
     * son intérêt. Un 200 qui renverrait une paire inerte serait pire que le
     * 401 qu'il remplace : l'app se croirait sauvée et échouerait à la requête
     * suivante.
     *
     * ⚠️ On ne vérifie PAS ici que le jeton repris par le rattrapage est mort.
     * Dans la fenêtre, n'importe quel maillon de la chaîne est rejouable une
     * fois : c'est la définition même de la tolérance, une réponse perdue étant
     * indistinguable d'un rejeu. La garantie qui tient, c'est qu'un seul jeton
     * est vivant à la fois — chaque rattrapage révoque celui qu'il reprend — et
     * que hors fenêtre tout redevient strict, ce que contrôlent les deux
     * vérifications suivantes.
     */
    const rescued = await call('GET', '/auth/me', {
      headers: { authorization: `Bearer ${replayed.body?.accessToken ?? ''}` },
    });
    check(
      'le rattrapage rend une session utilisable, pas une coquille vide',
      rescued.status === 200,
      rescued.status,
    );

    /*
     * 🔴 **Le contrôle de l'audit #10, toujours là.** Hors de la fenêtre de
     * tolérance, un rejeu redevient un vol présumé et tue toute la famille —
     * donc le jeton courant, pourtant légitime, meurt lui aussi.
     *
     * On vieillit la révocation en base plutôt que d'attendre une minute : c'est
     * la SEULE condition qui sépare les deux comportements, et un test qui
     * dormirait 60 s ne serait jamais relancé.
     */
    const current = replayed.body?.refreshToken ?? '';
    const replayedId = first.refreshToken.split('.')[0];
    sql(
      `UPDATE RefreshToken SET revokedAt = DATE_SUB(NOW(), INTERVAL 10 MINUTE)
       WHERE id = '${replayedId}';`,
    );
    const stolen = await call('POST', '/auth/refresh', {
      body: { refreshToken: first.refreshToken },
    });
    check('hors fenêtre, le rejeu est refusé', stolen.status === 401, stolen.status);

    const familyKilled = await call('POST', '/auth/refresh', {
      body: { refreshToken: current },
    });
    check(
      '🔴 …et il révoque toute la famille, pas seulement le jeton rejoué',
      familyKilled.status === 401,
      familyKilled.status,
    );
  } finally {
    sql(
      `DELETE FROM RefreshToken WHERE userId IN (SELECT id FROM User WHERE email LIKE '%@${DOMAIN}' AND email LIKE '%${RUN}%');
       DELETE FROM Token WHERE userId IN (SELECT id FROM User WHERE email LIKE '%@${DOMAIN}' AND email LIKE '%${RUN}%');
       DELETE FROM User WHERE email LIKE '%@${DOMAIN}' AND email LIKE '%${RUN}%';`,
    );
  }

  console.log(failures === 0 ? '\nTOUT PASSE' : `\n${failures} CONTROLE(S) EN ECHEC`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
