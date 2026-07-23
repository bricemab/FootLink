-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NULL,
    `googleId` VARCHAR(191) NULL,
    `role` ENUM('PLAYER', 'CLUB_ADMIN', 'COACH', 'SUPER_ADMIN') NOT NULL DEFAULT 'PLAYER',
    `status` ENUM('ACTIVE', 'SUSPENDED', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
    `locale` ENUM('FR', 'DE', 'IT') NOT NULL DEFAULT 'FR',
    `pushToken` VARCHAR(191) NULL,
    `emailVerifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_googleId_key`(`googleId`),
    INDEX `User_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RefreshToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,

    INDEX `RefreshToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Token` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('EMAIL_VERIFY', 'PASSWORD_RESET', 'COACH_INVITE') NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Token_tokenHash_key`(`tokenHash`),
    INDEX `Token_userId_idx`(`userId`),
    INDEX `Token_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlayerProfile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `birthYear` INTEGER NOT NULL,
    `gender` ENUM('MALE', 'FEMALE') NOT NULL DEFAULT 'MALE',
    `isMinor` BOOLEAN NOT NULL DEFAULT false,
    `guardianName` VARCHAR(191) NULL,
    `guardianEmail` VARCHAR(191) NULL,
    `heightCm` INTEGER NULL,
    `strongFoot` ENUM('DROIT', 'GAUCHE', 'AMBIDEXTRE') NULL,
    `bio` TEXT NULL,
    `avatarUrl` VARCHAR(191) NULL,
    `currentCategory` ENUM('PREMIERE_LIGUE', 'DEUXIEME_LIGUE_INTER', 'DEUXIEME_LIGUE', 'TROISIEME_LIGUE', 'QUATRIEME_LIGUE', 'CINQUIEME_LIGUE', 'JUNIORS_A', 'JUNIORS_B', 'JUNIORS_C', 'JUNIORS_D', 'JUNIORS_E', 'JUNIORS_F', 'JUNIORS_G', 'SENIORS_30', 'SENIORS_40', 'SENIORS_50', 'PREMIERE_LIGUE_F', 'DEUXIEME_LIGUE_F', 'TROISIEME_LIGUE_F', 'QUATRIEME_LIGUE_F') NULL,
    `currentClubName` VARCHAR(191) NULL,
    `hideCurrentClub` BOOLEAN NOT NULL DEFAULT false,
    `canton` VARCHAR(191) NULL,
    `locality` VARCHAR(191) NULL,
    `lat` DECIMAL(9, 6) NULL,
    `lng` DECIMAL(9, 6) NULL,
    `isSeekingClub` BOOLEAN NOT NULL DEFAULT true,
    `isVisible` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PlayerProfile_userId_key`(`userId`),
    INDEX `PlayerProfile_currentCategory_idx`(`currentCategory`),
    INDEX `PlayerProfile_canton_idx`(`canton`),
    INDEX `PlayerProfile_isSeekingClub_isVisible_idx`(`isSeekingClub`, `isVisible`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlayerPosition` (
    `id` VARCHAR(191) NOT NULL,
    `playerId` VARCHAR(191) NOT NULL,
    `poste` ENUM('GARDIEN', 'DEFENSEUR_CENTRAL', 'LATERAL_DROIT', 'LATERAL_GAUCHE', 'MILIEU_DEFENSIF', 'MILIEU_CENTRAL', 'MILIEU_OFFENSIF', 'AILIER_DROIT', 'AILIER_GAUCHE', 'ATTAQUANT') NOT NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,

    INDEX `PlayerPosition_poste_idx`(`poste`),
    UNIQUE INDEX `PlayerPosition_playerId_poste_key`(`playerId`, `poste`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Region` (
    `code` VARCHAR(191) NOT NULL,
    `labelFr` VARCHAR(191) NOT NULL,
    `labelDe` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Club` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED') NOT NULL DEFAULT 'PENDING',
    `contactEmail` VARCHAR(191) NULL,
    `requestNote` TEXT NULL,
    `reviewedAt` DATETIME(3) NULL,
    `regionCode` VARCHAR(191) NULL,
    `canton` VARCHAR(191) NULL,
    `locality` VARCHAR(191) NULL,
    `lat` DECIMAL(9, 6) NULL,
    `lng` DECIMAL(9, 6) NULL,
    `logoUrl` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Club_canton_idx`(`canton`),
    INDEX `Club_regionCode_idx`(`regionCode`),
    INDEX `Club_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClubMember` (
    `id` VARCHAR(191) NOT NULL,
    `clubId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` ENUM('CLUB_ADMIN', 'COACH') NOT NULL DEFAULT 'COACH',
    `isOwner` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `ClubMember_clubId_userId_key`(`clubId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Team` (
    `id` VARCHAR(191) NOT NULL,
    `clubId` VARCHAR(191) NOT NULL,
    `category` ENUM('PREMIERE_LIGUE', 'DEUXIEME_LIGUE_INTER', 'DEUXIEME_LIGUE', 'TROISIEME_LIGUE', 'QUATRIEME_LIGUE', 'CINQUIEME_LIGUE', 'JUNIORS_A', 'JUNIORS_B', 'JUNIORS_C', 'JUNIORS_D', 'JUNIORS_E', 'JUNIORS_F', 'JUNIORS_G', 'SENIORS_30', 'SENIORS_40', 'SENIORS_50', 'PREMIERE_LIGUE_F', 'DEUXIEME_LIGUE_F', 'TROISIEME_LIGUE_F', 'QUATRIEME_LIGUE_F') NOT NULL,
    `gender` ENUM('MALE', 'FEMALE') NOT NULL DEFAULT 'MALE',
    `name` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Team_clubId_idx`(`clubId`),
    INDEX `Team_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CoachTeamAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `clubMemberId` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CoachTeamAssignment_teamId_idx`(`teamId`),
    UNIQUE INDEX `CoachTeamAssignment_clubMemberId_teamId_key`(`clubMemberId`, `teamId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Listing` (
    `id` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `posteRecherche` ENUM('GARDIEN', 'DEFENSEUR_CENTRAL', 'LATERAL_DROIT', 'LATERAL_GAUCHE', 'MILIEU_DEFENSIF', 'MILIEU_CENTRAL', 'MILIEU_OFFENSIF', 'AILIER_DROIT', 'AILIER_GAUCHE', 'ATTAQUANT') NOT NULL,
    `secondaryPostes` JSON NULL,
    `description` TEXT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'EXPIRED', 'CLOSED') NOT NULL DEFAULT 'ACTIVE',
    `season` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NULL,

    INDEX `Listing_status_idx`(`status`),
    INDEX `Listing_posteRecherche_idx`(`posteRecherche`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlayerInterest` (
    `id` VARCHAR(191) NOT NULL,
    `playerId` VARCHAR(191) NOT NULL,
    `listingId` VARCHAR(191) NOT NULL,
    `kind` ENUM('APPLIED', 'SAVED') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PlayerInterest_listingId_idx`(`listingId`),
    UNIQUE INDEX `PlayerInterest_playerId_listingId_key`(`playerId`, `listingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClubInterest` (
    `id` VARCHAR(191) NOT NULL,
    `listingId` VARCHAR(191) NOT NULL,
    `playerId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ClubInterest_playerId_idx`(`playerId`),
    UNIQUE INDEX `ClubInterest_listingId_playerId_key`(`listingId`, `playerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Match` (
    `id` VARCHAR(191) NOT NULL,
    `listingId` VARCHAR(191) NOT NULL,
    `playerId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Match_playerId_idx`(`playerId`),
    UNIQUE INDEX `Match_listingId_playerId_key`(`listingId`, `playerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Conversation` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Conversation_matchId_key`(`matchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConversationRead` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `lastReadAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ConversationRead_userId_idx`(`userId`),
    UNIQUE INDEX `ConversationRead_conversationId_userId_key`(`conversationId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Message` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `senderUserId` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Message_conversationId_idx`(`conversationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('CLUB_INTEREST', 'APPLICATION', 'MATCH', 'MESSAGE', 'CLUB_APPROVED', 'CLUB_REJECTED') NOT NULL,
    `data` JSON NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_readAt_idx`(`userId`, `readAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Report` (
    `id` VARCHAR(191) NOT NULL,
    `reporterUserId` VARCHAR(191) NOT NULL,
    `reportedUserId` VARCHAR(191) NOT NULL,
    `reason` ENUM('FAKE_PROFILE', 'HARASSMENT', 'INAPPROPRIATE_BEHAVIOR', 'OFFENSIVE_CONTENT', 'SPAM', 'SCAM', 'OTHER') NOT NULL,
    `comment` TEXT NULL,
    `status` ENUM('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED') NOT NULL DEFAULT 'OPEN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Report_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Block` (
    `id` VARCHAR(191) NOT NULL,
    `blockerUserId` VARCHAR(191) NOT NULL,
    `blockedUserId` VARCHAR(191) NOT NULL,
    `reason` ENUM('FAKE_PROFILE', 'HARASSMENT', 'INAPPROPRIATE_BEHAVIOR', 'OFFENSIVE_CONTENT', 'SPAM', 'SCAM', 'OTHER') NULL,
    `comment` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Block_blockerUserId_blockedUserId_key`(`blockerUserId`, `blockedUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Token` ADD CONSTRAINT `Token_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerProfile` ADD CONSTRAINT `PlayerProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerPosition` ADD CONSTRAINT `PlayerPosition_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `PlayerProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Club` ADD CONSTRAINT `Club_regionCode_fkey` FOREIGN KEY (`regionCode`) REFERENCES `Region`(`code`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClubMember` ADD CONSTRAINT `ClubMember_clubId_fkey` FOREIGN KEY (`clubId`) REFERENCES `Club`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClubMember` ADD CONSTRAINT `ClubMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Team` ADD CONSTRAINT `Team_clubId_fkey` FOREIGN KEY (`clubId`) REFERENCES `Club`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoachTeamAssignment` ADD CONSTRAINT `CoachTeamAssignment_clubMemberId_fkey` FOREIGN KEY (`clubMemberId`) REFERENCES `ClubMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoachTeamAssignment` ADD CONSTRAINT `CoachTeamAssignment_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Listing` ADD CONSTRAINT `Listing_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerInterest` ADD CONSTRAINT `PlayerInterest_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `PlayerProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerInterest` ADD CONSTRAINT `PlayerInterest_listingId_fkey` FOREIGN KEY (`listingId`) REFERENCES `Listing`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClubInterest` ADD CONSTRAINT `ClubInterest_listingId_fkey` FOREIGN KEY (`listingId`) REFERENCES `Listing`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClubInterest` ADD CONSTRAINT `ClubInterest_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `PlayerProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Match` ADD CONSTRAINT `Match_listingId_fkey` FOREIGN KEY (`listingId`) REFERENCES `Listing`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Match` ADD CONSTRAINT `Match_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `PlayerProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConversationRead` ADD CONSTRAINT `ConversationRead_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConversationRead` ADD CONSTRAINT `ConversationRead_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_senderUserId_fkey` FOREIGN KEY (`senderUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Report` ADD CONSTRAINT `Report_reporterUserId_fkey` FOREIGN KEY (`reporterUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Report` ADD CONSTRAINT `Report_reportedUserId_fkey` FOREIGN KEY (`reportedUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Block` ADD CONSTRAINT `Block_blockerUserId_fkey` FOREIGN KEY (`blockerUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Block` ADD CONSTRAINT `Block_blockedUserId_fkey` FOREIGN KEY (`blockedUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
