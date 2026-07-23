-- AlterTable
ALTER TABLE `playerprofile` ADD COLUMN `currentClubId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `PlayerProfile_currentClubId_idx` ON `PlayerProfile`(`currentClubId`);

-- AddForeignKey
ALTER TABLE `PlayerProfile` ADD CONSTRAINT `PlayerProfile_currentClubId_fkey` FOREIGN KEY (`currentClubId`) REFERENCES `Club`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
