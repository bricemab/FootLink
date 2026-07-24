import { Injectable } from '@nestjs/common';
import { normalizeEmail } from '@footlink/shared';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Toute recherche et toute création passent par la forme normalisée de
   * l'adresse (cf. `normalizeEmail`) : `brice+foot@gmail.com` et
   * `brice@gmail.com` sont le même compte.
   *
   * La normalisation est faite **ici** et pas chez les appelants. Il y a une
   * douzaine d'endroits où une adresse entre — inscription, connexion, code à
   * 6 chiffres, mot de passe oublié, invitation entraîneur, Google — et il
   * suffirait d'en oublier un pour rouvrir la porte aux doublons. Un seul
   * point de passage, impossible à contourner par distraction.
   */
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByGoogleId(googleId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { googleId } });
  }

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({
      data: { ...data, email: normalizeEmail(data.email) },
    });
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    // L'adresse n'est modifiable nulle part au MVP, mais si elle le devient un
    // jour, elle doit suivre la même règle que la création.
    const email = typeof data.email === 'string' ? normalizeEmail(data.email) : data.email;
    return this.prisma.user.update({
      where: { id },
      data: email === undefined ? data : { ...data, email },
    });
  }
}
