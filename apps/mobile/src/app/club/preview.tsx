import { categoryLabel, regionForCanton } from '@footlink/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { getMyClub, type MyClubResponse } from '@/api/clubs';
import { listMyTeams, type Team } from '@/api/teams';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AppScreen, Badge, Card, EmptyState } from '@/ui/app-screen';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { StadiumIcon } from '@/ui/icons';

/**
 * La fiche du club telle qu'un joueur la verra.
 *
 * Sert à vérifier sa configuration sans avoir à créer un compte joueur pour
 * regarder. La règle de cet écran : **n'afficher que ce qui sera public**.
 *
 * Deux conséquences à ne pas contourner :
 *
 * - l'email de contact n'apparaît que si le club a coché de l'afficher
 *   (`showContactEmail`). C'est tout l'intérêt de l'aperçu : voir que le
 *   masquage fonctionne vraiment ;
 * - rien de la gestion interne — ni statut de validation en tant qu'information
 *   du club, ni entraîneurs, ni compteurs. Un joueur ne voit pas ça.
 *
 * Les données viennent des mêmes endpoints que les autres onglets, donc l'aperçu
 * ne peut pas montrer autre chose que ce qui est enregistré.
 */
export default function ClubPreview(): ReactNode {
  const { t, locale } = useI18n();
  const { authed } = useAuth();

  const [club, setClub] = useState<MyClubResponse | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [banner, setBanner] = useState<string>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setBanner(undefined);
    try {
      const mine = await authed((token) => getMyClub(token));
      setClub(mine);
      // Les équipes ne sont lisibles qu'une fois le club approuvé : inutile de
      // provoquer un 403 pour un aperçu.
      setTeams(mine?.canOperate === true ? await authed((token) => listMyTeams(token)) : []);
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setLoading(false);
    }
  }, [authed, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const region = club?.club.regionCode ?? regionForCanton(club?.club.canton ?? '');
  const place = club?.club.locality
    ? club.club.canton
      ? `${club.club.locality} (${club.club.canton})`
      : club.club.locality
    : null;

  return (
    <AppScreen
      title={t.clubSpace.previewTitle}
      subtitle={t.clubSpace.previewSubtitle}
      allowStackBack={false}
      onRefresh={() => void load()}
      refreshing={loading}
    >
      {banner ? <FormBanner message={banner} /> : null}

      {loading && !club ? (
        <YStack paddingVertical="$6" alignItems="center">
          <ActivityIndicator color="#39FF88" />
        </YStack>
      ) : null}

      {/* Un club non validé n'est visible de personne : le dire ici évite de
          croire que la fiche est en ligne. */}
      {club && club.canOperate !== true ? (
        <FormBanner message={t.clubSpace.previewPending} />
      ) : null}

      {club ? (
        <>
          <Card accent>
            <XStack alignItems="center" gap="$3.5">
              <YStack
                width={64}
                height={64}
                borderRadius={16}
                overflow="hidden"
                alignItems="center"
                justifyContent="center"
                backgroundColor="rgba(7,19,15,0.7)"
                borderWidth={1}
                borderColor="rgba(244,251,247,0.14)"
              >
                {club.logoUrl ? (
                  <Image
                    source={{ uri: club.logoUrl }}
                    style={{ width: 64, height: 64 }}
                    resizeMode="cover"
                  />
                ) : (
                  <StadiumIcon size={26} />
                )}
              </YStack>
              <YStack gap="$1" flexShrink={1}>
                <Text fontSize={22} fontWeight="800" color="$brandChalk" flexShrink={1}>
                  {club.club.name}
                </Text>
                <XStack gap="$2" alignItems="center" flexWrap="wrap">
                  {place ? (
                    <Text fontSize={14} color="$brandChalkDim">
                      {place}
                    </Text>
                  ) : null}
                  {region ? <Badge label={region} /> : null}
                </XStack>
              </YStack>
            </XStack>

            <Text
              fontSize={14.5}
              lineHeight={21}
              color={club.club.description ? '$brandChalk' : '$brandChalkDim'}
            >
              {club.club.description ?? t.clubSpace.previewNoDescription}
            </Text>

            {club.club.stadiumName ? (
              <XStack alignItems="center" gap="$2.5">
                <StadiumIcon size={18} />
                <Text fontSize={14} color="$brandChalkDim" flexShrink={1}>
                  {club.club.stadiumName}
                </Text>
              </XStack>
            ) : null}

            {club.club.websiteUrl ? (
              <Text fontSize={14} color="$brandPitchBright">
                {club.club.websiteUrl}
              </Text>
            ) : null}

            {/* Le masquage se vérifie ICI : rien ne s'affiche si le club n'a pas
                choisi d'exposer son adresse. */}
            {club.club.showContactEmail && club.club.contactEmail ? (
              <Text fontSize={14} color="$brandChalk">
                {club.club.contactEmail}
              </Text>
            ) : null}
          </Card>

          <Text fontSize={12.5} fontWeight="700" letterSpacing={0.6} color="$brandChalkDim">
            {t.clubSpace.previewTeamsTitle.toUpperCase()}
          </Text>

          {teams.length === 0 ? <EmptyState text={t.clubSpace.previewNoTeams} /> : null}

          {teams.map((team) => (
            <Card key={team.id}>
              <Text fontSize={16} fontWeight="700" color="$brandChalk">
                {team.name ?? categoryLabel(team.category, locale)}
              </Text>
              {team.name ? (
                <Text fontSize={13.5} color="$brandChalkDim">
                  {categoryLabel(team.category, locale)}
                </Text>
              ) : null}
            </Card>
          ))}
        </>
      ) : null}
    </AppScreen>
  );
}
