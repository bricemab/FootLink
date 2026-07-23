# Transcript — Brainstorm app de mise en relation joueurs ⇄ clubs (foot suisse)

> Conversation de cadrage entre Brice (dév. TypeScript/JavaScript) et Claude.
> Date : 23 juillet 2026. Sert d'historique des décisions ; le document exécutable est `AGENTS.md` (ex-`CADRAGE.md`).

---

## 1. Brice

J'aimerais faire une application pour commencer qui sera exclusivement en Valais mais à l'avenir ça sera pour la Suisse entière. En gros le problème que j'ai c'est que je joue dans un club de foot en tant que gardien et je serais peut-être intéressé à changer de club ou voir s'il y a de meilleures opportunités. Le souci c'est que là, je ne sais pas quel club est intéressé par un gardien et si un club est intéressé c'est pour quelle équipe (junior A B C D E, 1-2-3-4-5e ligue). Donc j'aimerais faire une application qui permettrait de mettre en relation ces gens. Il faudrait donc une vue « club / recherche de joueur » et une vue « joueur / rechercher nouveau club ». J'aimerais qu'on brainstorm ensemble.

## Claude

Reformulation validée : plateforme de mise en relation joueurs amateurs ⇄ clubs, façon « marché des transferts », deux faces (côté joueur / côté club). Départ Valais → Suisse. Points soulevés :

1. Le cœur = le **matching** (poste + catégorie + ligue + zone géo). Modèle de données précis dès le début.
2. Problème de l'**œuf et la poule** (marketplace à deux faces) ; avantage : le Valais est petit.
3. **Confidentialité** : un joueur qui cherche ne veut pas que son club actuel le sache.
4. **Confiance / anti-fake** : vérifier qu'un « club » est réel.

Questions : outil de contact direct ou matching type Tinder ? Business model ?

---

## 2. Brice

Plutôt un système style **LinkedIn mélangé à Tinder**. Business : **gratuit au début** pour tout le monde, puis faire payer les clubs. La validation d'identité, pas tout de suite, mais bonne idée.

## Claude

Vision « LinkedIn × Tinder » posée : profil joueur riche (côté LinkedIn), annonce club, moteur de like/match (côté Tinder), like réciproque → messagerie. MVP minimal : inscription, profils, annonces, like/match, messagerie basique. Deux chantiers proposés : nomenclature officielle des ligues/catégories, et stack technique.

---

## 3. Brice

Pas de vidéo highlight pour l'instant (plus tard oui). Le club peut créer son club et **ajouter toutes les équipes** qu'il veut. Les joueurs peuvent **postuler** aux annonces (style jobup), et les clubs peuvent **liker** des joueurs pour qu'ils sachent qu'ils intéressent. Le joueur peut « s'annoncer intéressé » ou juste « enregistrer » l'annonce. Le club voit les joueurs qui ont liké son annonce. **Pas besoin de like réciproque pour voir l'intérêt** de l'autre ; par contre une fois qu'un joueur voit qu'un club s'intéresse à lui, il peut liker en retour et ça crée une **discussion**.

Stack : déploiement **App Store + Play Store**, backend sur un **VPS** déjà loué, photos sur un **S3 gratuit** au début. **Pas de Docker** au début. **DB MySQL**. « Fais la meilleure stack possible. »

## Claude

Modèle d'interaction verrouillé (intérêt visible sans match, like réciproque → discussion ; distinction postuler / enregistrer / liker en retour). Stack recommandée :

- **Mobile** : React Native + Expo (TS), EAS Build, EAS Update (OTA), Expo Router, Expo Notifications.
- **Backend** : NestJS (TS), API REST versionnée, WebSockets pour le chat, JWT.
- **ORM** : Prisma sur MySQL 8.
- **Stockage** : S3-compatible → recommandation Cloudflare R2 / Backblaze B2.
- **Déploiement** : PM2 + Nginx + Certbot, MySQL sur le VPS, sans Docker.

Points supplémentaires soulevés : **mineurs** (LPD/safeguarding), **géoloc/rayon**, **nomenclature officielle**, **timing mercato**, **modération/signalement**, **multilingue**.

---

## 4. Brice

Côté club : voir directement toutes les personnes qui ont postulé, par équipe. **Compatibilité entre versions** d'app : les users ne mettent pas tous à jour en même temps, il faut éviter les soucis de compat. Il faut une app **super fluide avec des animations ultra clean** (effet WOW). Questions : que faire pour les **mineurs** ? Ne vaut-il pas mieux du **GPS + rayons** directement ? Va chercher la **structure exacte** des ligues (matchcenter AVF) et mets tout dans un **JSON**. Le **timing mercato**, ça change quoi ? Ajoute **signaler/bloquer** + interface admin. Prévois **FR/DE/IT** mais pour l'instant FR/DE, avec install dans la langue du téléphone. À la fin, tout sera donné à Claude Code, donc **aucun droit à l'erreur** ; l'**UI/UX est le point principal**.

## Claude

Livraison du JSON de nomenclature (`nomenclature_football_suisse.json`) après recherche sur le matchcenter AVF et la structure pyramidale suisse. Réponses :

- **Vue club** : dashboard par équipe (postulants + likés + statut).
- **Compat versions** : EAS Update (OTA) + API versionnée (`/api/v1`, changements additifs) + gate de version minimale.
- **UI/UX WOW** : Reanimated 3 + Gesture Handler + Moti + Lottie + Expo Image + FlashList ; style **Tamagui**.
- **Mineurs** : MVP réservé aux 16+, modèle prêt (tuteur) pour ouverture ultérieure.
- **Géoloc** : oui au GPS + rayon, mais position **approximative** (pas le GPS brut) + `canton` en parallèle.
- **Mercato** : impact surtout marketing/annonces (statut actif/expiré), mercato d'hiver cohérent.
- **Modération** : signaler/bloquer + back-office admin web séparé.
- **i18n** : FR/DE actifs (IT prévu), langue du téléphone, repli FR.

Question posée : format du doc final + niveau de détail DB → réponses : **Markdown** + **schema.prisma prêt**.

Livraison : `CADRAGE.md` + `schema.prisma`.

---

## 5. Brice

Mineurs : autorise que **année en cours − 16 ans**. Géoloc : go avec **arrondi à 1 km**, on garde canton/région pour les autres matches. Timing mercato OK. Signalement/blocage : parfait mais **pas de back-office dans le MVP** ; le client doit pouvoir signaler et bloquer avec des **motifs préremplis** + **commentaire libre** optionnel. Nomenclature validée (ligues, féminines, juniors, seniors, postes, pieds forts justes) ; régions : **AVF d'abord** mais **rester ouvert** aux autres associations. Dump de la conversation dans un fichier + dire exactement quoi faire avec Claude Code.

## Claude

Décisions intégrées :

- **Mineurs** : autorisé si `birthYear ≤ (saison − 16)` ; `isMinor = true` conservé pour les 16–17 ans.
- **Géoloc** : arrondi ~1 km avant stockage ; `canton`/région conservés.
- **Modération** : back-office retiré du MVP (post-MVP) ; signaler/bloquer côté client avec `ReportReason` (motifs préremplis) + commentaire optionnel ; signalements stockés en base.
- **Régions** : champ ouvert (pas codé en dur), extension sans changement de code.

Fichiers finaux : `AGENTS.md` (ex-`CADRAGE.md`), `schema.prisma`, `nomenclature_football_suisse.json`, ce transcript.

---

## 6. Brice

Comment contrer la baisse d'activité hors mercato ? Nouveau modèle de comptes : les clubs **font une demande** pour créer leur compte, Brice **valide**, puis les clubs peuvent créer des **comptes entraîneurs**, les **assigner à une équipe** ; le compte « club » garde une **vision globale**. Nom retenu : **footlink.ch**. Mettre à jour les fichiers (pas encore lancé Claude Code).

## Claude

- **Anti-saisonnalité** : (1) veille permanente « ouvert aux opportunités » + recherches sauvegardées/alertes (MVP) ; (2) notifs d'anticipation avant mercato ; (3) mode « renfort ponctuel / dépannage » sans fenêtre (gardien remplaçant, essais, entraîneurs) en fast-follow post-MVP — décision d'intégration au MVP en attente.
- **Comptes clubs/entraîneurs** : demande de club → validation SUPER_ADMIN → `CLUB_ADMIN` (vision globale) crée des `COACH` assignés à des équipes. Anti-fake réglé nativement. Nouveaux modèles : `ClubStatus`, `ClubMemberRole`, `CoachTeamAssignment` ; `Club.status/contactEmail/requestNote/reviewedAt`.
- **Nom** : FootLink, `footlink.ch`, bundle `ch.footlink.app`.

Fichiers mis à jour : `AGENTS.md` (canonique), `schema.prisma`.

---

## 7. Brice

Refus du « renfort ponctuel / dépannage » (un joueur licencié ne peut pas jouer pour un autre club) → **ne doit pas exister**. Un entraîneur doit pouvoir être assigné à **plusieurs équipes** et **basculer** entre elles. Validation des clubs **en base** pour l'instant. L'activité hors mercato est **repoussée** (à voir plus tard).

## Claude

Appliqué : mode « renfort ponctuel » supprimé partout ; `CoachTeamAssignment` (multi-équipes) + sélecteur d'« équipe active » documenté ; validation clubs en DB confirmée ; §13 saisonnalité repoussée hors périmètre ; recherches sauvegardées/alertes retirées du MVP.

---

## 8. Claude → Brice (permissions) & réponses

- **Messagerie côté club** : la conversation appartient à l'équipe → **seul l'entraîneur assigné** y participe.
- **CLUB_ADMIN** : supervision par défaut, avec un **toggle « vue entraîneur »** pour basculer dans n'importe quelle équipe du club et y agir comme un coach (annonces + conversations de cette équipe). Deux vues : Supervision / Entraîneur.
- Pas de changement de schéma (gardes d'accès applicatives).

---

## Décisions arrêtées (récapitulatif)

| Sujet | Décision |
|---|---|
| Nom / domaine | **FootLink** — footlink.ch — bundle `ch.footlink.app` |
| Concept | LinkedIn × Tinder, mise en relation joueurs ⇄ clubs |
| Comptes clubs | Demande → validation SUPER_ADMIN **en DB** → CLUB_ADMIN (vision globale) crée des COACH ; un COACH = plusieurs équipes + switch |
| Saisonnalité | Repoussée (hors périmètre) ; mode « renfort ponctuel » **abandonné** |
| Zone | MVP Valais (AVF) → Suisse entière ensuite |
| Business | Gratuit au lancement ; clubs payants plus tard |
| Mobile | React Native + Expo (TS), EAS Build + EAS Update |
| UI/UX | Priorité n°1 : Reanimated 3, Gesture Handler, Moti, Lottie, Expo Image, FlashList, **Tamagui** |
| Backend | NestJS (TS), API REST versionnée, WebSockets, JWT |
| DB / ORM | MySQL 8 + Prisma |
| Médias | S3-compatible (R2 / B2), URL pré-signées |
| Infra | VPS, PM2 + Nginx + Certbot, **sans Docker** |
| Interactions | Intérêt visible sans match ; postuler / enregistrer / liker en retour ; réciprocité → discussion |
| Mineurs | 16+ au MVP (`birthYear ≤ saison − 16`), modèle prêt pour ouverture |
| Géoloc | GPS arrondi ~1 km + canton/région |
| Modération | Signaler/bloquer côté client (motifs + commentaire), stockés en base ; **back-office = post-MVP** |
| i18n | FR + DE actifs (IT prévu), langue du téléphone, repli FR |
| Compat versions | OTA + API versionnée + gate version minimale |
