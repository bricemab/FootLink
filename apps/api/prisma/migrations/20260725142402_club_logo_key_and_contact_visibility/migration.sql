/*
  Warnings:

  - You are about to drop the column `logoUrl` on the `club` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `club` DROP COLUMN `logoUrl`,
    ADD COLUMN `logoKey` VARCHAR(191) NULL,
    ADD COLUMN `showContactEmail` BOOLEAN NOT NULL DEFAULT false;
