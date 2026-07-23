import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface RegionItem {
  code: string;
  label_fr: string;
  actif: boolean;
}

interface Nomenclature {
  regions_associations: { items: RegionItem[] };
}

// Seed des données de référence. Au MVP : uniquement la table Region
// (les catégories/postes/pieds forts sont des enums Prisma, pas des tables).
// Source : nomenclature_football_suisse.json (racine du repo).
async function main(): Promise<void> {
  const jsonPath = join(__dirname, '../../../nomenclature_football_suisse.json');
  const nomenclature = JSON.parse(readFileSync(jsonPath, 'utf-8')) as Nomenclature;
  const regions = nomenclature.regions_associations.items;

  for (const region of regions) {
    await prisma.region.upsert({
      where: { code: region.code },
      update: { labelFr: region.label_fr, active: region.actif },
      // TODO: labels DE réels (le JSON ne fournit que label_fr pour les régions).
      create: {
        code: region.code,
        labelFr: region.label_fr,
        labelDe: region.label_fr,
        active: region.actif,
      },
    });
  }

  const active = regions.filter((r) => r.actif).map((r) => r.code);
  console.log(`Seed OK : ${regions.length} régions (actives : ${active.join(', ') || 'aucune'}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
