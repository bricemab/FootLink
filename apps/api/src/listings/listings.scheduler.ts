import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ListingsService } from './listings.service';

/**
 * Passe les annonces échues en `EXPIRED`.
 *
 * Un statut **écrit**, et non calculé à la lecture : sinon chaque endpoint
 * devrait penser à comparer `expiresAt`, et il suffirait d'un oubli pour que le
 * feed montre des annonces mortes. Une seule vérité, en base.
 *
 * ⚠️ **Pourquoi un `setInterval` et pas `@nestjs/schedule`.** Sous
 * `nodeLinker: hoisted`, `@nestjs/schedule` se résout depuis la racine du dépôt
 * alors que `@nestjs/core` vient du store `.pnpm` : deux copies de Nest, donc
 * deux `Reflector`, et le démarrage échoue sur
 * `Nest can't resolve dependencies of the SchedulerMetadataAccessor`. Même piège
 * que `@prisma/client` (cf. HANDOFF §7). Pour une tâche quotidienne unique, une
 * dépendance de plus ne valait pas ce risque.
 *
 * Le travail est **idempotent** : il ne touche que les `ACTIVE` dont l'échéance
 * est passée, donc le rejouer ne fait rien de plus. ⚠️ Si plusieurs instances
 * tournent un jour, il faudra un verrou — cette protection-là n'existe pas.
 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
/** Laisse l'application finir de démarrer avant le premier passage. */
const FIRST_RUN_DELAY_MS = 30_000;

@Injectable()
export class ListingsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ListingsScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly listings: ListingsService) {}

  onModuleInit(): void {
    // Un passage peu après le démarrage rattrape les annonces échues pendant
    // que le serveur était arrêté — sans lui, un redémarrage quotidien pourrait
    // faire qu'aucun passage n'ait jamais lieu.
    this.timer = setTimeout(() => {
      void this.run();
      this.timer = setInterval(() => void this.run(), ONE_DAY_MS);
      // `unref` : ce minuteur ne doit pas maintenir le processus en vie, sinon
      // l'API ne s'arrête plus proprement (et les tests pendent).
      this.timer.unref();
    }, FIRST_RUN_DELAY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Public : c'est ce qui rend l'expiration testable sans attendre un jour. */
  async run(): Promise<void> {
    try {
      const count = await this.listings.expireOutdated();
      if (count > 0) {
        this.logger.log(`${count} annonce(s) passée(s) en EXPIRED.`);
      }
    } catch (error) {
      // Une tâche de fond qui lève tuerait le processus : on journalise, et le
      // passage suivant rattrapera.
      this.logger.error(
        `Expiration des annonces impossible : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
