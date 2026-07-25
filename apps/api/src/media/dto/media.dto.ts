import { IsIn, IsString, MaxLength } from 'class-validator';

/** Types acceptés, alignés sur `ALLOWED_CONTENT_TYPES` du service. */
export class AvatarUploadUrlDto {
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType!: string;
}

export class ConfirmAvatarDto {
  // La clé vient du billet émis par le serveur. Le service revérifie qu'elle
  // appartient bien à l'appelant : cette validation ne fait que borner l'entrée.
  @IsString()
  @MaxLength(200)
  key!: string;
}
