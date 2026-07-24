# HANDOFF — état du projet FootLink

> **Fichier de passation.** À lire en premier par toute nouvelle instance de Claude Code
> qui reprend le projet sans le contexte de la conversation précédente.
> Dernière mise à jour : **24 juillet 2026** (Phase 4 + mobile M0 + parcours d'inscription
> + **terrain du club géolocalisé**).

## 0bis. Démarrage rapide (nouvelle machine ou nouvelle session)

```bash
pnpm install
```
```bash
pnpm db:migrate && pnpm db:seed
```
Trois serveurs, chacun dans son terminal :
```bash
pnpm api:dev
```
```bash
pnpm --filter @footlink/shared dev
```
```bash
pnpm mobile:dev
```
Sur émulateur Android, après **chaque** redémarrage de celui-ci :
```bash
pnpm mobile:reverse
```

**Ce qu'il faut savoir avant de toucher au code :**
- `apps/api/.env` n'est **pas** commité → le recréer (§4), sinon l'API refuse de démarrer.
- Il contient désormais un **`MAPBOX_TOKEN`** (recherche du terrain d'un club). Sans lui, l'API répond 503 sur `/geo/places` et l'app bascule sur la saisie manuelle : l'inscription reste possible, mais aucun club n'aura de coordonnées.
- L'app mobile tourne sur un **development build** (pas Expo Go), à cause de Google Sign-In. `expo run:android` uniquement si la liste des modules natifs change ; sinon `pnpm mobile:dev --clear` suffit.
- Vérifier son travail avec `tools/e2e/phase4.ts` (§5), pas seulement en compilant.
- Poser une question à Brice avant toute déviation d'`AGENTS.md`.

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
| 4 | Équipes & comptes entraîneurs (`CoachTeamAssignment`) + blocage « email non validé » | ✅ |
| 5 | Annonces (listings) + scheduler d'expiration | ⬜ |
| 6 | Feed & matching (poste + catégorie + rayon km) | ⬜ |
| 7 | Interactions & match (`PlayerInterest`/`ClubInterest` → `Match`) | ⬜ |
| 8 | Messagerie temps réel (WebSocket, `ConversationRead`) | ⬜ |
| 9 | Notifications (Expo push + table `Notification`) | ⬜ |
| 10 | Modération (`Report`, `Block` + filtrage transverse) | ⬜ |
| 11 | Durcissement (ESLint, tests e2e, Swagger, rate-limit) | ⬜ |
| M0 | **Mobile Expo** : init SDK 57 + Tamagui + i18n + écrans auth animés | ✅ |
| M0b | **Terrain du club** : autocomplétion Mapbox, canton/commune/association déduits serveur, vue satellite, site web du club | ✅ |
| M1+ | Mobile : écrans club, onboarding profil joueur, feed, swipe, messagerie | ⬜ |

### Décision tranchée par Brice (24 juillet 2026)
Phase 4 backend **puis** mobile M0 dans la foulée, pour qu'il puisse tester
directement dans l'app plutôt que via l'API.

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
| `POST /auth/signup/request-code` · `verify-code` | public | inscription par email : **code à 6 chiffres**, puis mot de passe. L'email est validé du même geste (verrou 5 essais + rate-limit) |
| `GET /geo/places?q=&session=` | auth | autocomplétion du terrain (nom de stade **ou** adresse). Renvoie `{ id, label, context }` — **pas** de coordonnées : cf. décision 21 |
| `GET /geo/places/:id?session=` | auth | résout la suggestion choisie → `lat/lng` + `canton`, `locality`, `regionCode` **déduits serveur** + `aerialUrl` (vue satellite prête à afficher) |
| `POST /clubs/requests` | **auth** | crée le `Club PENDING` **pour l'utilisateur du token**. Ni email ni mot de passe dans le corps : l'identité est prouvée en amont (code email ou Google). Accepte `lat/lng/stadiumName/addressLine/websiteUrl` ; **`canton` est refusé** (400) car déduit du point |
| `GET/PATCH /clubs/me` | auth | **clubId dérivé du token, jamais du client** |
| `GET /clubs?search=` | auth | clubs sélectionnables (APPROVED) |
| `GET /regions` | public | 13 associations (table seedée) |
| `GET /admin/clubs` · `POST /admin/clubs/:id/approve\|reject` | **SUPER_ADMIN** | pas d'UI web (back-office = post-MVP) |
| `POST /auth/coach-invite/accept` | public | `{ email, code, password }` — **code à 6 chiffres**. Active le compte **et** valide l'email. Verrou après 5 échecs (`COACH_INVITE_LOCKED`), rate-limité |
| `GET/POST /teams` · `GET/PATCH /teams/:id` | auth | CLUB_ADMIN = toutes les équipes du club · COACH = **ses équipes assignées**. `POST` accepte un bloc `coach { email, firstName, lastName }` : équipe + compte entraîneur + invitation dans **une transaction** |
| `GET /teams/:id/deletion-impact` | auth | décompte de ce que la suppression détruirait (annonces, candidatures, matchs, conversations, messages) |
| `DELETE /teams/:id?confirm=true` | auth | **cascade totale**. Sans `confirm`, renvoie **409 `TEAM_DELETION_CONFIRMATION_REQUIRED`** + le décompte |
| `GET /l/:action?token=` | public | **hors `/api/v1`** : page de rebond des liens d'email → ouvre `footlink://`, sinon redirige vers le store |
| `GET/POST /clubs/me/coaches` | auth | **CLUB_ADMIN du club uniquement** (droit lu sur `ClubMember.role`, pas `User.role`) |
| `POST /clubs/me/coaches/:id/invite` · `PUT .../teams` · `DELETE .../:id` | auth | renvoi d'invitation · réassignation · retrait (sessions révoquées) |

> **Rappel transverse** : toute route authentifiée exige en plus un **email validé**
> (403 `EMAIL_NOT_VERIFIED`), sauf `GET /auth/me`, `POST /auth/resend-verification`
> et `POST /auth/logout`.

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
9. ~~La vérification email ne bloque pas le login.~~ **Révisé le 24 juillet 2026 sur demande de Brice : on ne peut RIEN faire dans l'app tant que l'email n'est pas validé.** Le login reste possible (il faut bien un token pour demander un renvoi), mais un `EmailVerifiedGuard` global renvoie **403 `EMAIL_NOT_VERIFIED`** sur toute route authentifiée, sauf les trois marquées `@AllowUnverified()`. Le guard **relit la DB à chaque requête** : le token ne porte pas l'info (cf. décision 8), donc la validation prend effet **immédiatement**, sans attendre le refresh. Il bloque aussi les comptes non `ACTIVE` (403 `ACCOUNT_NOT_ACTIVE`) — une suspension devient effective tout de suite au lieu d'attendre l'expiration de l'access token.
10. **`PlayerProfile.currentClubId` → `Club`** (demandé par Brice) : lien **déclaratif et NON vérifié**. Il ne crée **aucun `ClubMember`** et **aucun droit** sur le club. `currentClubName` est conservé en **repli** quand le club n'est pas encore sur FootLink.
11. **API d'administration** (SUPER_ADMIN) créée pour valider les clubs, mais **aucune UI web** (le back-office reste post-MVP conformément à `AGENTS.md`).
12. Stack : **pnpm 10 + Turborepo**, **NestJS 11**, **Prisma 6.19** (Prisma 7 dispo, upgrade repoussé), base MySQL `footlink`.
13. **Messages d'erreur de l'API en anglais** (réponses JSON + erreurs de démarrage). L'API n'est pas la couche de traduction : le mobile affiche du FR/DE à partir du `statusCode` et de son propre catalogue i18n. Les **emails** restent localisés FR/DE (`MailService`). Ne pas réintroduire de français dans un `throw new ...Exception(...)`.
14. **L'identité vient toujours en premier** (24 juillet 2026, demandé par Brice). Pour un club, on authentifie **avant** de demander quoi que ce soit sur le club — sinon n'importe qui créerait un club au nom d'autrui. `POST /clubs/requests` est donc **authentifié** et ne prend ni email ni mot de passe.
15. **Codes à 6 chiffres** pour l'inscription club et l'invitation entraîneur. Un million de combinaisons, donc devinable à la machine : **deux** garde-fous obligatoires, aucun suffisant seul — le code est **brûlé après 5 essais** (`Token.attempts`) et le débit est borné par le **rate-limit**. Ne jamais retirer l'un des deux. Les réponses ne disent **jamais** si une adresse existe : email inconnu et code faux renvoient la même erreur.
16. **Google court-circuite systématiquement le code.** Il prouve exactement la même chose — la maîtrise de la boîte mail — et `/auth/google` marque l'email validé. Ne pas rajouter d'étape de code derrière une connexion Google : cet état ne peut pas exister.
17. **Aucun emoji dans le produit** (écrans, i18n, emails). Icônes SVG dans `apps/mobile/src/ui/icons.tsx`. Cf. `CLAUDE.md`.
18. **Langue** : choisie sur l'écran d'accueil, conservée sur l'appareil **et** en base (`PATCH /users/me/locale`, accessible sans email validé). C'est `User.locale` qui décide de la langue des emails et notifications, envoyés app fermée.
19. **Le club est localisé par son TERRAIN, pas par une localité saisie à la main** (24 juillet 2026, demandé par Brice). On demande l'adresse ou le nom du stade, et tout le reste en découle. Ça bouchait un vrai trou : `RequestClubDto` n'acceptait **aucune** coordonnée, donc un club naissait sans point — et la Phase 6 (feed par rayon km) aurait été infaisable. `locality` en saisie libre ne subsiste que comme **repli** quand la recherche est indisponible.
20. **Canton, commune et association sont déduits CÔTÉ SERVEUR depuis le point.** Le client n'envoie que `lat/lng`. `canton` a été **retiré du DTO** : la validation stricte (`forbidNonWhitelisted`) le rejette en 400. Une `locality` envoyée avec des coordonnées est **écrasée** par la commune réelle. Sinon un club se déclarerait dans l'association de son choix.
21. **Deux fournisseurs, chacun sur son terrain de jeu.**
    - **Mapbox Search Box pour CHERCHER.** C'est le seul testé qui connaisse les terrains amateurs par leur nom : « Stade de Pranoé » sort en premier résultat. Le registre officiel swisstopo ne le contient **pas du tout** (il ne connaît que la *rue* de Pranoé) — rédhibitoire pour une app de foot de village.
    - **swisstopo pour SITUER.** Canton et commune viennent de `ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill` : limites administratives officielles, gratuites, sans quota, et qui couvrent **tout** le territoire (y compris un terrain en plein champ, sans bâtiment). ⚠️ Le suffixe **`.fill`** est obligatoire : sans lui le calque ne renvoie rien.
    - **Mapbox `satellite-v9` pour l'IMAGE** (choix de Brice), sans marqueur. swisstopo SWISSIMAGE est plus net sur la Suisse, mais l'arbitrage a été rendu en faveur de Mapbox.
    - Google Maps a été écarté : clé + compte de facturation obligatoires, et ses conditions **interdisent la mise en cache** des photos, donc facturation à chaque affichage.
    - L'app ne parle **jamais** à un fournisseur directement. Tout passe par `apps/api/src/geo/places.service.ts` : le jeton reste hors du binaire (donc remplaçable sans republier), et changer de fournisseur ne touche qu'un fichier.
22. **Mapbox facture à la SESSION**, pas à l'appel : toutes les frappes d'une recherche + **un seul** `retrieve` comptent pour une session. D'où deux endpoints séparés — résoudre les coordonnées des 6 suggestions à chaque frappe multiplierait la facture par six, pour des lieux dont personne ne veut. Le `session` vient de l'app et doit être **le même** pour la recherche et le choix.
23. **Le mot générique n'est pas le nom du lieu.** Mapbox est littéral : « stade de pranoé grimisuat » trouve le stade, « **terrain** de pranoé grimisuat » ne trouve que des rues. L'API rejoue donc la recherche sans les mots génériques (`stade`, `terrain`, `centre sportif`, `fc`…) **uniquement si la première passe n'a ramené aucun lieu** — quand elle en ramène (« terrain grimisuat » → « Terrain de football »), le mot générique *était* le bon nom. Le repli est gratuit : même session.
24. **Coordonnées du club en PLEINE PRÉCISION — dérogation assumée à `CLAUDE.md`** (accordée explicitement par Brice). La règle « géoloc arrondie à ~1 km » est une règle **LPD** : elle protège le *joueur*. Un terrain de football est un équipement public, pas une donnée personnelle ; l'arrondir n'aurait protégé personne et aurait introduit jusqu'à un kilomètre d'erreur dans le matching par distance. `PlayerProfile` **reste arrondi** (`GeoService.roundToGrid`). Ne pas « harmoniser » les deux.
25. **`CANTON_TO_REGION` est volontairement INCOMPLET** (`packages/shared/src/geo.ts`). Seules les cinq associations mono-cantonales romandes y figurent. Les autres sont ambiguës : le Jura est revendiqué par `ajf` **et** `fvbj` (« Bern/Jura »), `fvnws`/`sfvar`/`ifv`/`ofv`/`fvrz` couvrent plusieurs cantons, et `aftg` est libellé « Association Fribourgeoise / Tessin » — incohérent. `nomenclature_football_suisse.json` le dit lui-même : liste « indicative, à confirmer sur football.ch ». Un canton absent de la table laisse le choix à l'utilisateur plutôt que de lui imposer une association fausse. **Ne pas compléter cette table au jugé** : la vérifier d'abord.
26bis. **Deux adresses qui aboutissent dans la même boîte sont le MÊME compte** (24 juillet 2026, demandé par Brice). `normalizeEmail` (`packages/shared/src/email.ts`) retire le suffixe `+…` **sur tous les domaines**, et les points **uniquement chez Google** (`gmail.com`/`googlemail.com`, canonicalisé en `gmail.com`). Sans ça, `brice@gmail.com`, `brice+foot@gmail.com` et `b.rice@gmail.com` donnent trois profils joueur, trois fois les mêmes candidatures reçues par un club, et un contournement trivial d'un blocage.
    - Asymétrie **volontaire** : hors Google le point est significatif (`jean.dupont@bluewin.ch` ≠ `jeandupont@bluewin.ch`), et fusionner des comptes distincts serait bien plus grave que tolérer un doublon. Le `+` littéral, lui, est légal (RFC 5321) mais introuvable en pratique.
    - La normalisation est appliquée **dans `UsersService`** (`findByEmail`, `create`, `update`), pas chez les appelants : il y a une douzaine d'endroits où une adresse entre, et il suffirait d'en oublier un. `CoachesService.prepareCoach` écrit hors de ce service (transaction partagée) et normalise donc explicitement — **si un jour un autre service crée un `User` en direct, il devra faire pareil**.
    - La forme normalisée est celle qui est **stockée** et qui sert de destinataire aux emails. Gmail délivre indifféremment aux deux formes.
    - ⚠️ Aucune migration de données n'a été faite : la base ne contenait qu'un compte, déjà normalisé. Une base de prod existante demanderait de traiter les collisions **avant** d'activer la règle.
26ter. **Codes métier sur les conflits.** `409` renvoie désormais `EMAIL_ALREADY_USED` (inscription) ou `CLUB_ALREADY_LINKED` (demande de club). Avant, le mobile traduisait **tout** 409 par « adresse déjà utilisée » — un club qui en demandait un second se voyait donc reprocher son email. Le repli sur le statut existe encore, mais **tout nouveau conflit doit porter un code**.
    - Le parcours club vérifie aussi `GET /clubs/me` **avant** d'afficher le formulaire : se connecter avec un compte existant (Google surtout, qui ne distingue pas « s'inscrire » de « se connecter ») menait droit au formulaire, et l'échec ne tombait qu'à l'envoi.
    - **`POST /auth/signup/request-code` révèle désormais un compte DÉJÀ UTILISABLE** (mot de passe ou Google) par un 409 `EMAIL_ALREADY_USED`. Avant, il restait muet même dans ce cas, et l'app avançait vers l'écran du code où **aucun code n'arrivait jamais** — un cul-de-sac. Le cas révélé équivaut à ce qu'un utilisateur découvre en essayant de se connecter. **Déviation à la décision 15, demandée deux fois par Brice.**
    - ⚠️ **La décision 15 tient toujours là où elle compte** : `verifySignupCode` reste **totalement muet** (adresse inconnue et code faux = même erreur), et un compte à moitié inscrit (sans mot de passe ni Google) reçoit son code sans que rien ne le distingue d'une adresse libre. Seul le cas « compte complet » est signalé. Ne pas étendre la révélation au-delà.
26. **Site internet du club** : facultatif, saisi à l'étape « contexte ». Normalisé en `https://` à l'écriture (personne ne tape le schéma, et sans lui la valeur est inutilisable par `Linking.openURL`).

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
| `MAPBOX_TOKEN` | jeton **public** (`pk.…`) de https://account.mapbox.com — compte de Brice. Sert à la recherche du terrain **et** à l'URL de la vue satellite. Public par nature (conçu pour être embarqué côté client), mais gardé côté serveur pour pouvoir le remplacer sans republier l'app |

Sans SMTP configuré, les emails ne sont **pas** envoyés : ils sont **logués** (transport JSON) — pratique pour tester.

### Base de données puis démarrage
```bash
pnpm db:migrate   # applique les migrations (crée la base si absente)
pnpm db:seed      # seed des 13 régions (AVF active)
pnpm api:dev      # http://localhost:3000/api/v1
pnpm mobile:dev   # Expo — scanner le QR code avec Expo Go
```

> **Pièges pnpm (corrigés le 24 juillet 2026, mais bon à savoir)** : le champ
> `packageManager` doit rester sur la version réellement installée (le
> version-switcher de pnpm 10 ne sait pas installer pnpm 11), et
> `pnpm-workspace.yaml#onlyBuiltDependencies` autorise les scripts
> d'installation des moteurs Prisma, d'argon2 et d'esbuild — sans lui, un clone
> neuf installe des paquets inutilisables.

**Sur téléphone (Wi-Fi)** : l'app déduit l'URL de l'API de l'hôte du serveur
Expo (`Constants.expoConfig.hostUri`), donc rien à configurer — mais le
téléphone doit être **sur le même Wi-Fi** et le **pare-feu Windows doit laisser
passer le port 3000**. Pour forcer une autre URL : `EXPO_PUBLIC_API_URL`.

**Sur émulateur (ou téléphone branché en USB)** : Expo passe par `adb reverse`,
donc l'hôte vu par l'app est `localhost` — qui désigne **l'émulateur lui-même**,
pas la machine. Expo ne redirige que le port de Metro : il faut ajouter celui de
l'API, **à refaire après chaque redémarrage de l'émulateur** :
```bash
pnpm mobile:reverse
```
Sans ça, l'app affiche « Serveur injoignable » alors que l'API tourne
parfaitement.

> `packages/shared` doit être **buildé avant** `apps/api` (l'API l'importe). `pnpm build` respecte l'ordre via Turborepo. En cas d'erreur d'import `@footlink/shared` : `pnpm --filter @footlink/shared build`.

---

## 5. Tester

Ouvre **`tools/api-tester.html`** dans un navigateur (double-clic) : page autonome (inscription, login, `/me`, refresh, vérification email, profil joueur). Le CORS autorise le `file://` (origin `null`).

**Vérification automatisée** : `tools/e2e/phase4.ts` — **85 contrôles** contre une vraie instance et une vraie base (blocage email, langue, inscription club avec identité prouvée, garde club non approuvé, équipes, invitation entraîneur, verrou du code à 6 chiffres, isolation coach, cloisonnement inter-clubs, suppression en cascade, page de rebond, rate-limit). Il crée ses comptes sur `@e2e.footlink.test` et **nettoie derrière lui**. Mode d'emploi dans **`tools/e2e/README.md`**.

**Terrain du club** : `tools/e2e/pitch.ts` — **35 contrôles** (autocomplétion par nom de stade et par adresse, repli sur le mot générique, unicité des identifiants, canton/commune/association déduits serveur, pleine précision, client menteur ignoré, terrain hors de Suisse ou hors territoire communal refusé, site normalisé, vue satellite qui se charge vraiment).

```bash
pnpm --filter @footlink/api exec tsx C:\projects-web\FootLink\tools\e2e\pitch.ts
```

**Identité des adresses email** : `tools/e2e/email.ts` — **16 contrôles** (variantes Gmail confondues, points préservés hors Google, inscription avec un suffixe `+…` refusée, codes métier `EMAIL_ALREADY_USED` et `CLUB_ALREADY_LINKED`).

```bash
pnpm --filter @footlink/api exec tsx C:\projects-web\FootLink\tools\e2e\email.ts
```

Il n'appelle **aucun** endpoint qui envoie un email : les comptes sont posés en base et le conflit est levé avant toute tentative d'envoi. Aucun message ne part vers une adresse inexistante. Il importe `packages/shared/dist` **par chemin relatif** — `tools/` n'est pas un paquet du workspace, donc `@footlink/shared` n'y est pas résolu : lancer `pnpm --filter @footlink/shared build` avant.

> **`pitch.ts` par défaut ne frappe PAS Mapbox** (0 session facturée) et couvre toute la logique serveur depuis un point connu. Pour rejouer la qualité de recherche et la vue satellite (coûte ~2 sessions Mapbox) :
> ```bash
> E2E_LIVE_SEARCH=1 pnpm --filter @footlink/api exec tsx C:\projects-web\FootLink\tools\e2e\pitch.ts
> ```

Contrairement à `phase4.ts`, il n'exige **pas** une instance sans SMTP : il pose ses comptes en base avec `emailVerifiedAt` déjà rempli et signe lui-même ses jetons. Il exige en revanche un accès réseau à `api.mapbox.com` et `api3.geo.admin.ch`. Il attend seul la fenêtre de rate-limit quand elle est pleine (~1 min).

⚠️ Deux pièges :
- Il faut une instance lancée **sans SMTP** (les jetons ne sont lisibles que dans les logs), et **depuis Git Bash** : sous PowerShell, `$env:SMTP_PASSWORD=''` *supprime* la variable au lieu de la vider — le SMTP réel reste actif et de vrais emails partent vers les adresses de test. Contrôler la présence de `SMTP non configuré` dans les logs avant de lancer.
- Le script dure ~3 min : il **attend une fenêtre de rate-limit** d'une minute, sans quoi le verrou du code à 6 chiffres ne peut pas être testé. Deux exécutions rapprochées se marchent dessus (429) : laisser passer une minute entre deux.

Pour devenir **SUPER_ADMIN** (valider les clubs) : s'inscrire, puis
```bash
printf "UPDATE \`User\` SET role='SUPER_ADMIN' WHERE email='TON_EMAIL';" | pnpm --filter @footlink/api exec prisma db execute --stdin --schema prisma/schema.prisma
```
puis **se reconnecter** (le rôle est gravé dans le token à l'émission).

---

## 5bis. Mobile (`apps/mobile`)

**Expo SDK 57**, React Native 0.86, React 19.2, Reanimated 4.5, Expo Router
(racine `src/app`), Tamagui 2.5, Moti. TypeScript strict.

| Fichier | Rôle |
|---|---|
| `tamagui.config.ts` | design system : config v4 + palette de marque en **tokens** (`$brandPitch`, `$brandNight`…) |
| `src/app/_layout.tsx` | providers (Gesture, SafeArea, Tamagui, i18n, Auth) |
| `src/app/index.tsx` | **garde de routage** : chargement → `/welcome` → `/auth/verify-email` → `/home` |
| `src/app/register/` | **choix du rôle** puis trois parcours en étapes, avec stepper : `player` (email → mot de passe), `coach` (email → code → mot de passe, ou Google), `club` (**identité d'abord** : Google ou email → code → mot de passe, *puis* le club) |
| `src/app/auth/verify-email.tsx` | même route que le lien profond `footlink://auth/verify-email?token=…` (consommé automatiquement) |
| `src/auth/auth-context.tsx` | session, refresh automatique sur 401, `/auth/me` comme source de vérité |
| `src/auth/token-storage.ts` | jetons dans **SecureStore** (Keychain / Keystore), jamais AsyncStorage |
| `src/api/client.ts` | URL de l'API déduite de l'hôte Expo ; `ApiError` typée avec le code métier |
| `src/i18n/` | catalogue FR/DE, repli FR ; l'app traduit les erreurs **anglaises** de l'API. Langue changeable (`setLocale`) et persistée |
| `src/ui/icons.tsx` | **toutes** les icônes (Phosphor via sous-chemins `src/icons/<Nom>`, + un stade repris de Tabler). **Aucun emoji** dans l'app |
| `src/ui/stepper.tsx` · `use-stepper.ts` | progression des inscriptions en étapes |
| `src/ui/region-picker.tsx` | sélecteur d'association : liste à la demande, recherche par nom **ou par code** (`avf`), présélection si une seule est ouverte |
| `src/ui/locale-switch.tsx` | bascule FR/DE de l'écran d'accueil, pousse en base une fois connecté |
| `src/ui/place-picker.tsx` | **terrain du club** : un seul champ pour le nom du stade *ou* l'adresse, débattu à 350 ms, requête précédente annulée à chaque frappe ; carte de confirmation avec vue satellite, commune et canton. Présélectionne l'association du canton |
| `src/api/geo.ts` | recherche + résolution du lieu, et fabrication du jeton de session |

**Choix assumés au M0, à revoir :**
- **Thème sombre forcé** (`defaultTheme="dark"`) : l'identité est nocturne, le thème clair n'a pas encore été dessiné.
- **Compilateur Tamagui non activé** (pas de `@tamagui/babel-plugin`) : Tamagui tourne en mode runtime. C'est une optimisation de perf à ajouter quand l'UI sera stabilisée, pas un manque fonctionnel.
- **Google Sign-In : le code est en place** (bouton sur connexion ET inscription, via `@react-native-google-signin/google-signin`, jeton ID revérifié par le serveur). ⚠️ **Ne peut pas fonctionner dans Expo Go** : c'est un module natif. L'app détecte le cas (`Constants.executionEnvironment`) et l'explique au lieu de planter. Marche à suivre en §5ter.
- **Reset de mot de passe** : le lien passe bien par la page de rebond, mais **l'écran `/auth/reset-password` n'existe pas encore** — le lien ouvre l'app sur une route inconnue.
- Lottie n'est **pas** installé tant qu'aucun écran ne l'utilise (pas de dépendance morte).
- **`web.output` = `single` (SPA) et non `static`** : le rendu statique pré-rend chaque route dans Node, ce qui casse (`Cannot destructure property '__extends' of 'tslib.default'`). Le web n'est pas une cible produit — il sert seulement à inspecter l'UI dans un navigateur (`pnpm mobile:dev` puis http://localhost:8081).
- **Sur le web, les jetons restent en mémoire** : `expo-secure-store` n'existe pas sur cette plateforme, et écrire des jetons dans `localStorage` serait un recul de sécurité gratuit. Conséquence : la session web ne survit pas à un rechargement. Sur mobile, rien ne change (Keychain / Keystore).

## 5ter. Activer Google Sign-In (à faire par Brice)

Le code est écrit et branché ; il manque **l'environnement d'exécution** et **un
client OAuth Android**. Google Sign-In est un module natif : il n'existe pas
dans Expo Go, qui embarque un jeu fixe de modules.

**Ça marche très bien sur un émulateur Android**, à une condition : l'image de
l'AVD doit inclure les **Google Play services** (dans Android Studio, choisir
une image « Google Play » ou au minimum « Google APIs » — pas une image AOSP
nue, qui n'a pas Play services et où la connexion échouera).

**1. Construire un build de développement, en local, directement sur l'émulateur** —
inutile de passer par EAS, `expo run:android` compile et installe :
```bash
pnpm --filter @footlink/mobile exec expo run:android
```
(demande Android Studio + un JDK 17 ; l'émulateur doit être démarré). Ensuite,
`pnpm mobile:dev` se connecte à cette app comme il le ferait à Expo Go.

> **Prérequis Gradle sur une machine neuve** — les deux erreurs rencontrées le
> 24 juillet 2026 :
>
> 1. `SDK location not found` : ni `ANDROID_HOME` ni `android/local.properties`.
>    Le dossier `android/` étant **gitignoré et régénéré par prebuild**, la
>    solution durable est la variable d'environnement (à faire une fois, dans un
>    terminal, puis rouvrir le terminal) :
>    ```bash
>    setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"
>    ```
>    Sans elle, il faut recréer `apps/mobile/android/local.properties` avec
>    `sdk.dir=C:/Users/<toi>/AppData/Local/Android/Sdk` après chaque `prebuild --clean`.
>
> 2. **NDK manquant** : le projet réclame exactement `27.1.12297006` (NDK r27b).
>    Avoir une version voisine (27.0.x) ne suffit pas.
>    ```bash
>    "%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat" "ndk;27.1.12297006"
>    ```
>
> 3. **`ninja: error: manifest 'build.ninja' still dirty after 100 tries`** — le
>    vrai message est noyé sous des centaines de `CMake Warning ... has 204
>    characters`. Le store virtuel isolé de pnpm produit des chemins trop longs
>    pour CMake sur Windows (limite 250 caractères). D'où **`nodeLinker: hoisted`**
>    dans `pnpm-workspace.yaml` : c'est la solution recommandée par Expo pour les
>    monorepos pnpm. Après ce changement, il faut **réinstaller à plat** :
>    ```bash
>    pnpm install
>    ```
>    puis nettoyer les caches C++ du build précédent, qui gardent les anciens
>    chemins :
>    ```bash
>    cd apps/mobile/android && .\gradlew.bat clean
>    ```
>
> L'émulateur doit tourner sur une image **avec Google Play services**, sinon
> Google Sign-In échoue quoi qu'on fasse (vérifiable avec
> `adb shell pm list packages | findstr com.google.android.gms`).

**2. Récupérer l'empreinte SHA-1.** ⚠️ **Ce n'est PAS `~/.android/debug.keystore`.**
Le template React Native embarque son propre keystore de debug dans le projet, et
`android/app/build.gradle` pointe dessus (`storeFile file('debug.keystore')`).
C'est donc celui-là qu'il faut lire :
```bash
keytool -list -v -alias androiddebugkey -keystore apps/mobile/android/app/debug.keystore -storepass android -keypass android
```
Son empreinte est **la même pour tous les projets React Native** (le keystore
est livré avec le template, il n'a rien de secret) :
`5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`.

> Se tromper de keystore donne un `DEVELOPER_ERROR` parfaitement silencieux :
> Google affiche la liste des comptes, puis refuse de signer le jeton. Rien dans
> les logs ne dit que c'est l'empreinte qui ne correspond pas.

Pour un build EAS (plus tard, pour la vraie distribution), c'est encore un autre
keystore : `pnpm --filter @footlink/mobile exec eas credentials`. **Les deux
empreintes doivent être enregistrées** dans la console Google, sinon la
connexion marche en debug et casse en production (ou l'inverse).

**3. Créer le client OAuth Android** dans la Google Cloud Console (projet
`footlink-503320`) : type *Android*, package `ch.footlink.app`, et l'empreinte
SHA-1 de l'étape 2. Ajouter ensuite son identifiant à `GOOGLE_CLIENT_IDS` dans
`apps/api/.env` (liste séparée par des virgules) — c'est la liste des audiences
que le serveur accepte.

> **24 juillet 2026** — un premier client Android a été créé avec la mauvaise
> empreinte (celle de `~/.android/debug.keystore`), d'où un `DEVELOPER_ERROR`
> persistant. La bonne est celle du keystore **du projet** (cf. étape 2).
> Client Android : `988726398910-6dlaiaphv86eefld0ac17kmac60gp76u.apps.googleusercontent.com`.
> Il reste à refaire l'opération avec l'empreinte du keystore **EAS** le jour de
> la distribution, sinon Google Sign-In marchera en debug et cassera en prod.

> Le fichier `client_secret_….json` téléchargé par la console **ne sert à rien**
> ici : un client Android est un client *public*, il n'a pas de secret, et le
> flux natif n'en utilise aucun. Ne pas l'embarquer dans l'app ni le commiter.
> Le backend ne stocke que des **identifiants** de clients (`GOOGLE_CLIENT_IDS`),
> jamais un secret.

> **Ce que l'app embarque vraiment** : uniquement `webClientId` et `iosClientId`
> (dans `src/auth/google-sign-in.ts`). Conséquence pratique — supprimer puis
> recréer le client **Android** ne demande **aucune** intervention sur l'app ni
> sur le backend. Supprimer le client **Web**, en revanche, casse tout : son
> identifiant est écrit dans le JS *et* c'est l'audience du jeton sur Android,
> donc il faudrait une mise à jour OTA **et** modifier `GOOGLE_CLIENT_IDS`.

> iOS et Web sont déjà créés. Le `iosUrlScheme` du plugin dans `app.json` est
> l'identifiant iOS **inversé** : le changer sans changer le client OAuth casse
> la connexion sur iPhone.

> **Comment lire l'échec côté app** : `NOT_CONFIGURED` (Google renvoie
> `DEVELOPER_ERROR`/`10`) = le couple package + SHA-1 n'est pas déclaré côté
> Google, jamais un problème de code. `NEEDS_DEV_BUILD` = on tourne dans Expo Go.

## 5quater. Passage en production — checklist

### Backend (`.env` du VPS)

| Variable | À faire |
|---|---|
| `DATABASE_URL` | base de prod |
| `JWT_ACCESS_SECRET` · `JWT_REFRESH_SECRET` | **nouveaux secrets**, jamais ceux de dev (les réutiliser laisserait des jetons de dev valables en prod) |
| `NODE_ENV` | `production` |
| `PUBLIC_BASE_URL` | `https://footlink.ch` — sert de base aux liens d'email |
| `IOS_STORE_URL` | vraie fiche App Store une fois l'app publiée (le défaut renvoie sur une recherche) |
| `GOOGLE_CLIENT_IDS` | **ajouter** le client Android du keystore EAS (cf. §5ter) |
| `CORS_ORIGINS` | restreindre (aujourd'hui `*`) |
| `SMTP_*` | Gmail tient au MVP ; un domaine expéditeur propre évitera les spams |
| `API_MIN_VERSION` · `API_LATEST_VERSION` | pilotent la gate de version de l'app |

### Application

| Quoi | À faire |
|---|---|
| **URL de l'API** | `extra.apiUrl` dans `app.json` (ou `EXPO_PUBLIC_API_URL` au build). **Obligatoire** : un build de production n'a pas de serveur Expo, il ne peut pas deviner l'adresse. Le code **échoue explicitement** si rien n'est fourni, plutôt que de retomber sur `localhost` |
| **Client OAuth Android** | un **nouveau** client pour l'empreinte SHA-1 du keystore EAS. N'apparaît **pas** dans le code de l'app : seuls `webClientId` et `iosClientId` y sont référencés |
| `version` / `android.versionCode` / `ios.buildNumber` | à incrémenter à chaque soumission |
| `iosUrlScheme` | inchangé (même client iOS) |
| Lien profond `footlink://` | inchangé, mais les **liens d'email** suivront `PUBLIC_BASE_URL` |

> **Le piège** : tout marche en développement parce que l'app déduit l'URL de
> l'API du serveur Expo. Ce mécanisme n'existe qu'en dev — d'où la configuration
> explicite ci-dessus.

## 6. TODO / questions ouvertes

- **➡️ PROCHAINE ÉTAPE, en attente depuis plusieurs échanges : les écrans club.** Créer une équipe **avec son entraîneur** (`POST /teams` accepte déjà le bloc `coach`), lister les équipes, supprimer avec **l'alerte chiffrée** (`GET /teams/:id/deletion-impact` renvoie le décompte, `DELETE ?confirm=true` exécute). Toute l'API est prête et vérifiée ; il ne manque que l'UI. C'est ce qui permettrait à Brice de dérouler le scénario complet dans l'app — jusqu'au code à 6 chiffres reçu par l'entraîneur — sans toucher à la base.
- **[Décision Brice] Sans mot de passe ?** Pour l'inscription club et l'activation entraîneur par email, j'ai ajouté une étape **mot de passe** après le code, sans quoi le compte n'aurait aucun moyen de se reconnecter. Brice n'avait pas tranché. S'il préfère du sans-mot-de-passe (code à chaque connexion), il faudra aussi refaire l'écran de connexion.
- **[Décision Brice] Catalogue de clubs** : au lancement `GET /clubs` sera quasi vide (seuls les clubs validés existent) → un joueur ne pourra pas sélectionner son club réel. Option **A** = liste + saisie libre (codé aujourd'hui) ; option **B** = seeder un catalogue des ~150 clubs AVF (source à trouver, ex. matchcenter AVF) + distinguer *catalogue* vs *compte réclamé*. Recommandation : **B avant le lancement**.
- ~~Client OAuth Android non créé.~~ **Fait le 24 juillet 2026** pour le keystore de debug (cf. §5ter). Reste à refaire avec l'empreinte du keystore **EAS** avant distribution.
- **Bandes juniors** (U18/U19 → Juniors A, etc.) dans `packages/shared/src/season.ts` : table **documentée mais à confirmer** avec les prescriptions AVF. Sans impact au MVP (16+).
- **`Region.labelDe`** = copie du libellé FR (le JSON ne fournit pas de libellé allemand). À corriger.
- **Quota Mapbox — modèle de facturation (docs Mapbox, vérifié).** La recherche (`suggest` + `retrieve`) est facturée **par SESSION**, pas par requête. Une session regroupe toutes les frappes d'une recherche sous un même `session_token` et se **conclut** au `retrieve`, **ou après 180 s d'inactivité**, **ou après 50 `suggest`**. Conséquence directe : une recherche **abandonnée** (l'utilisateur tape mais ne choisit pas) est quand même facturée après 180 s. La vue satellite (`static/…`) est un endpoint **séparé**, facturé par requête (franchise à part, généreuse).
  - Côté app : le `session_token` est **réutilisé entre toutes les frappes** et n'est régénéré **qu'après un `retrieve`** (`place-picker.tsx`). Donc une saisie complète, même avec plusieurs requêtes tapées puis effacées, = **une seule** session. 1 club créé ≈ 1 session. Avec 500 sessions/mois gratuites, c'est très large pour le MVP valaisan. Le repli sur le mot générique fait un 2ᵉ `suggest` dans la **même** session → **pas** de coût supplémentaire.
  - **Le compteur se remplit surtout en TEST.** Chaque run de `pitch.ts` en mode live faisait ~2 sessions. D'où `E2E_LIVE_SEARCH` : par défaut le test part d'un point connu (Tourbillon) et ne touche **pas** Mapbox ; il faut `E2E_LIVE_SEARCH=1` pour rejouer la qualité de recherche. Le run par défaut couvre toute la logique sensible (déduction canton, précision, client menteur) via swisstopo, gratuit.
  - Reste **[Décision Brice]** : personne n'a regardé le tableau de bord Mapbox pour situer la franchise exacte ni le coût d'un dépassement. À faire avant le lancement.
- **`CANTON_TO_REGION` à compléter** (`packages/shared/src/geo.ts`) avant l'extension hors Valais — mais **seulement après avoir confirmé le découpage réel sur football.ch**, cf. décision 25. En l'état, un club hors des cinq cantons romands mono-associations devra choisir son association à la main.
- **La vue satellite n'est renvoyée qu'à la sélection du terrain** (`GET /geo/places/:id`). Les futurs écrans club en auront besoin à partir du `Club` stocké : prévoir d'exposer `aerialUrl` sur `GET /clubs/me` (le service a déjà `PlacesService.aerialUrl(lat, lng)`).
- **Mentions Mapbox** : les URL satellite sont générées avec `logo=false&attribution=false`. Mapbox ne l'autorise **qu'à condition** d'afficher l'attribution ailleurs dans l'interface — c'est le rôle de la ligne `© Mapbox © Maxar` sous l'image. Si un écran affiche une vue satellite sans cette mention, on sort des conditions d'utilisation.
- **ESLint** volontairement reporté à la Phase 11 (pour ne pas livrer une config bancale).
- **Prisma** : `package.json#prisma` est déprécié (Prisma 7) → migrer vers `prisma.config.ts` au durcissement.
- **`GET /players/me`** renvoie `null` (HTTP 200) si aucun profil : c'est voulu (l'app sait qu'il faut onboarder).
- ~~Un entraîneur n'a pas de nom.~~ **Tranché le 24 juillet 2026** : `ClubMember.firstName` / `ClubMember.lastName` (migration `club_member_identity`). Volontairement sur `ClubMember` et non sur `User` — c'est le club qui saisit le nom, **avant** que le compte existe, et un joueur déjà inscrit garde son `PlayerProfile` intact.
- ~~Suppression d'équipe bloquée si elle porte des annonces.~~ **Tranché le 24 juillet 2026** : la suppression **casse tout en cascade** (annonces → candidatures → intérêts club → matchs → conversations → messages), mais elle est **impossible sans confirmation explicite**. Sans `?confirm=true`, l'API renvoie **409 `TEAM_DELETION_CONFIRMATION_REQUIRED`** *avec le décompte exact* : le client ne peut donc pas supprimer sans avoir de quoi afficher l'alerte. `GET /teams/:id/deletion-impact` permet de l'afficher en amont. ⚠️ **L'alerte elle-même reste à écrire** : l'app n'a pas encore d'écrans club.
- **`GET /teams` renvoie `[]` pour un club encore `PENDING`** (pas de 403) : l'app peut afficher l'écran « club en attente de validation » sans traiter une erreur.

---

## 7. Pièges connus (environnement Windows)

- Le **répertoire courant persiste** entre appels de l'outil Bash → éviter les `cd` relatifs, préférer `pnpm --filter <pkg>`. Attention : `pnpm --filter @footlink/api exec tsx <chemin relatif>` résout depuis `apps/api`, pas depuis la racine — donner un **chemin absolu**.
- **Écrire un `.env` en PowerShell y ajoute un BOM** (`Set-Content -Encoding utf8`). Sans conséquence si la première ligne est un commentaire, illisible sinon. Utiliser `[System.IO.File]::WriteAllText` avec `UTF8Encoding($false)`.
- **Ne pas lancer deux Metro** : le second échoue sur `EADDRINUSE 8081`. Et ne pas purger le cache Metro pendant qu'un build tourne — c'est ce qui a produit `Unable to deserialize cloned data`, qui tue Metro. Purge : `node_modules/.cache`, `apps/mobile/.expo`, `%TEMP%/metro-cache`.
- **Processus fantômes** : tuer le port ne tue pas le parent `nest`/`expo`. Un `nest --watch` orphelin verrouille le moteur Prisma (`EPERM` sur `prisma generate`) et un vieux Metro sert un bundle périmé (erreurs `Unable to resolve` sur un paquet pourtant installé). Vérifier avec `Get-Process node` et la ligne de commande.
- Arrêter le serveur : PowerShell `Get-NetTCPConnection -LocalPort 3000` puis `Stop-Process`. Un serveur lancé en tâche de fond se termine avec **exit 127 après un kill forcé** : c'est **normal**, pas une erreur.
- `prisma migrate dev` **sans `--name`** ouvre un prompt interactif → toujours passer `--name`.
- **`@prisma/client` se résout à DEUX endroits** depuis le passage en `nodeLinker: hoisted`. `prisma generate` écrit dans la copie visée par `apps/api/node_modules/@prisma/client` (une jonction vers le store `.pnpm`) ; la copie à la racine de `node_modules` reste un **stub non généré**. Conséquence : un script hors d'`apps/api` qui fait `import { PrismaClient } from '@prisma/client'` échoue avec « did not initialize yet » alors que l'API tourne parfaitement. D'où `tools/e2e/pitch.ts` qui passe par la **CLI** (`prisma db execute`) au lieu du client, comme `phase4.ts`.
- **`Region.active` dérive.** Les 13 associations ont été trouvées `active: true` en base alors que le seed n'en active qu'une : quelqu'un les avait passées à `true` à la main. Symptôme côté app : le sélecteur d'association s'affiche en menu déroulant au lieu d'une ligne d'information, et rien n'est présélectionné. `pnpm db:seed` remet l'état du JSON (le seed fait un `upsert` qui réécrit `active`). Vérifier après coup : `GET /api/v1/regions` ne doit renvoyer **qu'`avf`** en `active`.
- **Ne pas faire dépendre un champ de formulaire d'une animation d'entrée.** Une `MotiView` avec `from={{ opacity: 0 }}` a laissé la carte du terrain **invisible** en conditions réelles : l'espace était réservé, mais rien ne se dessinait — même pas la bordure — l'animation ne s'étant pas jouée. La condition exacte de déclenchement n'a pas été identifiée ; le bloc a simplement été rendu sans animation d'entrée.
- **Le cache de transformation Metro peut rendre un import parfaitement valide introuvable.** Symptôme vu : `ReferenceError: Property 'getMyClub' doesn't exist` alors que l'import existait, que `tsc` passait, et que deux autres écrans utilisaient la même fonction depuis des semaines. Ce n'est **pas** un bug du code. Purge (Metro arrêté) puis `pnpm mobile:dev --clear` :
  ```bash
  pnpm mobile:dev --clear
  ```
  Supprimer aussi `node_modules/.cache`, `apps/mobile/.expo` et `%TEMP%/metro-cache` si `--clear` ne suffit pas. Le rebuild complet (~2800 modules) prend une dizaine de secondes. Ne jamais purger pendant qu'un build Gradle tourne.
- **Modifier `packages/shared` désynchronise l'app le temps du rebuild.** Renommer un export (ici `aerialImageUrl` → `mapboxAerialUrl`) fait recharger Metro avec un `dist/` encore ancien d'un côté et du code neuf de l'autre : l'app lève un `TypeError: undefined is not a function` et l'écran concerné rend **du vide**, sans message à l'utilisateur. Attendre le `Found 0 errors` du watcher `tsc`, puis relancer l'app. Ce n'est jamais un bug du code applicatif.
- **Le bundle Metro ne prouve rien sur le code des écrans.** `expo-router` découpe les routes en chunks chargés à la demande : chercher une chaîne dans `entry.bundle` ne trouve **ni** le nouveau code **ni** l'ancien. Pour vérifier, s'appuyer sur `typecheck` + l'e2e + l'app, pas sur le contenu du bundle.
- Ne **jamais** commiter `apps/api/.env`. Vérifier avant chaque commit :
  `git diff --cached --name-only | grep -E '(^|/)\.env$'` doit être **vide**.

---

## 8. Rappels de conventions

- **TypeScript strict, jamais `any`.**
- **Sécurité** : rien sans authentification (guard JWT global, `@Public()` pour les exceptions) ; autorisation vérifiée sur **chaque** ressource (anti-IDOR) ; ne jamais faire confiance à un ID venant du client (le `clubId` se dérive du token).
- **`use context7`** pour la doc à jour des librairies (non connecté dans la session précédente : `.mcp.json` est en place, il se charge au démarrage de Claude Code).
- Poser une question à Brice avant toute action risquée ou toute déviation d'`AGENTS.md`.
