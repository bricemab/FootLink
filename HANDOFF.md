# HANDOFF — état du projet FootLink

> **Fichier de passation.** À lire en premier par toute nouvelle instance de Claude Code
> qui reprend le projet sans le contexte de la conversation précédente.
> Dernière mise à jour : **23 juillet 2026** (fin de la Phase 3).

## 0. Ordre de lecture

1. **`CLAUDE.md`** — règles ultra-importantes (sécurité, auth, décisions, conventions).
2. **Ce fichier** — état d'avancement, décisions de session, setup machine.
3. **`AGENTS.md`** — spécification complète et **figée** (ne jamais dévier sans accord de Brice).
4. **`apps/api/prisma/schema.prisma`** — modèle de données.
5. **`nomenclature_football_suisse.json`** — données de référence (ligues, catégories, postes, régions).

**Règle d'or** : les décisions d'`AGENTS.md` sont arrêtées. Si tu repères une incohérence ou un manque, **signale-le à Brice**, ne tranche pas seul.

---

## 1. Où on en est

Backend d'abord (choix validé), mobile ensuite. Tout ce qui est fait est **commité et vérifié end-to-end** (pas juste compilé).

| Phase | Sujet | Statut |
|---|---|---|
| 0 | Fondations monorepo + API (NestJS, Prisma, config, health) | ✅ `2b49364` |
| 1 | Auth : email+mdp+validation email, Google Sign-In, JWT | ✅ `253f06e` |
| 2 | Profil joueur + géo (arrondi ~1 km) + helpers saison | ✅ `a4b9c49` |
| 3 | Demande & validation club + lien club actuel du joueur | ✅ `cfa2f68` |
| 4 | Équipes & comptes entraîneurs (`CoachTeamAssignment`) | ⬜ à faire |
| 5 | Annonces (listings) + scheduler d'expiration | ⬜ |
| 6 | Feed & matching (poste + catégorie + rayon km) | ⬜ |
| 7 | Interactions & match (`PlayerInterest`/`ClubInterest` → `Match`) | ⬜ |
| 8 | Messagerie temps réel (WebSocket, `ConversationRead`) | ⬜ |
| 9 | Notifications (Expo push + table `Notification`) | ⬜ |
| 10 | Modération (`Report`, `Block` + filtrage transverse) | ⬜ |
| 11 | Durcissement (ESLint, tests e2e, Swagger, rate-limit) | ⬜ |
| — | **Mobile Expo (UI/UX WOW)** | ⬜ |

### ⚠️ Décision en attente de Brice
Après la Phase 3, deux options ont été proposées, **il n'a pas encore tranché** :
- **Option 1** : enchaîner la **Phase 4** (équipes + entraîneurs).
- **Option 2** : bifurquer sur le **mobile M0** (Expo + Tamagui + design system + écrans auth/onboarding animés) pour voir enfin l'app, puis revenir au backend. *(L'UI/UX est la priorité n°1 du projet — Claude penchait pour cette option.)*

**Demander à Brice avant de démarrer l'une ou l'autre.**

---

## 2. API en place (`/api/v1`)

| Endpoint | Accès | Note |
|---|---|---|
| `GET /health`, `GET /app/config` | public | sonde + gate de version min |
| `POST /auth/register` | public | crée un `PLAYER` + envoie l'email de vérification |
| `POST /auth/login` · `POST /auth/refresh` | public | refresh **rotatif** (réutilisation → 401) |
| `POST /auth/google` | public | jeton ID vérifié serveur (audiences iOS + Web) |
| `POST /auth/verify-email` · `password/forgot` · `password/reset` | public | jetons hashés, usage unique |
| `POST /auth/logout` · `resend-verification` | auth | |
| `GET /auth/me` | auth | **lu en DB** : `emailVerified`, `status`, `hasPassword`, `hasGoogle` |
| `GET/PUT /players/me` | auth | profil + postes ; garde 16+ ; géo arrondie ~1 km |
| `POST /clubs/requests` | public | crée compte `CLUB_ADMIN` + `Club PENDING` (transaction) |
| `GET/PATCH /clubs/me` | auth | **clubId dérivé du token, jamais du client** |
| `GET /clubs?search=` | auth | clubs sélectionnables (APPROVED) |
| `GET /regions` | public | 13 associations (table seedée) |
| `GET /admin/clubs` · `POST /admin/clubs/:id/approve\|reject` | **SUPER_ADMIN** | pas d'UI web (back-office = post-MVP) |

---

## 3. Décisions prises pendant la session (en plus d'`AGENTS.md`)

1. **Région** = table `Region` seedée, rattachée **au club uniquement**. Un joueur n'a **pas** de région : il reste trouvable inter-cantons via le rayon géo (un joueur près de la frontière VD/VS doit être visible des deux côtés).
2. **Emails** via Gmail SMTP + app password (Nodemailer). Modèle `Token` (EMAIL_VERIFY / PASSWORD_RESET / COACH_INVITE), hashé argon2, usage unique.
3. **Table `Notification`** prévue (in-app + badge) **en plus** du push Expo.
4. **Multilecture** : `ConversationRead` (`lastReadAt` par user). `Message.readAt` supprimé.
5. **Nomenclature** : les enums Prisma sont la source des codes ; les libellés FR/DE vivent dans `packages/shared` ; **seule** la table `Region` est seedée.
6. **Mineurs** : 16+ au MVP, `isMinor` vrai pour les 16-17 ans, **aucun tuteur** (`guardian*` inutilisés).
7. **Auth** : inscription/connexion par **email+mot de passe avec validation email** *ou* **Google Sign-In**.
8. **`/auth/me` lit la DB**, le token ne porte **pas** `emailVerified` (il serait périmé jusqu'au refresh). Pour *bloquer* des actions plus tard → guard dédié `@Verified()`, pas le token.
9. **La vérification email ne bloque pas le login** aujourd'hui (choix assumé, à revoir si Brice veut durcir).
10. **`PlayerProfile.currentClubId` → `Club`** (demandé par Brice) : lien **déclaratif et NON vérifié**. Il ne crée **aucun `ClubMember`** et **aucun droit** sur le club. `currentClubName` est conservé en **repli** quand le club n'est pas encore sur FootLink.
11. **API d'administration** (SUPER_ADMIN) créée pour valider les clubs, mais **aucune UI web** (le back-office reste post-MVP conformément à `AGENTS.md`).
12. Stack : **pnpm 10 + Turborepo**, **NestJS 11**, **Prisma 6.19** (Prisma 7 dispo, upgrade repoussé), base MySQL `footlink`.
13. **Messages d'erreur de l'API en anglais** (réponses JSON + erreurs de démarrage). L'API n'est pas la couche de traduction : le mobile affiche du FR/DE à partir du `statusCode` et de son propre catalogue i18n. Les **emails** restent localisés FR/DE (`MailService`). Ne pas réintroduire de français dans un `throw new ...Exception(...)`.

---

## 4. Setup sur une nouvelle machine

**Prérequis** : Node ≥ 20 (testé 24), **pnpm 10**, **MySQL 8** en local, Git.

```bash
pnpm install
```

### ⚠️ `.env` n'est PAS commité (secrets)
Il faut le recréer : `apps/api/.env` (copier `apps/api/.env.example`), puis renseigner :

| Variable | Où la trouver |
|---|---|
| `DATABASE_URL` | `mysql://root:<mot_de_passe>@localhost:3306/footlink` (MySQL local de Brice) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | n'importe quelles chaînes fortes (**≥ 16 caractères**, sinon le démarrage échoue) |
| `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587` | fixe |
| `SMTP_USER`, `EMAIL_FROM` | l'adresse Gmail de Brice |
| `SMTP_PASSWORD` | **app password Google** (16 car.) — à redemander à Brice, jamais commité |
| `EMAIL_FROM_NAME` | `FootLink` |
| `GOOGLE_CLIENT_IDS` | identifiants **publics**, liste séparée par des virgules : `988726398910-pu1ivi7aoamal3sstohtqr8qdnp8j38d.apps.googleusercontent.com` (iOS) et `988726398910-5g4vq425rtibek5jg3rjpuap6mquglo9.apps.googleusercontent.com` (Web) |
| `GOOGLE_CLIENT_SECRET` | **non nécessaire** au flux natif ; dispo dans la Google Cloud Console (projet `footlink-503320`) |

Sans SMTP configuré, les emails ne sont **pas** envoyés : ils sont **logués** (transport JSON) — pratique pour tester.

### Base de données puis démarrage
```bash
pnpm db:migrate   # applique les migrations (crée la base si absente)
pnpm db:seed      # seed des 13 régions (AVF active)
pnpm api:dev      # http://localhost:3000/api/v1
```

> `packages/shared` doit être **buildé avant** `apps/api` (l'API l'importe). `pnpm build` respecte l'ordre via Turborepo. En cas d'erreur d'import `@footlink/shared` : `pnpm --filter @footlink/shared build`.

---

## 5. Tester

Ouvre **`tools/api-tester.html`** dans un navigateur (double-clic) : page autonome (inscription, login, `/me`, refresh, vérification email, profil joueur). Le CORS autorise le `file://` (origin `null`).

Pour devenir **SUPER_ADMIN** (valider les clubs) : s'inscrire, puis
```bash
printf "UPDATE \`User\` SET role='SUPER_ADMIN' WHERE email='TON_EMAIL';" | pnpm --filter @footlink/api exec prisma db execute --stdin --schema prisma/schema.prisma
```
puis **se reconnecter** (le rôle est gravé dans le token à l'émission).

---

## 6. TODO / questions ouvertes

- **[Décision Brice]** Phase 4 backend **ou** détour mobile M0 (cf. §1).
- **[Décision Brice] Catalogue de clubs** : au lancement `GET /clubs` sera quasi vide (seuls les clubs validés existent) → un joueur ne pourra pas sélectionner son club réel. Option **A** = liste + saisie libre (codé aujourd'hui) ; option **B** = seeder un catalogue des ~150 clubs AVF (source à trouver, ex. matchcenter AVF) + distinguer *catalogue* vs *compte réclamé*. Recommandation : **B avant le lancement**.
- **Client OAuth Android** non créé : exige le **SHA-1** du keystore de signature, disponible seulement une fois le mobile initialisé (`eas credentials`). À faire à la phase mobile.
- **Bandes juniors** (U18/U19 → Juniors A, etc.) dans `packages/shared/src/season.ts` : table **documentée mais à confirmer** avec les prescriptions AVF. Sans impact au MVP (16+).
- **`Region.labelDe`** = copie du libellé FR (le JSON ne fournit pas de libellé allemand). À corriger.
- **ESLint** volontairement reporté à la Phase 11 (pour ne pas livrer une config bancale).
- **Prisma** : `package.json#prisma` est déprécié (Prisma 7) → migrer vers `prisma.config.ts` au durcissement.
- **`GET /players/me`** renvoie `null` (HTTP 200) si aucun profil : c'est voulu (l'app sait qu'il faut onboarder).

---

## 7. Pièges connus (environnement Windows)

- Le **répertoire courant persiste** entre appels de l'outil Bash → éviter les `cd` relatifs, préférer `pnpm --filter <pkg>`.
- Arrêter le serveur : PowerShell `Get-NetTCPConnection -LocalPort 3000` puis `Stop-Process`. Un serveur lancé en tâche de fond se termine avec **exit 127 après un kill forcé** : c'est **normal**, pas une erreur.
- `prisma migrate dev` **sans `--name`** ouvre un prompt interactif → toujours passer `--name`.
- Ne **jamais** commiter `apps/api/.env`. Vérifier avant chaque commit :
  `git diff --cached --name-only | grep -E '(^|/)\.env$'` doit être **vide**.

---

## 8. Rappels de conventions

- **TypeScript strict, jamais `any`.**
- **Sécurité** : rien sans authentification (guard JWT global, `@Public()` pour les exceptions) ; autorisation vérifiée sur **chaque** ressource (anti-IDOR) ; ne jamais faire confiance à un ID venant du client (le `clubId` se dérive du token).
- **`use context7`** pour la doc à jour des librairies (non connecté dans la session précédente : `.mcp.json` est en place, il se charge au démarrage de Claude Code).
- Poser une question à Brice avant toute action risquée ou toute déviation d'`AGENTS.md`.
