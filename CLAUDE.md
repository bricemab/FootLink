# CLAUDE.md — FootLink (mémoire opérationnelle)

> ## 👉 NOUVELLE SESSION / NOUVELLE MACHINE : lis **`HANDOFF.md`** EN PREMIER
> Il contient l'**état d'avancement** (phases faites/restantes), les **décisions prises**,
> le **setup machine** (le `.env` n'est pas commité), les **TODO** et les **questions en attente**.
> Sans lui, tu n'as aucun contexte sur ce qui a déjà été construit.

> Lu à chaque session. Règles **ultra-importantes** à ne JAMAIS oublier.
> Spec complète = **`AGENTS.md`** · Modèle de données = **`apps/api/prisma/schema.prisma`** · Données de réf = **`nomenclature_football_suisse.json`** · État = **`HANDOFF.md`**.
> **Décisions arrêtées : ne jamais dévier sans l'accord explicite de Brice.** Incohérence/manque repéré → **le signaler**, ne pas trancher seul.

## Identité
FootLink — mise en relation **joueurs amateurs ⇄ clubs** (football suisse), façon **LinkedIn × Tinder**. MVP **Valais (AVF)** → Suisse entière ensuite. `footlink.ch` · bundle `ch.footlink.app` · scheme `footlink://`.

## Les 2 priorités au sommet
1. **UI/UX « effet WOW »** — 60 fps, premium. Reanimated 3, Gesture Handler, Moti, Lottie, **Tamagui**, Expo Image (blurhash), FlashList.
2. **Sécurité des données** — voir section dédiée (aussi critique que l'UI).

## 🔐 SÉCURITÉ (hyper-important, non négociable)
- **Isolation stricte des comptes** : impossible de se connecter au compte d'autrui / d'usurper une session.
- **Aucune donnée sans authentification** : hors endpoints publics (auth, `GET /api/v1/app/config`), tout exige un **JWT valide**.
- **Aucune action sans email validé** : tant que `emailVerifiedAt` est nul, **toutes** les routes authentifiées répondent **403 `EMAIL_NOT_VERIFIED`**. Seules exceptions : `GET /auth/me`, `POST /auth/resend-verification`, `POST /auth/logout` (décorateur `@AllowUnverified()`). L'état est **relu en DB à chaque requête** (jamais depuis le token, qui serait périmé) — même garde pour un compte non `ACTIVE` (403 `ACCOUNT_NOT_ACTIVE`).
- **Autorisation sur CHAQUE ressource (anti-IDOR)** : ne jamais faire confiance à un ID client. Toujours vérifier propriété/rôle : joueur = **son** profil ; coach = **ses** équipes assignées ; club_admin = **son** club ; super_admin = global. Un user ne lit/modifie **jamais** les données d'un autre.
- Mots de passe **argon2**. Refresh tokens + jetons email (vérif/reset/invite) **hashés**, **usage unique**, **TTL court**. Jamais en clair, jamais logués.
- **Google Sign-In** : jeton Google vérifié **côté serveur** (signature + audience). Jamais confiance au client.
- **Filtrer blocages/suspensions** dans **TOUTES** les requêtes (feed/match/messagerie, deux sens).
- Uploads : URL pré-signées courtes + validation type/taille. Validation stricte (DTO + class-validator), pas de mass-assignment, **rate-limit** sur l'auth.
- Secrets **uniquement** dans `.env` (gitignored). LPD : minimisation, droit à l'effacement, géoloc **~1 km** (jamais GPS brut).

## 🔑 Auth / inscription (MVP)
Deux modes : **(a) email + mot de passe AVEC validation email**, ou **(b) Google Sign-In**. JWT access court + refresh hashé (rotation). Reset password + invitation coach par email (**Gmail SMTP + app password**).

## Décisions validées (à mémoriser)
1. **Région = table `Region` (seedée), rattachée au CLUB uniquement.** Un joueur n'a **pas** de région → trouvable inter-cantons via rayon géo (ex. frontière VD/VS = visible des deux côtés).
2. **Emails via Gmail SMTP + app password** (Nodemailer). Modèle `Token` (EMAIL_VERIFY / PASSWORD_RESET / COACH_INVITE).
3. **Table `Notification`** (in-app + badge non-lus) **en plus** du push Expo.
4. **Multilecture** : `ConversationRead` (lastReadAt par user). `Message.readAt` **supprimé**.
5. **Nomenclature** : enums Prisma = source des **codes** ; **labels FR/DE** générés dans `packages/shared` depuis le JSON ; **seul `Region`** va en base.
6. **Mineurs** : 16+ au MVP (`birthYear ≤ saison − 16`), `isMinor=true` pour les 16-17 ans, **aucun tuteur** (`guardian*` inutilisés). < 16 = inscription bloquée.

## Règles métier clés
- **Interactions** : joueur `APPLIED` (postuler → **notifie** le club) / `SAVED` (privé, **rien**) ; club **like** un joueur (le notifie, **sans réciprocité**). Intérêt des **deux côtés** sur `(listing, player)` → **`Match`** (unique) → **`Conversation`**. Un `SAVED` seul ne déclenche **jamais** rien. « Like retour » = créer/passer le `PlayerInterest` en `APPLIED`.
- **Rôles** : `PLAYER` (inscription libre) · `CLUB_ADMIN` (créé **sur validation** ; Vue Supervision + **toggle Vue Entraîneur** sur n'importe quelle équipe du club) · `COACH` (limité à ses **équipes assignées**, **sélecteur d'équipe active**) · `SUPER_ADMIN` (= Brice ; valide les clubs **en DB** au MVP). `User.role` = principal ; `ClubMember.role` = **contextuel par club**.
- Un club doit être **`APPROVED`** pour publier / créer des coachs (garde d'accès sur **toutes** les actions club).
- Une **conversation appartient à l'ÉQUIPE** : seuls le joueur + le(s) coach(s) **assigné(s)** y participent. Le CLUB_ADMIN n'y accède qu'en **Vue Entraîneur**.
- **Catégorie = calculée depuis `birthYear` par saison** (helper partagé). **Ne JAMAIS** coder en dur une année dans une catégorie.
- Annonces : `DRAFT/ACTIVE/EXPIRED/CLOSED` + `season` + `expiresAt` ; un scheduler passe les échues en `EXPIRED`.

## Stack & structure
- **Monorepo** pnpm + Turborepo : `apps/api` (**NestJS + Prisma / MySQL 8**), `apps/mobile` (**Expo RN + TS**), `packages/shared` (types API, labels i18n, helper catégories éligibles), `packages/config`. **`apps/admin` = POST-MVP → NE PAS créer.**
- Backend **modulaire** : `auth users players clubs teams listings interactions matches messaging notifications moderation geo`. API REST **versionnée `/api/v1`**. **WebSocket (Socket.IO)** pour le chat.
- Mobile : **Expo Router**, i18n **FR/DE** (expo-localization, repli FR), OTA via **EAS Update**, **gate version min**.
- Géo : lat/lng **arrondis ~1 km** + `canton` ; rayon = **SQL raw haversine** (service dédié).

## Conventions
- **TypeScript strict partout. JAMAIS `any`.**
- Codes de réf alignés sur le JSON de nomenclature **+** enums Prisma (source unique de vérité).
- **`use context7`** pour la doc à jour des libs (NestJS, Prisma, Expo, Tamagui, Reanimated…).
- DB locale dev : `DATABASE_URL="mysql://root:SQLadmin@localhost:3306/footlink"` → dans `apps/api/.env` (**gitignored**).
- Poser une question à Brice avant toute action risquée ou non désirée.

## Ne PAS construire (hors périmètre)
- Back-office web admin (**post-MVP** ; signalements consultés en DB au MVP).
- Vidéos/highlights · stats joueurs · monétisation · locale **IT** · **< 16 ans**.
- ❌ **Mode « renfort ponctuel / dépannage » : ABANDONNÉ — ne doit exister NULLE PART.**
