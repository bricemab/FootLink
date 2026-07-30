import {
  categoryLabel,
  getEligibleCategories,
  getSeasonStartYear,
  isAgeAllowed,
  MIN_PLAYER_AGE,
  posteLabel,
  type Gender,
} from '@footlink/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import type { ResolvedPlace } from '@/api/geo';
import { upsertMyPlayerProfile } from '@/api/players';
import { useAuth } from '@/auth/auth-context';
import { useI18n } from '@/i18n';
import { AuthFormShell } from '@/ui/auth-form-shell';
import { toUserMessage } from '@/ui/error-message';
import { FormBanner } from '@/ui/form-banner';
import { GenderChoice } from '@/ui/gender-choice';
import { PitchPositions, type PitchSelection } from '@/ui/pitch-positions';
import { PlacePicker } from '@/ui/place-picker';
import { PrimaryButton } from '@/ui/primary-button';
import { Stepper, StepTransition } from '@/ui/stepper';
import { TextField } from '@/ui/text-field';
import { useStepper } from '@/ui/use-stepper';
import { TYPE } from '@/ui/type-scale';

/**
 * Onboarding du profil joueur.
 *
 * On ne demande que le **minimum sans lequel le matching est impossible** :
 * identité, année de naissance, poste principal, localisation (décision 34 du
 * HANDOFF). Taille, pied fort, bio et photo restent proposables ensuite depuis
 * le profil — allonger ce parcours, c'est perdre des inscrits.
 *
 * Deux points qui ne sont pas des détails :
 *
 * - **La catégorie n'est jamais demandée.** Elle se déduit de l'année de
 *   naissance via `getEligibleCategories`, seule source autorisée (la
 *   correspondance année → catégorie change à chaque saison, cf. AGENTS §5).
 * - **La position est arrondie ici**, avant l'envoi. Le serveur ré-arrondit,
 *   mais la position précise ne quitte pas l'appareil (AGENTS §6.5).
 */
type Step = 'IDENTITY' | 'POSITIONS' | 'LOCATION' | 'RECAP';

/**
 * Étape précédente, ou `undefined` s'il n'y en a pas.
 *
 * Au niveau module : sert de dépendance stable au `useEffect` du retour
 * matériel, qu'un objet recréé à chaque rendu ferait se réabonner sans raison.
 */
const BACK_STEP: Record<Step, Step | undefined> = {
  IDENTITY: undefined,
  POSITIONS: 'IDENTITY',
  LOCATION: 'POSITIONS',
  RECAP: 'LOCATION',
};

/** Grille de confidentialité : 2 décimales ≈ 1 km. Identique au serveur. */
function roundToGrid(value: number): number {
  return Math.round(value * 100) / 100;
}

export default function OnboardingPlayer(): ReactNode {
  const router = useRouter();
  const { t, fill, locale } = useI18n();
  const { reload, authed, profileHints, clearProfileHints } = useAuth();

  const [step, setStep] = useState<Step>('IDENTITY');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [gender, setGender] = useState<Gender>('MALE');
  const [positions, setPositions] = useState<PitchSelection>({ primary: null, secondary: [] });
  const [place, setPlace] = useState<ResolvedPlace>();
  const [fieldError, setFieldError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [busy, setBusy] = useState(false);

  const seasonStartYear = getSeasonStartYear(new Date());
  const year = Number.parseInt(birthYear, 10);
  const yearLooksComplete = /^\d{4}$/.test(birthYear);
  const ageAllowed = yearLooksComplete && isAgeAllowed(year, seasonStartYear);

  // Catégories éligibles : affichées dès que l'année est saisie, jamais demandées.
  const eligible = ageAllowed ? getEligibleCategories(year, seasonStartYear, gender) : [];

  /**
   * Catégorie **déterminée** par l'année de naissance, s'il n'y en a qu'une.
   *
   * Un junior n'a qu'une catégorie possible (Juniors B, C…), donc on peut
   * l'enregistrer. Un actif, lui, est éligible à toutes les ligues de 1re à 5e :
   * laquelle il joue est un choix, pas une déduction. Prendre `eligible[0]`
   * inscrirait tous les adultes en 1re ligue.
   */
  const settledCategory = eligible.length === 1 ? eligible[0] : undefined;

  const steps = [t.steps.identity, t.steps.positions, t.steps.location, t.steps.recap];
  const current = { IDENTITY: 0, POSITIONS: 1, LOCATION: 2, RECAP: 3 }[step];
  const { stepLabel, nextLabel } = useStepper(steps, current);

  /**
   * Préremplissage depuis Google, **une seule fois**.
   *
   * `clearProfileHints` juste après : sans ça, un rendu suivant réécrirait par-
   * dessus une correction que la personne vient de taper. Et on ne remplit que
   * les champs encore vides, pour la même raison.
   *
   * Google énonce un nom, il ne le prouve pas : ces valeurs sont un point de
   * départ, pas une vérité — d'où des champs qui restent modifiables.
   */
  useEffect(() => {
    if (!profileHints) {
      return;
    }
    setFirstName((current) => (current.length > 0 ? current : (profileHints.firstName ?? '')));
    setLastName((current) => (current.length > 0 ? current : (profileHints.lastName ?? '')));
    clearProfileHints();
  }, [profileHints, clearProfileHints]);

  /**
   * Le retour matériel Android suit les mêmes règles que le lien « Retour ».
   *
   * Sans ça il sortait de l'onboarding : la pile contient encore l'accueil et
   * la connexion sous cet écran (on y arrive par redirection), donc un appui
   * ramenait sur l'écran de connexion alors que la session est ouverte. On
   * consomme l'événement dans tous les cas — l'onboarding est un passage
   * obligé, et `allowStackBack={false}` ferme l'autre chemin, le lien.
   */
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const previous = BACK_STEP[step];
      if (previous) {
        setStep(previous);
      }
      return true;
    });
    return () => subscription.remove();
  }, [step]);

  const goToPositions = (): void => {
    setBanner(undefined);
    if (firstName.trim().length === 0 || lastName.trim().length === 0) {
      setFieldError(t.errors.required);
      return;
    }
    if (!yearLooksComplete) {
      setFieldError(t.errors.required);
      return;
    }
    if (!ageAllowed) {
      // Le serveur refuse aussi (garde 16+), mais autant le dire tout de suite
      // plutôt qu'à la sauvegarde, trois écrans plus loin.
      setFieldError(fill(t.onboarding.tooYoung, { age: String(MIN_PLAYER_AGE) }));
      return;
    }
    setFieldError(undefined);
    setStep('POSITIONS');
  };

  const goToLocation = (): void => {
    setBanner(undefined);
    if (positions.primary === null) {
      setBanner(t.onboarding.positionRequired);
      return;
    }
    setStep('LOCATION');
  };

  const goToRecap = (): void => {
    setBanner(undefined);
    if (!place) {
      setBanner(t.onboarding.locationRequired);
      return;
    }
    setStep('RECAP');
  };

  const submit = async (): Promise<void> => {
    setBanner(undefined);
    // Copie locale : le rétrécissement de type d'un accès de propriété ne
    // survit pas à l'entrée dans la closure passée à `authed`.
    const primary = positions.primary;
    if (primary === null || !place) {
      return;
    }
    setBusy(true);
    try {
      await authed((token) =>
        upsertMyPlayerProfile(token, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          birthYear: year,
          gender,
          positions: [
            { poste: primary, isPrimary: true },
            ...positions.secondary.map((poste) => ({ poste, isPrimary: false })),
          ],
          canton: place.canton,
          locality: place.locality,
          // Arrondi AVANT l'envoi : la position exacte reste sur l'appareil.
          lat: roundToGrid(place.lat),
          lng: roundToGrid(place.lng),
          ...(settledCategory ? { currentCategory: settledCategory } : {}),
        }),
      );
      // `hasPlayerProfile` change en base : on rafraîchit la session pour que la
      // garde de routage ne renvoie plus ici.
      await reload();
      router.replace('/player');
    } catch (error) {
      setBanner(toUserMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  const { title, subtitle } = headings(step, t);

  return (
    <AuthFormShell
      title={title}
      subtitle={subtitle}
      header={
        <Stepper steps={steps} current={current} stepLabel={stepLabel} nextLabel={nextLabel} />
      }
      allowStackBack={false}
      {...(BACK_STEP[step] ? { onBack: () => setStep(BACK_STEP[step] as Step) } : {})}
    >
      {banner ? <FormBanner message={banner} /> : null}

      {step === 'IDENTITY' ? (
        <StepTransition stepKey="identity">
          <YStack gap="$4">
            <TextField
              label={t.onboarding.firstName}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Brice"
              autoCapitalize="words"
            />
            <TextField
              label={t.onboarding.lastName}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Mabillard"
              autoCapitalize="words"
            />
            <TextField
              label={t.onboarding.birthYear}
              value={birthYear}
              onChangeText={(value) => setBirthYear(value.replace(/\D/g, '').slice(0, 4))}
              placeholder="2005"
              keyboardType="number-pad"
              error={fieldError}
            />

            <GenderChoice label={t.onboarding.gender} value={gender} onChange={setGender} />

            {/* La catégorie s'annonce, elle ne se demande pas. */}
            {ageAllowed ? (
              <XStack
                alignItems="center"
                gap="$2"
                paddingVertical="$2.5"
                paddingHorizontal="$3"
                borderRadius={14}
                backgroundColor="rgba(57,255,136,0.10)"
                borderWidth={1}
                borderColor="rgba(57,255,136,0.28)"
              >
                <Text {...TYPE.body} color="$brandChalk" flexShrink={1}>
                  {settledCategory
                    ? fill(t.onboarding.categoryComputed, {
                        category: categoryLabel(settledCategory, locale),
                      })
                    : t.onboarding.categoryActives}
                </Text>
              </XStack>
            ) : null}

            <PrimaryButton label={t.coach.next} onPress={goToPositions} />
          </YStack>
        </StepTransition>
      ) : null}

      {step === 'POSITIONS' ? (
        <StepTransition stepKey="positions">
          <YStack gap="$4">
            <PitchPositions value={positions} onChange={setPositions} />
            <PrimaryButton label={t.coach.next} onPress={goToLocation} />
          </YStack>
        </StepTransition>
      ) : null}

      {step === 'LOCATION' ? (
        <StepTransition stepKey="location">
          <YStack gap="$4">
            <PlacePicker
              authed={authed}
              value={place}
              onChange={setPlace}
              // Un joueur cherche OU IL EST : le telephone le sait deja, le lui
              // faire taper etait une friction gratuite. Jamais propose au club,
              // dont on cherche le terrain et non l'endroit ou il remplit le
              // formulaire.
              allowMyPosition
              copy={{
                label: t.onboarding.placeLabel,
                placeholder: t.onboarding.placePlaceholder,
                help: t.onboarding.placeHelp,
              }}
            />
            <PrimaryButton label={t.coach.next} onPress={goToRecap} />
          </YStack>
        </StepTransition>
      ) : null}

      {step === 'RECAP' ? (
        <StepTransition stepKey="recap">
          <YStack gap="$4">
            <YStack
              gap="$3"
              padding="$4"
              borderRadius={20}
              backgroundColor="rgba(12,30,23,0.92)"
              borderWidth={1}
              borderColor="rgba(57,255,136,0.30)"
            >
              <RecapRow label={t.onboarding.fullName} value={`${firstName} ${lastName}`.trim()} />
              <RecapRow label={t.onboarding.birthYear} value={birthYear} />
              <RecapRow
                label={t.onboarding.gender}
                value={gender === 'FEMALE' ? t.onboarding.female : t.onboarding.male}
              />
              <RecapRow
                label={t.onboarding.category}
                value={
                  settledCategory ? categoryLabel(settledCategory, locale) : t.onboarding.actives
                }
              />
              <RecapRow
                label={t.onboarding.primaryPosition}
                value={positions.primary ? posteLabel(positions.primary, locale) : '—'}
              />
              {positions.secondary.length > 0 ? (
                <RecapRow
                  label={t.onboarding.otherPositions}
                  value={positions.secondary.map((p) => posteLabel(p, locale)).join(' · ')}
                />
              ) : null}
              <RecapRow
                label={t.onboarding.placeLabel}
                value={place ? `${place.locality} (${place.canton})` : '—'}
              />
            </YStack>

            <PrimaryButton
              label={t.onboarding.finish}
              loading={busy}
              onPress={() => void submit()}
            />
          </YStack>
        </StepTransition>
      ) : null}
    </AuthFormShell>
  );
}

/** Ligne du récapitulatif : étiquette à gauche, valeur alignée à droite. */
function RecapRow({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <XStack justifyContent="space-between" alignItems="flex-start" gap="$3">
      <Text {...TYPE.label} color="$brandChalkDim" flexShrink={0}>
        {label.toUpperCase()}
      </Text>
      <Text {...TYPE.body} color="$brandChalk" flexShrink={1} textAlign="right">
        {value}
      </Text>
    </XStack>
  );
}

/** Titre et sous-titre de l'étape courante. */
function headings(
  step: Step,
  t: ReturnType<typeof useI18n>['t'],
): { title: string; subtitle: string } {
  switch (step) {
    case 'POSITIONS':
      return { title: t.onboarding.positionsTitle, subtitle: t.onboarding.positionsSubtitle };
    case 'LOCATION':
      return { title: t.onboarding.locationTitle, subtitle: t.onboarding.locationSubtitle };
    case 'RECAP':
      return { title: t.onboarding.recapTitle, subtitle: t.onboarding.recapSubtitle };
    default:
      return { title: t.onboarding.identityTitle, subtitle: t.onboarding.identitySubtitle };
  }
}
