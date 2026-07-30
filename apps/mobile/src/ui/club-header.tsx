import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { getMyClub, type MyClubResponse } from '@/api/clubs';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AppImage } from '@/ui/app-image';
import { Badge } from '@/ui/app-screen';
import { GlassSurface, glassSupport } from '@/ui/glass';
import { StadiumIcon } from '@/ui/icons';
import { Skeleton } from '@/ui/skeleton';
import { TYPE } from '@/ui/type-scale';

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
 *
 * 🔴 **Le bandeau occupe sa place AVANT de connaître le club, et c'est le
 * point important.** Il rendait `null` pendant le chargement : comme c'est lui
 * qui absorbe la barre d'état (`insets.top`), l'écran du dessous remontait
 * alors sous l'horloge, puis redescendait d'un coup à l'arrivée des données.
 * Observé sur un démarrage à froid — deux défauts pour une seule cause, une
 * hauteur qui apparaît après coup. Le cadre est donc toujours rendu ; seul son
 * contenu attend.
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

  const approved = club?.canOperate ?? true;

  return (
    <>
      {/*
        `edge="none"` : aucun liseré sous le bandeau. Il en portait un, pour
        « poser » le verre — mais il tranchait une ligne nette en travers du
        décor, exactement ce qu'on venait de faire disparaître en rendant le
        bandeau translucide. C'est l'espacement qui sépare, pas un trait.
      */}
      <GlassSurface edge="none" intensity={32}>
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
            {club?.logoUrl ? <AppImage uri={club.logoUrl} size={38} /> : <StadiumIcon size={20} />}
          </YStack>

          {club ? (
            <YStack flexShrink={1} gap="$0.5">
              <Text {...TYPE.heading} color="$brandChalk" flexShrink={1}>
                {club.club.name}
              </Text>
              <Text {...TYPE.label} color="$brandChalkDim" flexShrink={1}>
                {club.club.locality ?? t.clubSpace.noPitch}
              </Text>
            </YStack>
          ) : (
            /*
              La silhouette occupe EXACTEMENT la place des deux lignes reelles :
              c'est ce qui evite le saut au moment ou le club arrive.
            */
            <YStack flexShrink={1} gap="$1.5" width={150}>
              <Skeleton height={14} width="80%" />
              <Skeleton height={11} width="50%" />
            </YStack>
          )}

          {!approved ? <Badge label={t.clubSpace.statusPending} tone="warning" /> : null}
          <GlassProbe />
        </XStack>
      </GlassSurface>

      {/*
        Respiration sous le bandeau.

        Elle est POSEE ICI, pas laissee au hasard : `PitchBackdrop` ajoute
        `insets.top` a chaque ecran, alors que dans l'espace club le bandeau a
        deja consomme la barre d'etat. L'ecart qu'on voyait etait donc un
        residu, pas une intention -- et un residu ne se regle pas, il derive.

        Elle est dans ce composant et non dans le layout parce qu'elle
        appartient au bandeau : les deux vont ensemble, on ne peut pas en
        deplacer un sans l'autre.
      */}
      <YStack height={18} />
    </>
  );
}

/**
 * ⚠️ **Relevé temporaire, à retirer.** Il dit lequel des deux garde-fous du
 * Liquid Glass refuse, sur l'appareil de Brice — impossible à savoir d'ici, et
 * deviner aurait coûté plusieurs allers-retours.
 *
 * Lecture : `LG` = `isLiquidGlassAvailable()` (l'app adopte le design iOS 26),
 * `API` = `isGlassEffectAPIAvailable()` (l'API existe vraiment à l'exécution).
 * `-/-` sur Android, c'est normal : le paquet est iOS seulement.
 *
 * Sous `__DEV__` : jamais visible dans un build de production.
 */
function GlassProbe(): ReactNode {
  if (!__DEV__) {
    return null;
  }
  const { liquid, api } = glassSupport();
  return (
    <Text fontSize={10} fontWeight="700" color={liquid && api ? '$brandPitchBright' : '#FFC14D'}>
      {`LG ${liquid ? 'ok' : 'non'} / API ${api ? 'ok' : 'non'}`}
    </Text>
  );
}
