import { Body, Controller, Patch } from '@nestjs/common';
import { Locale } from '@prisma/client';
import { AllowUnverified } from '../common/decorators/allow-unverified.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateMyLocaleDto } from './dto/update-me.dto';
import { UsersService } from './users.service';

@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * Langue de l'utilisateur. C'est elle qui décide de la langue des **emails**
   * et des notifications push : sans persistance, un utilisateur passé en
   * allemand continuerait de recevoir ses emails en français.
   *
   * Accessible sans email validé : on change de langue précisément quand on ne
   * comprend pas l'écran de validation.
   */
  @AllowUnverified()
  @Patch('me/locale')
  async updateLocale(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateMyLocaleDto,
  ): Promise<{ locale: Locale }> {
    const user = await this.users.update(userId, { locale: dto.locale });
    return { locale: user.locale };
  }
}
