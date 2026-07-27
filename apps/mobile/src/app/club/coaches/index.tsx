import { categoryLabel } from '@footlink/shared';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import {
  listCoaches,
  removeCoach,
  resendCoachInvite,
  setCoachTeams,
  type Coach,
} from '@/api/coaches';
import { listMyTeams, type Team } from '@/api/teams';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AppScreen, Badge, Card, EmptyState } from '@/ui/app-screen';
import { CheckIcon } from '@/ui/icons';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { PrimaryButton } from '@/ui/primary-button';

/**
 * Comptes entraîneurs du club.
 *
 * Trois actions par entraîneur : renvoyer son code, changer ses équipes, le
 * retirer. Les équipes se règlent ici plutôt que sur un écran séparé — c'est un
 * simple jeu de cases, et un aller-retour de plus pour cocher deux équipes
 * n'apporterait rien.
 *
 * ⚠️ `setCoachTeams` **remplace** l'ensemble des assignations : l'écran envoie
 * donc l'état complet voulu, jamais un ajout.
 */
/**
 * Duree d'affichage de « nouveau code envoye » avant que le bouton revienne.
 *
 * Assez pour etre lu, assez court pour ne pas bloquer un second renvoi
 * legitime — l'email precedent a pu se perdre.
 */
const CONFIRMATION_MS = 3000;

export default function CoachesList(): ReactNode {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { authed } = useAuth();

  const [coaches, setCoaches] = useState<Coach[]>();
  const [teams, setTeams] = useState<Team[]>([]);
  const [editing, setEditing] = useState<string>();
  const [removing, setRemoving] = useState<string>();
  /**
   * Entraineur dont le code part en ce moment, et celui dont le code vient de
   * partir.
   *
   * Un simple message en haut de liste ne disait pas DE QUI il parlait, et il
   * apparaissait loin du bouton qu'on venait d'appuyer : on ne savait pas si
   * l'appui avait ete pris en compte. Le retour se joue donc sur la carte
   * concernee.
   */
  const [sending, setSending] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  // Verrou synchrone contre le double appui : voir `toggleTeam`.
  const togglingRef = useRef(false);
  const confirmationTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Le minuteur ne doit pas survivre a l'ecran.
  useEffect(
    () => () => {
      if (confirmationTimer.current !== undefined) {
        clearTimeout(confirmationTimer.current);
      }
    },
    [],
  );

  const load = useCallback(async (): Promise<void> => {
    setBanner(undefined);
    setLoading(true);
    try {
      const [list, clubTeams] = await Promise.all([
        authed((token) => listCoaches(token)),
        authed((token) => listMyTeams(token)),
      ]);
      setCoaches(list);
      setTeams(clubTeams);
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setLoading(false);
    }
  }, [authed, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (run: () => Promise<void>): Promise<void> => {
    setBanner(undefined);
    setBusy(true);
    try {
      await run();
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Renvoie un code d'activation.
   *
   * La confirmation reste affichee : rien ne la remplace tant que la liste n'est
   * pas rechargee. Une confirmation qui s'efface d'elle-meme au bout de quelques
   * secondes laisse un doute a qui a regarde ailleurs.
   */
  /**
   * Renvoi du code.
   *
   * La confirmation s'efface d'elle-meme apres CONFIRMATION_MS et le bouton
   * revient : une coche qui reste indefiniment laisse croire que l'action est
   * terminee pour de bon, alors qu'un renvoi peut legitimement etre repete.
   *
   * ⚠️ Le minuteur est garde dans un `ref` et annule avant d'en armer un autre :
   * deux renvois rapproches laisseraient sinon le premier minuteur effacer la
   * confirmation du second. Il est aussi annule au demontage — sans quoi il
   * appellerait `setState` sur un ecran qui n'existe plus.
   */
  const resend = (coach: Coach): void => {
    setSentTo(undefined);
    if (confirmationTimer.current !== undefined) {
      clearTimeout(confirmationTimer.current);
    }
    setSending(coach.clubMemberId);
    void act(async () => {
      try {
        await authed((token) => resendCoachInvite(token, coach.clubMemberId));
        setSentTo(coach.clubMemberId);
        confirmationTimer.current = setTimeout(() => setSentTo(undefined), CONFIRMATION_MS);
      } finally {
        setSending(undefined);
      }
    });
  };

  /**
   * Ajoute ou retire une equipe.
   *
   * `PUT .../teams` **remplace** l'ensemble des assignations, donc la liste
   * envoyee doit refleter l'etat le plus recent. Le verrou est un `useRef` et non
   * l'etat `busy` : un second appui dans la meme image de rendu verrait encore
   * `busy === false`, partirait de la meme liste que le premier, et l'une des
   * deux bascules serait perdue selon l'ordre des reponses.
   */
  const toggleTeam = (coach: Coach, teamId: string): void => {
    if (togglingRef.current) {
      return;
    }
    togglingRef.current = true;

    const next = coach.teams.some((team) => team.id === teamId)
      ? coach.teams.filter((team) => team.id !== teamId).map((team) => team.id)
      : [...coach.teams.map((team) => team.id), teamId];

    void act(async () => {
      try {
        const updated = await authed((token) => setCoachTeams(token, coach.clubMemberId, next));
        // La reponse porte l'etat retenu par le serveur : on l'adopte tel quel
        // plutot que de recopier ce qu'on avait envoye.
        setCoaches((current) =>
          current?.map((item) => (item.clubMemberId === updated.clubMemberId ? updated : item)),
        );
      } finally {
        togglingRef.current = false;
      }
    });
  };

  const confirmRemove = (coach: Coach): void => {
    void act(async () => {
      await authed((token) => removeCoach(token, coach.clubMemberId));
      setCoaches((current) =>
        current?.filter((item) => item.clubMemberId !== coach.clubMemberId),
      );
      setRemoving(undefined);
      setEditing(undefined);
    });
  };

  return (
    <AppScreen
      title={t.coaches.title}
      subtitle={t.coaches.subtitle}
      onBack={() => router.replace('/club')}
      onRefresh={() => void load()}
      refreshing={loading}
    >
      {banner ? <FormBanner message={banner} /> : null}

      {coaches === undefined && loading ? (
        <YStack paddingVertical="$6" alignItems="center">
          <ActivityIndicator color="#39FF88" />
        </YStack>
      ) : null}

      {coaches !== undefined && coaches.length === 0 ? (
        <EmptyState text={t.coaches.empty} />
      ) : null}

      {coaches?.map((coach) => {
        const open = editing === coach.clubMemberId;
        return (
          <Card key={coach.clubMemberId}>
            <XStack alignItems="center" justifyContent="space-between" gap="$3">
              <Text fontSize={17} fontWeight="700" color="$brandChalk" flexShrink={1}>
                {displayName(coach)}
              </Text>
              <Badge
                label={coach.hasAccepted ? t.coaches.active : t.coaches.pending}
                tone={coach.hasAccepted ? 'accent' : 'warning'}
              />
            </XStack>

            <Text fontSize={13.5} color="$brandChalkDim">
              {coach.email}
            </Text>

            {/*
              Etat de l'envoi. Il est affiche parce que l'email part APRES la
              reponse du serveur : sans ce retour, un echec serait invisible et
              le club croirait son entraineur invite. Rien n'est montre une fois
              le compte active — l'invitation n'a alors plus d'objet.
            */}
            {!coach.hasAccepted ? <InviteState coach={coach} /> : null}

            <Text fontSize={14} color={coach.teams.length > 0 ? '$brandChalk' : '$brandChalkDim'}>
              {coach.teams.length === 0
                ? t.coaches.noTeams
                : coach.teams
                    .map((team) => team.name ?? categoryLabel(team.category, locale))
                    .join(' · ')}
            </Text>

            <XStack gap="$3" flexWrap="wrap">
              <LinkAction
                label={open ? t.teams.cancel : t.coaches.assign}
                onPress={() => setEditing(open ? undefined : coach.clubMemberId)}
              />
              {/* Le renvoi n'a de sens que sur un compte pas encore active. */}
              {!coach.hasAccepted ? (
                sending === coach.clubMemberId ? (
                  <XStack alignItems="center" gap="$2">
                    <ActivityIndicator color="#39FF88" size="small" />
                    <Text fontSize={14.5} color="$brandChalkDim">
                      {t.coaches.resending}
                    </Text>
                  </XStack>
                ) : sentTo === coach.clubMemberId ? (
                  <XStack alignItems="center" gap="$2">
                    <CheckIcon size={16} />
                    <Text fontSize={14.5} fontWeight="700" color="$brandPitchBright">
                      {t.coaches.resent}
                    </Text>
                  </XStack>
                ) : (
                  <LinkAction label={t.coaches.resend} onPress={() => resend(coach)} />
                )
              ) : null}
            </XStack>

            {open ? (
              <YStack gap="$2" marginTop="$1">
                <Text fontSize={12.5} fontWeight="700" letterSpacing={0.6} color="$brandChalkDim">
                  {t.coaches.teamsLabel.toUpperCase()}
                </Text>
                {teams.length === 0 ? (
                  <Text fontSize={13.5} color="$brandChalkDim">
                    {t.teams.empty}
                  </Text>
                ) : null}
                {teams.map((team) => {
                  const assigned = coach.teams.some((item) => item.id === team.id);
                  return (
                    <Pressable
                      key={team.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: assigned }}
                      disabled={busy}
                      onPress={() => toggleTeam(coach, team.id)}
                    >
                      <XStack
                        alignItems="center"
                        justifyContent="space-between"
                        gap="$3"
                        paddingVertical="$2.5"
                        paddingHorizontal="$3"
                        borderRadius={12}
                        borderWidth={1.5}
                        borderColor={assigned ? '#39FF88' : 'rgba(244,251,247,0.14)'}
                        backgroundColor="rgba(14,36,28,0.6)"
                      >
                        <Text fontSize={14.5} color="$brandChalk" flexShrink={1}>
                          {team.name ?? categoryLabel(team.category, locale)}
                        </Text>
                        <Text
                          fontSize={13}
                          fontWeight="800"
                          color={assigned ? '$brandPitchBright' : '$brandChalkDim'}
                        >
                          {assigned ? 'ON' : 'OFF'}
                        </Text>
                      </XStack>
                    </Pressable>
                  );
                })}

                {/* Retrait : conséquence annoncée avant, comme pour une équipe. */}
                {removing === coach.clubMemberId ? (
                  <YStack gap="$2" marginTop="$2">
                    <Text fontSize={16} fontWeight="800" color="$brandChalk">
                      {t.coaches.removeTitle}
                    </Text>
                    <Text fontSize={14} lineHeight={20} color="$brandChalkDim">
                      {t.coaches.removeBody}
                    </Text>
                    <PrimaryButton
                      label={t.coaches.remove}
                      loading={busy}
                      onPress={() => confirmRemove(coach)}
                    />
                    <LinkAction label={t.teams.cancel} onPress={() => setRemoving(undefined)} />
                  </YStack>
                ) : (
                  <YStack marginTop="$2">
                    <LinkAction
                      label={t.coaches.remove}
                      onPress={() => setRemoving(coach.clubMemberId)}
                    />
                  </YStack>
                )}
              </YStack>
            ) : null}
          </Card>
        );
      })}

      <PrimaryButton label={t.coaches.add} onPress={() => router.push('/club/coaches/new')} />
    </AppScreen>
  );
}

/**
 * Nom affichable. Prénom et nom viennent de `ClubMember` — saisis par le club —
 * et peuvent manquer : on retombe sur l'adresse plutôt que sur du vide.
 */
function displayName(coach: Coach): string {
  const full = [coach.firstName, coach.lastName].filter(Boolean).join(' ').trim();
  return full.length > 0 ? full : coach.email;
}

/** Action secondaire en texte, pour ne pas empiler les gros boutons dans une carte. */
function LinkAction({ label, onPress }: { label: string; onPress: () => void }): ReactNode {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8}>
      {({ pressed }) => (
        <Text
          fontSize={14.5}
          fontWeight="700"
          color="$brandPitchBright"
          opacity={pressed ? 0.6 : 1}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * Ce qu'il est advenu de l'invitation.
 *
 * Trois etats, et un seul demande une action : un echec. « En cours d'envoi »
 * n'est pas un probleme, c'est l'etat normal des premieres secondes — sur
 * certains reseaux un envoi SMTP prend une minute.
 */
function InviteState({ coach }: { coach: Coach }): ReactNode {
  const { t } = useI18n();

  if (coach.inviteFailedAt !== null) {
    return (
      <Text fontSize={13.5} fontWeight="700" color="#FFC14D">
        {t.coaches.inviteFailed}
      </Text>
    );
  }
  if (coach.inviteSentAt === null) {
    return (
      <Text fontSize={13.5} color="$brandChalkDim">
        {t.coaches.inviteSending}
      </Text>
    );
  }
  return (
    <Text fontSize={13.5} color="$brandChalkDim">
      {t.coaches.inviteSent}
    </Text>
  );
}
