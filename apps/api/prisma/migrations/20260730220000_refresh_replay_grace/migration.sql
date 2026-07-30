-- Distingue un rejeu frauduleux d'une reponse de rotation perdue en route.
-- Voir le commentaire du champ dans schema.prisma.
ALTER TABLE `RefreshToken` ADD COLUMN `replacedById` VARCHAR(191) NULL;
