import { Body, Controller, Delete, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AvatarUploadUrlDto, ConfirmAvatarDto } from './dto/media.dto';
import { MediaService, type UploadTicket } from './media.service';

/**
 * Photo de la personne (`User.avatarKey`).
 *
 * Le téléversement se fait en deux temps, et ce n'est pas une complication
 * gratuite : une URL pré-signée ne peut pas plafonner la taille d'un fichier.
 * On signe d'abord, puis on vérifie l'objet réellement déposé — c'est le seul
 * moment où le serveur peut refuser une image de 200 Mo.
 *
 * Tout est authentifié, et l'identifiant vient **du token** : un appelant ne
 * peut agir que sur son propre avatar (anti-IDOR, AGENTS §10).
 */
@Controller({ path: 'media', version: '1' })
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly prisma: PrismaService,
  ) {}

  // Débit serré : chaque appel signe un accès en écriture au bucket.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('avatar/upload-url')
  createUploadUrl(
    @CurrentUser('userId') userId: string,
    @Body() dto: AvatarUploadUrlDto,
  ): Promise<UploadTicket> {
    return this.media.createAvatarUpload(userId, dto.contentType);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('avatar/confirm')
  async confirm(
    @CurrentUser('userId') userId: string,
    @Body() dto: ConfirmAvatarDto,
  ): Promise<{ avatarUrl: string | null }> {
    await this.media.confirmAvatarUpload(userId, dto.key);

    // L'ancienne photo devient orpheline : on la supprime pour ne pas garder de
    // données dont plus personne ne se sert (minimisation, LPD).
    const previous = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarKey: true },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { avatarKey: dto.key } });
    if (previous.avatarKey && previous.avatarKey !== dto.key) {
      await this.media.delete(previous.avatarKey);
    }

    return { avatarUrl: await this.media.readUrl(dto.key) };
  }

  @Delete('avatar')
  async remove(@CurrentUser('userId') userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarKey: true },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { avatarKey: null } });
    await this.media.delete(user.avatarKey);
  }
}
