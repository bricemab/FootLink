import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { getMyClub, type MyClubResponse } from '@/api/clubs';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { Badge } from '@/ui/app-screen';
import { GlassSurface } from '@/ui/glass';
import { StadiumIcon } from '@/ui/icons';

/**
 * Bandeau de contexte de l'espace club.
 *
 * Il répond en permanence à « au nom de qui j'agis ? » — question que les
 * onglets ne peuvent pas porter, parce qu'ils désignent des **destinations**
 * alors que le club, l'équipe active et la vue sont un **contexte** : ils
 * changent le sens de tous les onglets à la fois.
 *
 * ⚠️ **Il n'affiche aujourd'hui que le club.** Le sélecteur d'équipe active et
 * la bascule Vue Supervision / Vue Entraîneur ont leur place ici, mais ils
 * n'ouvriraient sur rien tant que les écrans d'entraîneur (feed, messagerie)
 * n'existent pas — un interrupteur sans ampoule. La place leur est réservée,
 * pas occupée.
 */
export function ClubHeader(): ReactNode {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { authed } = useAuth();
  const [club, setClub] = useState<MyClubResponse | null>(null);

  const load = useCallback(async (): Promise<void> => {
    // Un échec ici ne doit rien casser : le bandeau est informatif, les écrans
    // en dessous ont chacun leur propre chargement et leur propre message.
    setClub(await authed((token) => getMyClub(token)).catch(() => null));
  }, [authed]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!club) {
    return null;
  }

  const approved = club.canOperate;

  return (
    <>
      <GlassSurface edge="bottom" intensity={32}>
        <XStack
          alignItems="center"
          gap="$3"
          paddingHorizontal="$4"
          paddingBottom="$2.5"
          // Sous la barre d'état : le bandeau va jusqu'en haut de l'écran, son
          // contenu non.
          paddingTop={insets.top + 8}
        >
          <YStack
            width={38}
            height={38}
            borderRadius={12}
            overflow="hidden"
            alignItems="center"
            justifyContent="center"
            backgroundColor="rgba(7,19,15,0.75)"
            borderWidth={1}
            borderColor="rgba(244,251,247,0.14)"
          >
            {club.logoUrl ? (
              <Image
                source={{ uri: club.logoUrl }}
                style={{ width: 38, height: 38 }}
                resizeMode="cover"
              />
            ) : (
              <StadiumIcon size={20} />
            )}
          </YStack>

          <YStack flexShrink={1} gap="$0.5">
            <Text fontSize={16} fontWeight="800" color="$brandChalk" flexShrink={1}>
              {club.club.name}
            </Text>
            <Text fontSize={12} color="$brandChalkDim" flexShrink={1}>
              {club.club.locality ?? t.clubSpace.noPitch}
            </Text>
          </YStack>

          {!approved ? <Badge label={t.clubSpace.statusPending} tone="warning" /> : null}
        </XStack>
      </GlassSurface>

      {/*
        Respiration sous le bandeau.

        Elle est POSEE ICI, pas laissee au hasard : `PitchBackdrop` ajoute
        `insets.top` a chaque ecran, alors que dans l'espace club le bandeau a
        deja consomme la barre d'etat. L'ecart qu'on voyait etait donc un
        residu, pas une intention -- et un residu ne se regle pas, il derive.

        Elle est dans ce composant et non dans le layout pour disparaitre AVEC
        le bandeau : sans club charge, `ClubHeader` rend `null`, et un espaceur
        pose a cote laisserait un trou sans rien au-dessus.
      */}
      <YStack height={18} />
    </>
  );
}
