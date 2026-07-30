import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Pagination du feed.
 *
 * `offset` et non un curseur : l'ordre depend d'une distance CALCULEE, et un
 * curseur devrait donc encoder distance + rang + identifiant pour rester stable.
 * A l'echelle du MVP valaisan, la complexite ne se justifie pas — et le jour ou
 * elle se justifiera, le tri aura probablement change de toute facon.
 */
export class FeedQueryDto {
  /**
   * Plafonne a 50 : au-dela, la requete rapatrie plus de detail que personne ne
   * lira, et le mode swipe n'a de toute facon besoin que de quelques cartes
   * d'avance.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
