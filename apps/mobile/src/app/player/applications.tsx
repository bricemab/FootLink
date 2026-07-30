import { categoryLabel, posteLabel } from '@footlink/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import {
  applyToListing,
  listMyInterests,
  removeInterest,
  type InterestKind,
  type InterestListing,
} from '@/api/interactions';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { Appear } from '@/ui/appear';
import { AppScreen, Badge, Card, EmptyState } from '@/ui/app-screen';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { BookmarkIcon, CheckIcon, StadiumIcon, WarningIcon } from '@/ui/icons';
import { PrimaryButton } from '@/ui/primary-button';
import { SkeletonList } from '@/ui/skeleton';

/**
 * Ce que le joueur a envoyé, et ce qu'il garde de côté.
 *
 * 🔴 **C'est cet écran qui donne un sens à « garder ».** Le feed exclut toute
 * annonce sur laquelle on s'est prononcé : sans un endroit où les retrouver,
 * enregistrer reviendrait à faire disparaître une annonce qu'on trouvait
 * intéressante. Une fonctionnalité qui écrit sans jamais rien relire est pire
 * que son absence — on croit avoir rangé, on a jeté.
 *
 * 🔴 **C'est d'ici qu'on postule.** Le geste utile n'est pas « garder », c'est
 * « garder, comparer, choisir » : trois annonces côte à côte, au calme, puis
 * une décision. C'est ce que le paquet de cartes ne permet pas — et c'est ce
 * qui rend l'ensemble meilleur qu'un simple Tinder d'annonces.
 *
 * ⚠️ **Une annonce fermée entre-temps reste affichée**, avec un avertissement.
 * La masquer effacerait une candidature de la mémoire de celui qui l'a envoyée,
 * et il se demanderait pourquoi il n'a jamais eu de réponse.
 */
export default function PlayerApplications(): ReactNode {
  const router = useRouter();
  const { t, fill, locale } = useI18n();
  const { authed } = useAuth();

  const [tab, setTab] = useState<InterestKind>('APPLIED');
  const [items, setItems] = useState<InterestListing[]>();
  const [banner, setBanner] = useState<string>();
  /** L'annonce en cours de traitement : évite un double appui pendant l'aller-retour. */
  const [busy, setBusy] = useState<string>();

  const load = useCallback(async (): Promise<void> => {
    setBanner(undefined);
    try {
      setItems(await authed((token) => listMyInterests(token)));
    } catch (error) {
      setBanner(toUserMessage(error, t));
      setItems([]);
    }
  }, [authed, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /*
    Un seul appel pour les deux sections, filtre ici. Deux requetes auraient
    fait clignoter la liste a chaque changement d'onglet, pour des volumes qui
    tiennent largement en memoire.
  */
  const visible = (items ?? []).filter((item) => item.kind === tab);

  const withdraw = useCallback(
    async (listingId: string): Promise<void> => {
      setBusy(listingId);
      setBanner(undefined);
      try {
        await authed((token) => removeInterest(token, listingId));
        await load();
      } catch (error) {
        setBanner(toUserMessage(error, t));
      } finally {
        setBusy(undefined);
      }
    },
    [authed, load, t],
  );

  const apply = useCallback(
    async (listingId: string): Promise<void> => {
      setBusy(listingId);
      setBanner(undefined);
      try {
        const { matched } = await authed((token) => applyToListing(token, listingId));
        setTab('APPLIED');
        await load();
        /*
          ⚠️ APRES le rechargement, jamais avant : `load()` commence par vider la
          banniere, et la confirmation posee juste avant disparaissait donc sans
          avoir ete lue. Le geste marchait, mais rien ne le disait — c'est le
          genre de defaut qui fait appuyer deux fois.
        */
        setBanner(matched ? t.feed.matchDone : t.feed.appliedDone);
      } catch (error) {
        setBanner(toUserMessage(error, t));
      } finally {
        setBusy(undefined);
      }
    },
    [authed, load, t],
  );

  return (
    <AppScreen
      title={t.feed.myTitle}
      subtitle={t.feed.mySubtitle}
      allowStackBack={false}
      onRefresh={() => void load()}
    >
      {banner ? <FormBanner message={banner} /> : null}

      <SectionTabs
        value={tab}
        onChange={setTab}
        labels={{ APPLIED: t.feed.tabSent, SAVED: t.feed.tabSaved }}
        counts={{
          APPLIED: (items ?? []).filter((i) => i.kind === 'APPLIED').length,
          SAVED: (items ?? []).filter((i) => i.kind === 'SAVED').length,
        }}
      />

      {items === undefined ? <SkeletonList count={2} /> : null}

      {items !== undefined && visible.length === 0 && !banner ? (
        <EmptyState
          text={tab === 'APPLIED' ? t.feed.sentEmpty : t.feed.savedEmpty}
          action={
            <PrimaryButton
              label={t.feed.title}
              variant="ghost"
              onPress={() => router.push('/player')}
            />
          }
        />
      ) : null}

      {visible.map((item, index) => (
        <Appear key={item.id} index={index}>
          <Card variant={item.matched ? 'hero' : 'card'}>
            <XStack alignItems="center" justifyContent="space-between" gap="$3">
              <Text fontSize={18} fontWeight="800" color="$brandChalk" flexShrink={1}>
                {posteLabel(item.posteRecherche, locale)}
              </Text>
              {item.matched ? (
                <Badge label={t.feed.matched} tone="accent" />
              ) : item.kind === 'SAVED' ? (
                <BookmarkIcon size={20} filled />
              ) : (
                <CheckIcon size={20} />
              )}
            </XStack>

            <XStack alignItems="center" gap="$2.5">
              <StadiumIcon size={18} />
              <Text fontSize={15} fontWeight="700" color="$brandChalk" flexShrink={1}>
                {item.club.name}
              </Text>
            </XStack>

            <XStack gap="$2.5" flexWrap="wrap" alignItems="center">
              <Text fontSize={13.5} fontWeight="700" color="$brandPitchBright">
                {item.team.name ?? categoryLabel(item.team.category, locale)}
              </Text>
              <Text fontSize={13.5} color="$brandChalkDim">
                {fill(t.feed.distance, { km: String(item.distanceKm) })}
              </Text>
              {item.club.locality ? (
                <Text fontSize={13.5} color="$brandChalkDim">
                  {item.club.locality}
                </Text>
              ) : null}
            </XStack>

            {/* L'annonce a pu fermer depuis. Le dire evite d'attendre une
                reponse qui ne viendra pas. */}
            {item.status !== 'ACTIVE' ? (
              <XStack alignItems="center" gap="$2">
                <WarningIcon size={16} />
                <Text fontSize={13.5} color="#FFC14D" flexShrink={1}>
                  {t.feed.closedListing}
                </Text>
              </XStack>
            ) : null}

            {item.description ? (
              <Text fontSize={14.5} lineHeight={21} color="$brandChalkDim" numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}

            {/*
              ⚠️ Aucune action quand un match existe : le retrait est refuse par
              le serveur (une conversation peut etre ouverte en face). Afficher
              un bouton qui repondra 409 serait un piege.
            */}
            {!item.matched ? (
              <XStack gap="$2.5" alignItems="center">
                {item.kind === 'SAVED' && item.status === 'ACTIVE' ? (
                  <YStack flex={1}>
                    <PrimaryButton
                      label={t.feed.applyNow}
                      loading={busy === item.id}
                      onPress={() => void apply(item.id)}
                    />
                  </YStack>
                ) : null}
                <YStack flex={item.kind === 'SAVED' ? 0 : 1}>
                  <PrimaryButton
                    label={item.kind === 'SAVED' ? t.feed.forget : t.feed.withdraw}
                    variant="ghost"
                    loading={busy === item.id}
                    onPress={() => void withdraw(item.id)}
                  />
                </YStack>
              </XStack>
            ) : null}
          </Card>
        </Appear>
      ))}
    </AppScreen>
  );
}

/**
 * La bascule entre les deux sections.
 *
 * Le compte est DANS l'onglet : « Gardées 3 » dit d'un coup d'œil qu'il y a
 * quelque chose à y voir. Sans lui, on ouvre la section pour découvrir qu'elle
 * est vide — et on n'y retourne plus.
 */
function SectionTabs({
  value,
  onChange,
  labels,
  counts,
}: {
  value: InterestKind;
  onChange: (next: InterestKind) => void;
  labels: Record<InterestKind, string>;
  counts: Record<InterestKind, number>;
}): ReactNode {
  return (
    <XStack
      borderRadius={999}
      overflow="hidden"
      borderWidth={1.5}
      borderColor="rgba(244,251,247,0.16)"
      alignSelf="flex-start"
    >
      {(['APPLIED', 'SAVED'] as const).map((kind) => {
        const active = value === kind;
        return (
          <Pressable
            key={kind}
            onPress={() => onChange(kind)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <XStack
              paddingHorizontal="$3.5"
              paddingVertical="$2"
              gap="$2"
              alignItems="center"
              backgroundColor={active ? 'rgba(57,255,136,0.18)' : 'transparent'}
            >
              <Text
                fontSize={13.5}
                fontWeight="700"
                color={active ? '$brandPitchBright' : '$brandChalkDim'}
              >
                {labels[kind]}
              </Text>
              {counts[kind] > 0 ? (
                <Text
                  fontSize={12.5}
                  fontWeight="800"
                  color={active ? '$brandPitchBright' : '$brandChalkDim'}
                >
                  {counts[kind]}
                </Text>
              ) : null}
            </XStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}
