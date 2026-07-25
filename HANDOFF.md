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
| M0c | **Médias R2** : URL pré-signées, clé générée serveur, `User.avatarKey` | ✅ |
| M1 | **Onboarding joueur** : 4 étapes, terrain interactif 14 postes, routage par rôle | ✅ vérifié en base |
| M2 | **Écrans club** : supervision, équipes (CRUD + alerte de cascade), entraîneurs | ✅ sauf invitation (envoie un email) |
| M1+ | Mobile : logo du club, onboarding entraîneur, feed, swipe, messagerie | ⬜ |
| iOS | Client de développement installable sur l'iPhone de Brice (ad-hoc, équipe `THHTC74QPQ`) | ✅ build OK |

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
| `POST /auth/google/club` | public | **entrée club par Google**. Crée le compte **seulement** si l'adresse (et le `googleId`) sont libres ; sinon 409 `EMAIL_ALREADY_USED` sans rien écrire. Cf. décision 31 et son piège |
| `POST /auth/google/coach` | public | **entrée entraîneur par Google**. Exige une invitation (`ClubMember`) pour l'adresse du jeton, et **n'écrit rien** sinon (403 `COACH_NOT_INVITED`). Lie `googleId`, valide l'email, brûle le code d'invitation en attente. Ne PAS remplacer par `/auth/google`, qui crée un compte : cf. décision 27 |
| `POST /auth/signup/check-code` | public | contrôle le code d'inscription **sans le consommer** (mêmes erreurs et même verrou que la consommation). Permet à l'app de valider les 6 chiffres dès la saisie, au lieu de découvrir l'erreur après l'écran du mot de passe |
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
27. **`/auth/google` CRÉE un compte — donc il n'a rien à faire dans l'entrée entraîneur** (25 juillet 2026). Un entraîneur ne s'inscrit pas : son compte existe déjà, créé par son club. L'app se connectait d'abord par `/auth/google` puis demandait `/clubs/me` pour savoir si la personne était invitée — ce qui fabriquait **un compte joueur orphelin à chaque adresse non invitée**, avant de le déconnecter. D'où `POST /auth/google/coach` : l'invitation est vérifiée **avant** toute écriture, et un refus (403 `COACH_NOT_INVITED`) ne laisse **rien** en base.
    - C'est l'**appartenance** (`ClubMember`) qui autorise, **pas** l'approbation du club : un club `PENDING` doit pouvoir laisser entrer ses coachs, qui verront l'écran « en attente de validation ».
    - Révéler l'absence d'invitation ne fuite rien : le jeton Google prouve que l'appelant possède cette boîte mail, il n'apprend donc qu'une chose sur lui-même. Rien à voir avec l'anti-énumération de la décision 15.
    - Le code d'invitation en attente est **brûlé** à l'activation Google — sinon un code à 6 chiffres resterait utilisable sur un compte déjà activé.
    - Garde-fou : si le compte Google est déjà lié à un **autre** compte FootLink, on refuse au lieu de violer l'unicité de `googleId` (500). ⚠️ `/auth/google` (joueur/club) n'a **pas** ce garde-fou — angle mort connu, à traiter au durcissement.
28. **L'entrée entraîneur exige un `ClubMember` de rôle COACH** (25 juillet 2026, deux bugs signalés par Brice). `coachEntryStep` ne regardait que `passwordHash`/`googleId` : **tout** compte existant était routé comme s'il était l'entraîneur attendu. Un compte club qui saisissait sa propre adresse s'entendait répondre « connecte-toi avec Google » — réponse absurde.
    - Nouveau pas `NOT_A_COACH` (distinct d'`UNKNOWN`, qui reste « aucun compte ») : « un compte existe déjà avec cette adresse, mais aucun club ne l'a enregistrée comme entraîneur ». Ne fuite rien de neuf — `POST /auth/register` répond déjà 409 sur une adresse connue.
    - Le rôle **CLUB_ADMIN ne compte pas** : un responsable qui entraîne aussi passe par la connexion normale, pas par cette activation. `googleCoachSignIn` exige le même rôle COACH (il se contentait de l'appartenance).
29. ⚠️ **Ne jamais poser, dans un `useEffect`, un état dont ce même effet dépend.** Le bug : l'effet du parcours club faisait `setAccessToken(...)` *avant* d'attendre `getMyClub`, alors que `accessToken` était dans ses dépendances. Le changement d'état déclenchait le **nettoyage** de l'effet (`cancelled = true`), donc la suite était jetée et `alreadyHasClub` n'était **jamais** renseigné : un compte possédant déjà un club se voyait offrir le formulaire de création, et n'apprenait le refus qu'à l'envoi. Les deux états sont désormais posés **ensemble, à la fin**, et `accessToken` est hors des dépendances.
30. **`signOut` doit avaler l'échec de `googleSignOut`.** Sans `catch`, une erreur côté Google empêchait `forgetSession()` de tourner : l'utilisateur restait connecté localement après avoir demandé sa déconnexion.
31. **Le compte d'un club se crée avec une adresse LIBRE** (25 juillet 2026, tranché par Brice contre ma recommandation — je proposais d'autoriser un compte joueur existant). Un compte club ne se greffe pas sur un compte personnel : `/auth/google` aurait connecté le compte joueur existant, puis `requestClub` aurait basculé son `User.role` en CLUB_ADMIN — un compte joueur transformé en compte club sans que personne ne l'ait décidé.
    - `POST /auth/google/club` : crée le compte **uniquement** si ni l'adresse ni le `googleId` n'existent déjà. Sinon **409 `EMAIL_ALREADY_USED`**, sans rien écrire.
    - La règle tient **aux deux entrées**, sinon elle ne vaudrait rien : le bouton Google *et* le cas « arrivé déjà connecté » (`blocked === 'ALREADY_USED'` dans `register/club.tsx`, via un `useRef` figé au montage — un compte créé *pendant* le parcours est légitime, un compte préexistant non).
    - 🔴 **PIÈGE ASSUMÉ par Brice** : qui fait Google à l'étape 1 puis abandonne a un compte, donc son adresse est **brûlée définitivement** pour un club. Aucune UI ne débloque ça au MVP — il faut supprimer le compte en base. Deux conséquences à garder en tête : une personne ayant un compte joueur a besoin d'une **vraie autre boîte mail** (la règle « une boîte, un compte » interdit `nom+club@`), et le support consistera à supprimer des comptes à la main. Options écartées : refuser seulement les comptes « vraiment utilisés » (inopérant tant que les profils joueur n'existent pas), et un bouton « supprimer mon compte vide ».
32. **Médias sur Cloudflare R2** (25 juillet 2026), conformément à `AGENTS.md` §2. SDK S3 standard, **URL pré-signées** : le mobile téléverse directement, le backend **ne relaie jamais** les fichiers. Règles non négociables : le **serveur** génère la clé et l'URL (le client ne fournit **jamais** l'URL finale, sinon `avatarUrl` pourrait pointer n'importe où), type et taille validés serveur, TTL court, nom de fichier généré serveur. Purge du média à la suppression de compte (droit à l'effacement, §10).
33. **`User.avatarUrl` — une photo par PERSONNE, pas par rôle** (25 juillet 2026). La photo suit la personne : un joueur qui entraîne aussi n'en téléverse qu'une. Volontairement **différent** de `firstName`/`lastName`, qui vivent sur `ClubMember` parce que c'est le **club** qui les saisit avant que le compte existe — la photo, elle, est envoyée par l'intéressé lui-même. `PlayerProfile.avatarUrl` (déjà en base) reste la photo *sportive* du profil joueur ; `User.avatarUrl` est l'identité de la personne.
34. **Onboarding joueur : minimum requis, le reste plus tard** (25 juillet 2026). Exigé pour entrer : identité, année de naissance, **poste principal**, localisation — c'est-à-dire exactement ce sans quoi le matching de la phase 6 n'a rien pour filtrer. Taille, pied fort, bio, photo et club actuel restent proposables ensuite depuis le profil. Ne pas transformer ça en formulaire complet obligatoire : c'est là qu'on perd les inscrits.
    - ⚠️ **À trancher avant le lancement** : les **16-17 ans** sont autorisés (§6.4) et auront donc photo + position approximative en base. Ce sont des données personnelles de **mineurs**, et aucune règle particulière ne s'y applique aujourd'hui (`isMinor` existe mais n'est lu nulle part).
26. **Site internet du club** : facultatif, saisi à l'étape « contexte ». Normalisé en `https://` à l'écriture (personne ne tape le schéma, et sans lui la valeur est inutilisable par `Linking.openURL`).
35. 🔐 **Tout appel authentifié passe par `authed()` du contexte d'auth** (25 juillet 2026, bug signalé par Brice). `authed` rejoue l'appel après rotation du refresh token sur 401 ; il existait mais **n'était pas exposé** par le contexte, donc `register/club.tsx` et l'onboarding lisaient `loadTokens()` et gardaient un **instantané** du jeton d'accès. Symptôme observé : la recherche d'adresse répondait « Recherche indisponible » 16 minutes après la connexion — lu comme une panne de Mapbox, alors que c'était une simple expiration. La sauvegarde du profil aurait échoué pareil, en fin de parcours.
    - `PlacePicker` reçoit désormais **`authed`, pas un jeton** : un jeton en prop est par nature périmable, et ces écrans vivent plus longtemps que sa durée de vie.
    - ⚠️ **`loadTokens()` n'a rien à faire dans un écran.** Son seul usage légitime est la restauration de session au démarrage, dans le contexte.
36. **Le chemin d'inscription décide du rôle** (25 juillet 2026, option (b) validée par Brice). `User.role` valait `PLAYER` par défaut et ne devenait `CLUB_ADMIN` qu'à l'envoi de la demande — or l'identité vient **avant** le club (décision 31). Dans cette fenêtre, le créateur d'un club était un `PLAYER` sans profil, donc indiscernable d'un joueur : la garde de routage l'envoyait sur **l'onboarding joueur**, où on lui demandait son poste et son âge. Aggravé par la décision 38 : les deux sorties étant fermées, il y était **enfermé**.
    - Le compte créé par le parcours club naît `CLUB_ADMIN` : `POST /auth/google/club` le stampe, et `POST /auth/signup/verify-code/club` est le frère du `verify-code` générique pour la voie email.
    - **Endpoint frère, pas un champ de rôle dans le corps** : le rôle ne se déclare pas depuis le client. Symétrique de `/auth/google/club`, déjà séparé pour la même raison.
    - Sécurité vérifiée avant de le faire : **aucun `@Roles` sur `clubs.controller.ts`** — toute action de club exige un `ClubMember` **et** un club `APPROVED`. Un `CLUB_ADMIN` sans appartenance ne peut donc rien ; le rôle ne sert qu'au routage. ⚠️ Si un endpoint club se met un jour à ne vérifier que `User.role`, cette décision devient une faille.
    - `/auth/me` renvoie `clubStatus` (`null` = aucun club). Garde : `CLUB_ADMIN` + `clubStatus === null` → reprise du formulaire, testée **avant** l'onboarding joueur.
    - Conséquence dans `register/club.tsx` : `preSignedIn` ne vaut plus « connecté au montage » mais « connecté au montage **et rôle ≠ CLUB_ADMIN** ». Sans ça, le compte renvoyé ici par la garde s'entendait répondre « cette adresse a déjà un compte » — sans issue.
    - ⚠️ **`completeSignup` n'écrit le rôle que sur un compte encore `PLAYER`.** Un entraîneur créé par son club porte déjà `COACH` et **n'a pas de mot de passe** (`coaches.service.ts`), donc il peut emprunter l'inscription générique : écrire `PLAYER` par-dessus lui fermait ses équipes. Régression trouvée par `tools/e2e/email.ts`, désormais couverte par un contrôle permanent.
37. **La catégorie ne s'enregistre que si elle est déterminée** (25 juillet 2026). `getEligibleCategories` renvoie **toutes** les ligues de 1re à 5e pour un actif : prendre `eligible[0]` inscrivait chaque nouvel adulte en **1re ligue**. Un junior n'a qu'une catégorie possible, elle est donc enregistrable ; un actif choisit sa ligue, et ce choix ne se déduit d'aucune donnée. Un seul éligible → on enregistre ; plusieurs → `currentCategory` reste `null` et l'écran annonce « tu joues chez les actifs ».
38. **Un passage obligé se ferme des DEUX côtés** (25 juillet 2026). L'onboarding est atteint par redirection alors que la pile contient encore l'accueil et la connexion : le lien « Retour » **et** le bouton matériel Android en sortaient, vers l'écran de connexion, session ouverte. Deux chemins, donc deux verrous — `allowStackBack={false}` sur `AuthFormShell` et un `BackHandler` qui consomme l'événement dans tous les cas.
    - Au passage, `AuthFormShell` testait `onBack ?? router.canGoBack() ? …` : `??` lie **plus fort** que `?:`, la condition n'était donc pas celle qu'on lisait.
39. **Postes : 14 au lieu de 10** (25 juillet 2026, demandé par Brice). Ajoutés `DEFENSEUR_CENTRAL_DROIT`/`_GAUCHE` (la charnière dépend du système : un axial à trois derrière, un droitier et un gaucher à quatre) et `MILIEU_DROIT`/`_GAUCHE` (un milieu de couloir n'est pas un ailier, qui joue une ligne plus haut). Enum Prisma + `packages/shared` + nomenclature mis à jour ensemble.
    - ⚠️ À l'affichage, **`MD` = milieu DROIT** et le milieu défensif devient **`MDC`** : deux pastilles ne peuvent pas porter la même abréviation sur le même terrain.
41. **Le préremplissage Google ne stocke rien** (25 juillet 2026, option validée par Brice). `given_name`/`family_name` viennent du jeton ID déjà vérifié — aucun scope de plus à demander, `profile` est inclus. Ils voyagent dans `AuthTokens.profileHints`, sont gardés **en mémoire** par le contexte d'auth et consommés une fois par l'onboarding (`clearProfileHints`, sinon un rendu suivant réécrirait une correction). Rien en base : ce sont des données personnelles dont le fonctionnement n'a pas besoin (§10).
    - ⚠️ **L'année de naissance n'existe pas dans le jeton ID.** L'obtenir demanderait la People API et le scope **restreint** `user.birthday.read` (validation Google + évaluation de sécurité), pour une donnée que la plupart des gens ne renseignent pas. Elle reste saisie à la main — ne pas repartir de zéro sur cette piste.
    - Joints à `/auth/google` **seulement** : l'entrée entraîneur n'en a pas besoin (le club a saisi son identité), l'entrée club demande le nom du CLUB.
42. **Écrans club : ce que l'API donnait déjà, et ce qu'il a fallu ajouter** (25 juillet 2026). Les équipes et les comptes entraîneurs étaient finis depuis la Phase 4 sans un seul écran — un club pouvait s'inscrire et ne rien faire. Ajouts côté serveur, minimes : `aerialUrl` sur `GET /clubs/me` (l'URL porte le jeton Mapbox, elle ne peut pas se fabriquer côté app) et `categoriesForTeamGender` dans `packages/shared`.
    - `categoriesForTeamGender` répond à « ce qu'un **club** peut engager », à ne pas confondre avec `getEligibleCategories`, « ce qu'un **joueur** peut jouer » — celle-là dépend d'une année de naissance, celle-ci de rien.
    - 🔴 **La suppression d'une équipe ne se propose jamais à l'aveugle.** Le premier appui lit `GET /teams/:id/deletion-impact` et affiche le décompte ; le bouton de confirmation n'existe qu'ensuite. On ne s'appuie **pas** sur le 409 de l'API pour construire l'alerte — un refus attrapé en catch serait un chemin d'erreur, pas un dialogue.
    - `PUT /clubs/me/coaches/:id/teams` **remplace** les assignations : l'écran envoie l'état complet voulu, jamais un delta.
    - ⚠️ **Toute vue satellite exige la mention `AERIAL_ATTRIBUTION` à côté.** Les URL sont générées avec `logo=false&attribution=false`, ce que Mapbox n'autorise QUE si l'attribution figure ailleurs dans l'interface. Oubliée sur le tableau de bord à la première écriture, donc à vérifier sur chaque nouvel écran qui affiche une image.
    - Pas de logo de club : `Club.logoUrl` existe en base mais **aucun endpoint ne le téléverse** (le module media ne gère que les avatars). Demande un préfixe `logos/{clubId}/`, un `logoKey` accepté par `PATCH /clubs/me`, et l'URL de lecture signée.
    - Pas de toggle « Vue Entraîneur » : il n'ouvre que des écrans qui n'existent pas encore (feed, messagerie). Un interrupteur sans ampoule.
46. **Le logo FootLink est l'identite de l'app** (25 juillet 2026, fourni par Brice dans `assets/images/logo.png`). Il sert desormais d'icone d'application, d'ecran de demarrage et de marque sur l'ecran d'accueil.
    - ⚠️ **`assets/images/icon.png` etait l'icone par DEFAUT du template Expo** (le chevron bleu), et `ios.icon` pointait sur `assets/expo.icon`, egalement par defaut. D'ou le « A » bleu vu sur l'emulateur et dans le menu du client de developpement. `ios.icon` a ete retire pour que iOS retombe sur `icon`.
    - `adaptiveIcon` : `backgroundImage` et `monochromeImage` etaient aussi les images du template, elles sont retirees. Le logo sert de premier plan sur le noir de la marque.
    - ⚠️ **L'anneau vert exterieur du logo est ROGNE dans le lanceur Android**, verifie a l'ecran. Android ne montre qu'un disque d'environ 66 % du canvas de l'icone adaptative, et le logo remplit son carre. **Ce qu'il faut : un export du logo avec ~18 % de marge sur chaque bord** — a demander a Brice, c'est son fichier.
      - Piste tentee et **abandonnee** : generer la variante avec marge via `generateImageAsync` de `@expo/image-utils` (`padding`). La ressource native produite etait identique a l'originale, donc `padding` n'a pas l'effet attendu sur une image qui porte deja son propre fond. Ne pas y repasser sans mesurer les pixels.
      - Le lanceur de l'emulateur **met l'icone en cache** : une reinstallation du meme paquet ne la rafraichit pas toujours. Verifier un changement d'icone demande un `adb uninstall` — qui efface le SecureStore, donc la session.
    - 🔴 **Changer une image d'`app.json` exige `expo prebuild`, pas seulement `expo run:android`.** Avec un dossier `android/` deja present, `run:android` fait un build **incrementiel** et ne rejoue pas les plugins de configuration : le build a pris 12 secondes et l'icone est restee celle du template. Symptome reconnaissable — un build anormalement court apres un changement de configuration native. Lancer `npx expo prebuild --platform android` (qui efface et regenere `android/`, gitignore) **puis** `run:android`.
    - ⚠️ Le prebuild efface `android/`. Ce n'est pas grave — il est genere et gitignore — mais toute modification faite a la main dedans serait perdue.
47. 🔴 **Ne jamais televerser un fichier local avec `fetch` en React Native.** `fetch(fileUri)` puis `.blob()` compile, passe le typecheck et semble marcher — mais ne lit pas fiablement une URI `file://`, et le corps `Blob` d'un PUT y est mal supporte : le fichier part **vide**, le stockage repond 200 sur un objet de 0 octet, et l'echec est donc **silencieux**. Utiliser `FileSystem.uploadAsync` (`expo-file-system/legacy`) en `BINARY_CONTENT`, qui envoie les octets bruts — exactement ce qu'attend une URL pre-signee. `expo-file-system` est deja autolinke (dependance d'`expo`), donc aucun module de plus.
    - Le meme piege attend la photo de profil du joueur : reutiliser `putToStorage` de `api/club-logo.ts` plutot que d'ecrire un second televersement.
48. **Un champ vide n'est pas une absence, et les deux ne veulent pas dire la meme chose.** `dto.name ?? undefined` garde une chaine vide telle quelle : le formulaire de configuration pouvait donc **effacer le nom du club**. `UpdateClubDto.name` a maintenant `@MinLength(1)`, et l'ecran n'envoie le nom que s'il en reste un. La presentation, elle, doit pouvoir etre videe : la chaine vide y est une valeur legitime. Se poser la question **champ par champ**.
    - Deux courses corrigees au meme endroit : `confirmLogo` relit la cle remplacee **dans la transaction** (deux confirmations concurrentes laissaient un objet orphelin dans le bucket), et la bascule d'equipe d'un entraineur est protegee par un `useRef` et non par l'etat `busy` — un second appui dans la meme image de rendu voyait encore `busy === false` et l'une des deux bascules etait perdue.

52. **Annonces (Phase 5) — module complet** (25 juillet 2026). Le modele `Listing` existait deja en base ; il manquait tout le reste. Six routes sous `/listings`, un ordonnanceur, et les ecrans dans l'equipe.
    - **Ce que le client ne decide pas.** La **saison** est calculee (`getCurrentSeasonLabel`) : la laisser au client ferait dependre la saison d'une annonce de l'horloge d'un telephone, et c'est elle qui filtre le feed. Le **club** vient du token. Le statut **`EXPIRED`** est refuse au client (400) : il appartient a l'ordonnanceur, et le poser a la main creerait des annonces expirees sans echeance, invisibles et inexplicables.
      - ⚠️ Le refus d'`EXPIRED` a demande `@IsIn`, pas `@IsEnum` : le `Exclude<ListingStatus, 'EXPIRED'>` de TypeScript **n'existe pas a l'execution**, et `@IsEnum(ListingStatus)` acceptait donc `EXPIRED`. Defaut trouve en sondant l'API reelle, pas au typecheck.
    - **Une annonce nait en `DRAFT`** (tranche faute d'arbitrage disponible) : on l'ecrit en plusieurs fois, publier doit etre un geste. Le `@default(ACTIVE)` du schema ne s'applique qu'aux ecritures qui ne precisent rien. L'ecran de creation offre les deux boutons, pour ne pas imposer un aller-retour a qui sait deja.
    - **Trois postes secondaires au maximum** (tranche aussi) : le champ est un `Json?` sans borne naturelle, et une annonce « tous les postes » remonterait pour chaque joueur — le club recevrait des candidatures qu'il n'a pas cherchees. Les doublons et le poste principal sont retires cote serveur.
    - **`assertTeamAccess` est reutilise, jamais reecrit** : c'est lui qui porte « club APPROVED » et « un entraineur n'agit que sur ses equipes assignees ». Une annonce n'est jamais cherchee seule — on passe par son equipe, ce qui rend l'annonce d'un autre club indistinguable d'une annonce inexistante.
    - **Suppression** : meme discipline que les equipes. `GET /listings/:id/deletion-impact`, refus 409 `LISTING_DELETION_CONFIRMATION_REQUIRED` sans `?confirm=true`.
    - ⚠️ **Les annonces SONT un onglet** — decision inversee le 25 juillet apres essai. L'argument initial (« une annonce appartient a une equipe ») portait sur la **creation**, et il tient : le formulaire demande l'equipe quand il ne la connait pas, et n'y touche pas quand il la connait. Mais on **consulte** ses annonces bien plus souvent qu'on n'en cree, et « ce que mon club cherche » est une question de club : les enfermer dans une equipe imposait deux ecrans a chaque coup d'oeil. `GET /listings` sans `teamId` renvoyait deja tout, l'API n'a pas bouge.
    - Le **terrain interactif est le meme composant** que l'onboarding joueur, avec des libelles injectes : « poste cherche » et « postes acceptes aussi ». Meme geste, sens different.
    - `tools/e2e/listings.ts` : 26 controles, dont le cloisonnement inter-clubs et l'entraineur cantonne a ses equipes.
54. **Barre d'onglets club : cinq places, et pas une de plus** (25 juillet 2026). `Club · Equipes · Annonces` aujourd'hui, `Joueurs` et `Messages` a venir. Au-dela de cinq, les libelles se tronquent et la barre devient un menu qu'on lit au lieu d'un repere qu'on reconnait.
    - **`Apercu` a quitte la barre** pour devenir la derniere carte de l'onglet `Club`. C'est une verification qu'on fait juste apres avoir modifie sa fiche, pas un endroit ou l'on va — et c'est ce qui libere la place de `Messages`.
    - **`Entraineurs` n'y est toujours pas** : on en ajoute un par saison, c'est de l'administration.
    - ⚠️ Ne pas ajouter d'onglet **vide**. `Joueurs` et `Messages` n'ont pas d'API : un onglet qui mene au neant est pire que pas d'onglet.

53. ⚠️ **`@nestjs/schedule` est INUTILISABLE dans ce depot.** Il se resout depuis la racine alors que `@nestjs/core` vient du store `.pnpm` : deux copies de Nest, donc deux `Reflector`, et le demarrage echoue sur `Nest can't resolve dependencies of the SchedulerMetadataAccessor`. Meme piege que `@prisma/client` (§7). L'expiration des annonces utilise donc un `setInterval` dans `OnModuleInit`, avec `unref()` pour ne pas retenir le processus. Pour une tache quotidienne unique, une dependance de plus ne valait pas ce risque.
    - Un passage a lieu **30 s apres le demarrage** : sans lui, un serveur redemarre chaque jour pourrait n'executer la tache jamais.
    - ⚠️ Le travail est idempotent mais **sans verrou** : si plusieurs instances tournent un jour, il en faudra un.

49. **Liquid Glass : le vrai materiau d'Apple sur iOS 26, un repli ailleurs** (25 juillet 2026, demande de Brice — « je veux le vrai liquid glass de iOS, si y a pas sur Android c'est pas grave »).
    - `expo-glass-effect` rend un **`UIVisualEffectView` natif** : refraction, brillance de bord, reaction au contenu qui defile dessous. Ce n'est **pas** imitable en JS, et ce n'est pas `expo-blur`.
    - iOS < 26 et Android : repli sur `expo-blur`. Moins beau, assume.
    - 🔴 **Deux gardes, pas une** : `isLiquidGlassAvailable()` dit que la plateforme le supporte, `isGlassEffectAPIAvailable()` que l'API est la **a l'execution**. Certaines betas d'iOS 26 annoncent la premiere sans fournir la seconde, et `GlassView` y **plante** (expo#40911).
    - ⚠️ Le voile du repli est dense (0.86) : le flou d'Android est bien plus leger que celui d'iOS, et a 0.55 on lisait le bouton qui defilait derriere la barre. Une barre de navigation illisible est un defaut, pas un parti pris. Le materiau natif, lui, gere son contraste seul et n'a pas besoin de ce voile.
    - 🔴 **La barre NE FLOTTE PAS** (revenu dessus le 25 juillet 2026, Brice l'a signale deux fois : « ca passe sous le menu, du coup on voit plus »). En `position: absolute` le contenu defilait derriere le verre : joli a l'arret, penible a l'usage — pendant chaque defilement, cartes et boutons disparaissaient sous les icones. **La lisibilite passe devant l'effet.**
      - Contrepartie assumee : sur iOS 26 le Liquid Glass ne refracte plus le contenu qui passe dessous, il ne garde que sa brillance et son lisere. Repasser en flottant tient en une ligne (`position: 'absolute'` sur `tabBarStyle`).
    - 🔴 **La barre a un fond de base pose en dur**, sous le materiau. Sans lui elle ne devait sa lisibilite qu'a un module natif : sur un client construit avant l'ajout de `expo-glass-effect` / `expo-blur`, ni `GlassView` ni `BlurView` ne rendent quoi que ce soit, la barre devient **totalement transparente** et le contenu defile a nu par-dessus les icones. Une barre de navigation ne peut pas dependre d'un module optionnel pour exister.
50. **Contexte en haut, destinations en bas** (25 juillet 2026). Le bandeau `ClubHeader` porte le club — et portera le selecteur d'equipe active et la bascule Vue Supervision / Vue Entraineur. Ce sont des **contextes** : ils changent le sens de tous les onglets a la fois, donc en faire un cinquieme onglet ferait perdre l'information des qu'on en sort.
    - ⚠️ **Le selecteur d'equipe et la bascule de vue ne sont PAS construits** : ils n'ouvriraient sur rien tant que les ecrans d'entraineur (feed, messagerie) n'existent pas. La place leur est reservee dans le bandeau, pas occupee.
    - **La barre porte la structure DEFINITIVE, pas celle du moment** (revu le 25 juillet 2026 apres remarque de Brice : « ca a plus rien a voir avec ce qui va arriver apres »). Aujourd'hui **Club · Equipes · Apercu** ; **Joueurs** et **Messages** s'inseront entre Equipes et Apercu **sans rien deplacer** de ce que l'utilisateur aura appris. Remplir la barre avec ce qui existe obligeait a la demonter dans deux mois.
    - `Entraineurs` **n'est pas un onglet** : on en ajoute un par saison. C'est de l'administration, donc une carte dans l'onglet `Club` (`href: null` sur la route, qui reste navigable).
    - **Les annonces n'en seront pas un non plus** : une annonce appartient a une **equipe**, elle vivra dans le detail de l'equipe. Un onglet `Annonces` obligerait a redemander « laquelle ? » a chaque fois.
    - ⚠️ **Aucun onglet vide** : Joueurs et Messages n'ont pas d'API.
    - `TAB_BAR_HEIGHT` est exporte par `ui/glass.tsx` et lu par le layout **et** `AppScreen` : deux constantes separees divergent toujours, et le symptome est du contenu qui passe sous les icones. La reserve basse se **calcule** (`hauteur + insets.bottom + 24`) — un nombre fixe ignorait la barre de gestes, qui varie d'un appareil a l'autre.
51. 🔴 **Un module natif ne s'importe pas au premier niveau d'un fichier de route.** `import * as ImagePicker from 'expo-image-picker'` en tete de `club/index.tsx` a casse **toute l'application** sur le client iOS de Brice, construit avant l'ajout du module : le module de route echouait, donc plus de `default export`, donc `Cannot read property 'ErrorBoundary' of undefined`. Charge a l'appui (`await import(...)`) avec un message de repli, seule l'action concernee echoue et le reste vit.
    - Vaut pour tout module natif ajoute apres coup, tant que les clients de developpement ne sont pas tous reconstruits.

43. **L'espace club est en ONGLETS, plus en tableau de bord** (25 juillet 2026, demandé par Brice : « on comprend pas trop ce qui se passe »). Un écran d'aiguillage fait de cartes n'apprend rien et ajoute un appui avant chaque chose utile. Quatre onglets en bas : **Club** (configuration), **Équipes**, **Entraîneurs**, **Aperçu**. La carte satellite a quitté cet écran — elle décorait sans informer.
    - `teams/` et `coaches/` ont chacun leur `_layout` en **pile**. Sans ça, `new` et `[id]` deviendraient des onglets : la barre du bas en compterait cinq, dont deux qui n'ont de sens qu'en passage.
    - `Tabs` est **vendoré dans expo-router** (`build/react-navigation/bottom-tabs`) : rien à installer, et surtout ne pas ajouter `@react-navigation/bottom-tabs`, absent du projet.
    - `AppScreen` a désormais `allowStackBack` : un onglet est une **racine**, atteinte par la barre du bas, et pourtant la pile garde un historique — l'écran affichait donc un « Retour » qui ne menait nulle part de sensé.
44. **Configuration du club et aperçu joueur** (25 juillet 2026). L'onglet Club règle tout ce qui compose la fiche publique : logo, nom, présentation, site, adresse de contact **et le choix de l'afficher** (`Club.showContactEmail`, faux par défaut — on ne publie pas une adresse email sans un geste explicite), plus le déplacement du terrain. L'onglet Aperçu montre exactement ce qu'un joueur verra, ce qui permet de vérifier que le masquage fonctionne vraiment.
    - Configuration ouverte à un club encore `PENDING` : préparer sa fiche pendant l'attente est légitime, la publier ne l'est pas. Seules les équipes et les entraîneurs exigent l'approbation.
    - `Club.logoKey` **remplace** `logoUrl` : le bucket est privé, donc on stocke la clé et l'URL de lecture est signée. Même raison que `User.avatarKey`. `MediaService` est généralisé par préfixe (`avatars/` et `club-logos/`) pour que les garde-fous — clé générée serveur, type imposé à la signature, taille vérifiée après coup — restent écrits **une seule fois**.
    - Les endpoints du logo vivent dans le module **clubs** et non media : ils doivent vérifier que l'appelant est CLUB_ADMIN de SON club, ce que seul `ClubsService` sait faire. Mettre `ClubsService` dans le module media créerait un cycle (media ← auth ← clubs). Vérifié : un COACH reçoit 403, une clé forgée hors de son préfixe reçoit 400.
    - ⚠️ **`players.service` ne renvoie plus le logo du club actuel.** La colonne `logoUrl` a disparu et résoudre l'URL signée là-bas demanderait d'y injecter `MediaService` : à faire quand les écrans de profil joueur arriveront, plutôt que d'exposer une clé brute inutilisable.
    - ⚠️ **`expo-image-picker` est un module natif** : choisir un logo exige une reconstruction du client de développement. Même contrainte que la photo de profil joueur et la géolocalisation — à regrouper dans un seul build.
45. **Un bouton doit dire ce qu'il a fait** (25 juillet 2026, signalé par Brice sur « renvoyer le code » : « on sait pas si ça a marché »). Le retour était un texte en haut de liste, loin du bouton appuyé, et il ne disait pas DE QUI il parlait. Il se joue maintenant sur la carte concernée : envoi en cours, puis confirmation qui **reste affichée** — une confirmation qui s'efface au bout de quelques secondes laisse un doute à qui a regardé ailleurs.

40bis. 🔴 **Après une écriture que la garde de routage LIT, `reload()` AVANT de naviguer** (25 juillet 2026, bug signalé par Brice). `requestClub` réussissait puis faisait `router.replace('/')` sans relire la session : `clubStatus` valait encore `null` en mémoire, la garde renvoyait donc sur le formulaire, qui trouvait le club et annonçait **« ce compte est déjà rattaché à un club » juste après un envoi réussi**. Le bouton « aller à l'accueil » de cette impasse refaisait `replace('/')` sans relire non plus : **boucle**.
    - Règle : toute sortie d'un parcours vers `/` passe par un helper qui relit d'abord (`leaveToGuard` dans `register/club.tsx`, `await reload()` dans l'onboarding joueur). La relecture peut échouer sans bloquer le départ — le club existe, la garde ramènera si besoin.
    - ⚠️ **À refaire pour chaque nouveau champ de `/auth/me` que la garde consulte.** C'est le prix d'une garde qui lit un état en mémoire.
40. **Le terrain se dessine dans le sens des pastilles** (25 juillet 2026). `POSTE_META.y` va du but défendu (0) vers l'attaque (100), donc s'inverse au rendu ; les tracés SVG, eux, étaient en coordonnées brutes — la **surface de réparation se retrouvait autour de l'attaquant** et le **rond central autour du gardien**. Sens retenu : une feuille de composition, sa surface en bas avec le gardien dedans, ligne médiane en haut.

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
- **Créer un entraîneur envoie un vrai email — non testé de bout en bout.** L'écran `/club/coaches/new` est écrit et typé, la liste est vérifiée à l'écran, mais `POST /clubs/me/coaches` expédie une invitation à l'adresse saisie : le parcours n'a pas été joué pour ne pas envoyer de message sans l'accord de Brice. À valider avec une adresse qu'il contrôle. Le reste des écrans club est vérifié à l'écran, création et suppression d'équipe comprises.
- **`bricemabi2@gmail.com` a été rattaché au club `Grim` en base**, en `CLUB_ADMIN` `isOwner: false`, uniquement pour tester les écrans club depuis l'AVD (le compte propriétaire, `vinstexx`, se connecte par mot de passe). Donnée de test : supprimer la ligne `ClubMember` et repasser le `User.role` à `PLAYER` pour revenir à un état propre.
- **Installer le client de dev sur l'iPhone — [action Brice].** Le build ad-hoc passe (équipe `THHTC74QPQ`, UDID `00008101-001E3D4A3C78001E` provisionné). L'installation a échoué sur « cette app ne peut pas être installée car son intégrité n'a pas pu être validée » : iOS valide la signature **en ligne** pendant l'installation. Couper VPN **et** Relais privé iCloud sur le téléphone, ouvrir le lien **dans Safari**. Si l'erreur persiste alors que l'abonnement développeur est actif, régénérer le certificat de distribution et relancer un build — un certificat émis pendant un abonnement lapsé reste refusé après renouvellement.
  - Une fois installé : l'iPhone doit joindre Metro **et** l'API. Le client dérive déjà l'hôte de l'API de celui de Metro (`api/client.ts`), donc rien à configurer — **sauf** si Metro annonce l'IP de l'adaptateur **NordLynx** (`10.5.0.2`) au lieu du Wi-Fi (`172.22.22.61`). Dans ce cas, lancer Metro avec `REACT_NATIVE_PACKAGER_HOSTNAME=172.22.22.61`. Le pare-feu est déjà ouvert (règles Node « tout port TCP » en profil Public, et le Wi-Fi est en Public).
- **Photo de profil et position GPS de l'onboarding joueur : approuvés, pas encore codés.** Les deux exigent `expo-location` / le sélecteur d'image, donc **une reconstruction native** — à faire en un seul build. En attendant, la localisation passe par la saisie d'adresse (Mapbox), ce qui couvre le besoin.
- **Suggestions Mapbox : le tri POI-first sert le club, pas le joueur.** Un club cherche un stade, donc un POI ; un joueur cherche sa commune, et se voit proposer des points d'intérêt (« Bisse de Grimisuat », un logement de vacances) avant sa commune. Les doublons stricts sont supprimés (même libellé + même contexte), mais le **classement** reste celui du club. À paramétrer par usage si ça gêne à l'usage.

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
- 🔴 **AUCUNE animation d'entrée sur un bloc qui contient du CONTENU.** Sur ce stack (rendu logiciel de l'émulateur, Reanimated 4 + React Compiler), une animation d'entrée **ne se joue pas toujours** — et ses valeurs de départ **persistent alors à l'écran**. Le symptôme est intermittent, donc très difficile à reproduire à la demande.
  - `from={{ opacity: 0 }}` → contenu **invisible** : « écran vide ». Signature reconnaissable : seuls les éléments **hors** MotiView restent visibles (le stepper et « Retour », mais ni titre, ni sous-titre, ni formulaire).
  - `from={{ translateX: 28 }}` → contenu **décalé** de 28 px hors marge. C'est ce qu'a produit ma première correction : elle échangeait « invisible » contre « décalé ». **Toute** valeur de départ différente de l'arrivée peut rester : le seul état de départ sûr est l'état final, autrement dit pas d'animation d'entrée.
  - Retirées de `auth-form-shell` (titre + corps), `StepTransition`, `form-banner`, `text-field`, `place-picker` (suggestions), `register/index` (cartes de rôle), `home`.
  - **Ce qui reste animé, et pourquoi c'est sûr** : le retour au toucher (`PrimaryButton`, `GoogleButton`, cartes de rôle) est déclenché par l'utilisateur et part de l'état courant, donc rien ne peut y rester figé ; `welcome.tsx` garde son fondu en cascade (écran validé par Brice, jamais blanchi) et `pitch-backdrop` ses halos (décoratifs). Risque résiduel assumé sur ces deux-là.
  - Si les animations d'entrée doivent revenir pour l'« effet WOW », il faudra d'abord vérifier sur **du vrai matériel** (l'émulateur rend en logiciel) — et jamais laisser la visibilité d'un contenu en dépendre.
- **Ne pas faire dépendre un champ de formulaire d'une animation d'entrée.** Une `MotiView` avec `from={{ opacity: 0 }}` a laissé la carte du terrain **invisible** en conditions réelles : l'espace était réservé, mais rien ne se dessinait — même pas la bordure — l'animation ne s'étant pas jouée. La condition exacte de déclenchement n'a pas été identifiée ; le bloc a simplement été rendu sans animation d'entrée.
- **Une animation en BOUCLE INFINIE sur un grand élément fait planter l'émulateur (ANR).** Les halos du fond (`pitch-backdrop.tsx`) « respiraient » via une boucle Moti (`loop: true`) sur `scale`+`opacity`. L'émulateur Android rend en **logiciel** (pas de vrai GPU — cf. « Failed to initialize 101010-2 format » dans logcat), donc il recompose ces disques de 380 px au CPU **à chaque frame** : `RenderThread` bloqué à ~65 %, la répartition des évènements tactiles affamée, et Android affiche « FootLink isn't responding » en boucle. `renderToHardwareTextureAndroid` **n'y change rien** (pas de GPU pour porter la texture). Corrigé en supprimant la boucle (halos statiques, simple fondu d'entrée) : `RenderThread` retombe à 0 %. **Règle** : pas d'animation perpétuelle sur une grande surface. Une transition qui se **termine** est gratuite ; une qui **boucle** coûte à chaque frame, pour toujours. Vérifier avec `adb shell "top -H -n 1 -b | grep RenderThread"`.
- **Le cache de transformation Metro peut rendre un import parfaitement valide introuvable.** Symptôme vu : `ReferenceError: Property 'getMyClub' doesn't exist` alors que l'import existait, que `tsc` passait, et que deux autres écrans utilisaient la même fonction depuis des semaines. Ce n'est **pas** un bug du code. Purge (Metro arrêté) puis `pnpm mobile:dev --clear` :
  ```bash
  pnpm mobile:dev --clear
  ```
  Supprimer aussi `node_modules/.cache`, `apps/mobile/.expo` et `%TEMP%/metro-cache` si `--clear` ne suffit pas. Le rebuild complet (~2800 modules) prend une dizaine de secondes. Ne jamais purger pendant qu'un build Gradle tourne.
- **Modifier `packages/shared` désynchronise l'app le temps du rebuild.** Renommer un export (ici `aerialImageUrl` → `mapboxAerialUrl`) fait recharger Metro avec un `dist/` encore ancien d'un côté et du code neuf de l'autre : l'app lève un `TypeError: undefined is not a function` et l'écran concerné rend **du vide**, sans message à l'utilisateur. Attendre le `Found 0 errors` du watcher `tsc`, puis relancer l'app. Ce n'est jamais un bug du code applicatif.
- **Le bundle Metro ne prouve rien sur le code des écrans.** `expo-router` découpe les routes en chunks chargés à la demande : chercher une chaîne dans `entry.bundle` ne trouve **ni** le nouveau code **ni** l'ancien. Pour vérifier, s'appuyer sur `typecheck` + l'e2e + l'app, pas sur le contenu du bundle.
- **`nest --watch` se relance tout seul après un `Stop-Process`** — et la tâche suivante se heurte alors à `EADDRINUSE :::3000`. Tuer le processus qui écoute ne suffit donc pas : arrêter **la tâche** (son `pnpm`/watcher), puis vérifier que le port est libre avant de relancer.
- **`tools/e2e/email.ts` ne supporte pas plus d'un lancement par minute.** `/auth/coach-invite/status` est plafonné à **5 appels/minute** (`@Throttle`, la réponse révèle l'existence d'un compte) et le script en fait 4 : deux passes rapprochées font échouer des contrôles **sains** avec un `step` `undefined`. Attendre la fenêtre avant de conclure à une régression — `phase4.ts` le fait explicitement, `email.ts` non.
- 🔴 **Un test e2e ne doit rien emprunter à la base.** `email.ts` lisait `SELECT id FROM Club LIMIT 1` pour rattacher un `ClubMember` : sur une base réellement vide, l'INSERT posait **zéro ligne**, le contrôle « CLUB_ADMIN → NOT_A_COACH » passait donc **à vide** et celui du COACH échouait. Le script crée maintenant son propre club fixture. Un contrôle vert qui ne vérifie rien est pire que pas de contrôle.
- **Le build iOS échoue sur `Install pods` à cause de Google Sign-In.** `GoogleSignIn` (SDK iOS 8.x) tire `AppCheckCore`, écrit en **Swift**, qui dépend de `GoogleUtilities` et `RecaptchaInterop`, écrits en **ObjC sans module map** — CocoaPods refuse alors l'intégration en bibliothèques statiques. Expo gère ce cas pour ses propres modules (`autolinking_manager.rb`), mais `google-signin` est autolinké par React Native, donc hors couverture. Corrigé par `expo-build-properties` avec `modular_headers: true` sur ces **deux pods précis** (`apps/mobile/app.json`).
  - `useFrameworks: 'static'` corrigerait aussi, mais **globalement** : il désactive les modules Expo précompilés (`RNScreens`, `RNSVG`, `RNCSafeAreaContext` arrivent en xcframeworks prêts) et casse souvent Reanimated. À n'envisager qu'en dernier recours.
  - ⚠️ La doc de `google-signin` annonce **Expo 52 → 56** ; on est en **57.0.8**. RN 0.86 est dans la plage, mais en cas de nouveau mur côté iOS, c'est le premier suspect.
- **Les logs de build EAS sont en Brotli**, pas en gzip, et servis sans en-tête d'encodage : `Invoke-WebRequest` comme `curl --compressed` rendent du binaire (`curl` sort même en 61). Récupérer l'URL via `npx eas build:view <id> --json` (champ `logFiles`, signée 15 min), télécharger brut, puis `zlib.brotliDecompressSync`. Le fichier est ensuite du JSONL, un objet par ligne, le texte dans `msg`.
- Ne **jamais** commiter `apps/api/.env`. Vérifier avant chaque commit :
  `git diff --cached --name-only | grep -E '(^|/)\.env$'` doit être **vide**.

---

## 8. Rappels de conventions

- **TypeScript strict, jamais `any`.**
- **Sécurité** : rien sans authentification (guard JWT global, `@Public()` pour les exceptions) ; autorisation vérifiée sur **chaque** ressource (anti-IDOR) ; ne jamais faire confiance à un ID venant du client (le `clubId` se dérive du token).
- **`use context7`** pour la doc à jour des librairies (non connecté dans la session précédente : `.mcp.json` est en place, il se charge au démarrage de Claude Code).
- Poser une question à Brice avant toute action risquée ou toute déviation d'`AGENTS.md`.
