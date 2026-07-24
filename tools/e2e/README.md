# Scripts de vérification end-to-end

Ces scripts tapent sur une **vraie instance** de l'API et une **vraie base**. Ils
créent leurs propres comptes sur le domaine réservé `e2e.footlink.test` et
suppriment leurs données à la fin.

## Pourquoi une instance dédiée

Les jetons email (validation d'inscription, invitation entraîneur) sont **hashés
en base** : leur version en clair n'existe que dans l'email envoyé. Pour pouvoir
les rejouer sans boîte mail réelle, l'instance de test tourne **sans SMTP** :
`MailService` bascule alors sur le transport JSON et **logue** le jeton. Le
script relit ce log.

C'est aussi ce qui évite d'envoyer de vrais emails à des adresses de test.

## Lancer la vérification de la Phase 4

Dans un terminal, l'instance de test (SMTP vide, port dédié) :

```bash
pnpm --filter @footlink/api build
```

```bash
SMTP_PASSWORD= PORT=3100 node apps/api/dist/main.js > /tmp/footlink-e2e.log 2>&1
```

> **À lancer depuis un shell POSIX (Git Bash), pas PowerShell.** `$env:SMTP_PASSWORD=''`
> ne met pas la variable à vide sous PowerShell : il la **supprime**. `apps/api/.env`
> reprend alors le dessus, le SMTP réel reste actif et de vrais emails partent vers
> les adresses de test. En sh, `SMTP_PASSWORD=` la définit bien comme chaîne vide,
> et `dotenv` ne réécrit jamais une variable déjà présente.
>
> Au démarrage, vérifier la présence de la ligne
> `SMTP non configuré : les emails seront logués (jsonTransport).` — sans elle,
> arrêter immédiatement : les emails partent pour de vrai.

Puis, dans un second terminal :

```bash
E2E_LOG=/tmp/footlink-e2e.log npx tsx tools/e2e/phase4.ts
```

## Ce que couvre `phase4.ts` (59 contrôles)

- **Blocage tant que l'email n'est pas validé** : toutes les routes authentifiées
  répondent `403` avec le code `EMAIL_NOT_VERIFIED`, sauf `GET /auth/me`,
  `POST /auth/resend-verification` et `POST /auth/logout`.
- **Garde « club non approuvé »** : ni équipe ni entraîneur avant l'approbation
  du `SUPER_ADMIN`.
- **Équipes** : création, doublon exact refusé.
- **Équipe créée avec son entraîneur** en un seul appel — et surtout :
  si l'entraîneur est refusé, **aucune équipe orpheline** ne subsiste.
- **Entraîneurs** : nom et prénom obligatoires, invitation par email, jeton à
  **usage unique**, réassignation d'équipes, retrait.
- **Isolation** : un entraîneur ne voit que ses équipes assignées, ne crée pas
  d'équipe, ne gère pas les autres entraîneurs.
- **Cloisonnement inter-clubs (anti-IDOR)** : un club ne lit, ne modifie et ne
  supprime rien qui appartienne à un autre club.
- **Suppression en cascade** : décompte exact via `deletion-impact`, refus `409`
  `TEAM_DELETION_CONFIRMATION_REQUIRED` sans `?confirm=true`, le refus portant
  le décompte à afficher dans l'alerte.
- **Page de rebond des liens d'email** : elle tente `footlink://`, prévoit le
  repli vers le store, et refuse une action inconnue.
