# FootLink

Mise en relation **joueurs amateurs ⇄ clubs** de football suisse (LinkedIn × Tinder). MVP Valais (AVF) → Suisse entière.

> **Docs de référence** : [`AGENTS.md`](./AGENTS.md) (spec), [`CLAUDE.md`](./CLAUDE.md) (règles ultra-importantes), [`apps/api/prisma/schema.prisma`](./apps/api/prisma/schema.prisma) (modèle de données), [`nomenclature_football_suisse.json`](./nomenclature_football_suisse.json) (données de réf.).

## Monorepo

| Chemin | Rôle |
|---|---|
| `apps/api` | Backend **NestJS + Prisma / MySQL 8** (API REST `/api/v1` + WebSocket) |
| `apps/mobile` | App **Expo React Native + TypeScript** *(à venir)* |
| `packages/shared` | Types partagés, enums miroir, helpers nomenclature |
| `apps/admin` | Back-office web — **POST-MVP, non créé** |

## Prérequis

- Node ≥ 20 (testé sur 24), **pnpm 10**, **MySQL 8** en local.

## Démarrage backend

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # puis renseigner DATABASE_URL
pnpm db:migrate                          # crée la base + applique les migrations
pnpm db:seed                             # seed des régions (AVF)
pnpm api:dev                             # http://localhost:3000/api/v1
```

Vérifs : `GET /api/v1/health` · `GET /api/v1/app/config`.
