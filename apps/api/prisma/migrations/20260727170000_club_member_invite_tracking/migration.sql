-- AlterTable
ALTER TABLE `ClubMember` ADD COLUMN `inviteSentAt` DATETIME(3) NULL,
    ADD COLUMN `inviteFailedAt` DATETIME(3) NULL;
