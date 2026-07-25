import { AERIAL_ATTRIBUTION } from '@footlink/shared';
import { MotiView } from 'moti';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, TextInput } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text, XStack, YStack } from 'tamagui';
import {
  newSearchSession,
  retrievePlace,
  searchPlaces,
  type PlaceSuggestion,
  type ResolvedPlace,
} from '@/api/geo';
import { useI18n } from '@/i18n';
import { CheckIcon } from '@/ui/icons';

/**
 * Choix du terrain d'un club, par autocomplétion.
 *
 * Un seul champ pour deux façons de chercher — « Stade de Pranoé » ou « route
 * de la Crettaz 6 » — parce qu'un responsable de club n'a aucune raison de
 * savoir si son terrain est référencé comme lieu ou comme adresse.
 *
 * La sélection ne retient qu'un point. Le canton, la commune et l'association
 * régionale en sont déduits **par le serveur** : les calculer ici reviendrait à
 * laisser un client décider de la région de son club.
 */

// 500 ms plutôt que 350 : on n'interroge Mapbox qu'une fois la frappe vraiment
// posée. Toutes les frappes d'une même recherche partagent la session, donc ça
// ne change pas le nombre de sessions facturées — mais ça réduit nettement le
// volume de requêtes suggest, et une pause d'un demi-seconde reste invisible.
const DEBOUNCE_MS = 500;
const MIN_CHARS = 3;
// Assez haut pour que le terrain remplisse le cadre, assez bas pour que le
// bouton « Continuer » reste visible sans faire défiler.
const PREVIEW_HEIGHT = 190;

interface PlacePickerProps {
  /**
   * Exécute l'appel avec un jeton **valide**, en le renouvelant au besoin
   * (`authed` du contexte d'auth).
   *
   * Reçoit une fonction et non un jeton : un jeton passé en prop est un
   * instantané, et l'écran d'inscription comme l'onboarding vivent plus
   * longtemps que sa durée de vie. La recherche répondait alors « indisponible »
   * pour une simple expiration, ce qui se lisait comme une panne de Mapbox.
   */
  authed: <T>(call: (accessToken: string) => Promise<T>) => Promise<T>;
  value: ResolvedPlace | undefined;
  onChange: (place: ResolvedPlace | undefined) => void;
  /** Signalé par le parent quand le terrain manque à la validation. */
  error?: string | undefined;
  /** Prévient le parent que la recherche est HS, pour proposer la saisie manuelle. */
  onUnavailable?: (unavailable: boolean) => void;
  /**
   * Libellés du champ. Par défaut ceux du **terrain d'un club**, puisque c'est
   * l'usage d'origine. L'onboarding joueur les remplace : on y cherche où
   * habite la personne, pas le stade d'un club — laisser « Terrain du club »
   * sur cet écran demandait une chose et en promettait une autre.
   */
  copy?: { label: string; placeholder: string; help: string };
}

export function PlacePicker({
  authed,
  value,
  onChange,
  error,
  onUnavailable,
  copy,
}: PlacePickerProps): ReactNode {
  const { t } = useI18n();
  const text = copy ?? {
    label: t.club.pitch,
    placeholder: t.club.pitchPlaceholder,
    help: t.club.pitchHelp,
  };
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);

  // Une frappe annule la requête précédente : sans ça, une réponse lente
  // écraserait le résultat d'une saisie plus récente.
  const abortRef = useRef<AbortController | null>(null);
  // Toutes les frappes d'une même recherche partagent une session : c'est ce
  // qui la fait compter pour une seule chez le fournisseur.
  const sessionRef = useRef<string>(newSearchSession());

  useEffect(() => {
    const needle = query.trim();
    if (value || needle.length < MIN_CHARS) {
      setResults([]);
      setSearching(false);
      return;
    }

    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);

      authed((token) => searchPlaces(token, needle, sessionRef.current, controller.signal))
        .then((found) => {
          if (controller.signal.aborted) {
            return;
          }
          setResults(found);
          setFailed(false);
          onUnavailable?.(false);
        })
        .catch(() => {
          if (controller.signal.aborted) {
            return;
          }
          // Panne du service tiers : on ne bloque pas l'inscription, le parent
          // bascule sur la saisie manuelle de la localité.
          setResults([]);
          setFailed(true);
          onUnavailable?.(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setSearching(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // `onUnavailable` est une callback du parent, stable en pratique ; la
    // remettre en dépendance relancerait une recherche à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, value, authed]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const pick = (suggestion: PlaceSuggestion): void => {
    setResolving(suggestion.id);
    authed((token) => retrievePlace(token, suggestion.id, sessionRef.current))
      .then((place) => {
        onChange(place);
        setResults([]);
        // La session est consommée : la suivante doit en ouvrir une neuve.
        sessionRef.current = newSearchSession();
      })
      .catch(() => setFailed(true))
      .finally(() => setResolving(undefined));
  };

  const borderColor = error ? '#FF5A5F' : focused ? '#39FF88' : 'rgba(244,251,247,0.18)';

  if (value) {
    return (
      <YStack gap="$2">
        <FieldLabel text={text.label} />
        {/*
          Volontairement SANS animation d'entrée.

          Une `MotiView` avec `from={{ opacity: 0 }}` a laissé cette carte
          invisible en conditions réelles : l'espace était réservé, mais rien ne
          se dessinait — l'animation ne s'était pas jouée et l'opacité était
          restée à zéro. Un champ de formulaire ne doit pas dépendre d'une
          animation pour exister. Le liseré vert suffit à marquer la sélection.
        */}
        <YStack
          borderRadius={18}
          borderWidth={1.5}
          borderColor="rgba(57,255,136,0.45)"
          backgroundColor="rgba(7,19,15,0.95)"
          overflow="hidden"
        >
          {/* Vue du ciel : un terrain de football se reconnaît au premier coup
              d'oeil, ce qui vaut confirmation que le bon point a été choisi —
              bien mieux qu'une ligne de texte. */}
          <YStack height={PREVIEW_HEIGHT}>
            <Image
              source={{ uri: value.aerialUrl }}
              style={{ width: '100%', height: PREVIEW_HEIGHT }}
              resizeMode="cover"
              accessibilityLabel={value.label}
              onError={() => setImageFailed(true)}
              onLoad={() => setImageFailed(false)}
            />

            {imageFailed ? (
              // Sans cela, un échec de chargement laisse un rectangle noir muet.
              <YStack
                position="absolute"
                top={0}
                left={0}
                right={0}
                bottom={0}
                alignItems="center"
                justifyContent="center"
              >
                <Text fontSize={13} color="$brandChalkDim">
                  {t.club.pitchNoImage}
                </Text>
              </YStack>
            ) : (
              /*
                Voile sombre en dégradé.

                Une photo satellite est claire et désaturée : posée telle quelle
                dans une interface nocturne, elle formait un rectangle criard
                qui écrasait tout le formulaire. Le dégradé la fait descendre
                dans le noir de la carte, et donne au texte un fond assez
                contrasté pour être lisible par-dessus.

                Dessiné en SVG plutôt qu'avec `expo-linear-gradient` :
                `react-native-svg` est déjà là pour les icônes, donc aucun
                module natif de plus, donc aucune reconstruction de l'app.
              */
              <Svg
                width="100%"
                height={PREVIEW_HEIGHT}
                style={{ position: 'absolute', left: 0, bottom: 0 }}
                pointerEvents="none"
              >
                <Defs>
                  <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#07130F" stopOpacity="0.15" />
                    <Stop offset="0.45" stopColor="#07130F" stopOpacity="0.35" />
                    <Stop offset="1" stopColor="#07130F" stopOpacity="0.96" />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#scrim)" />
              </Svg>
            )}

            {/* Le texte vit SUR l'image : une seule carte, au lieu d'une photo
                surmontant une boîte de texte sans rapport visuel. */}
            <YStack
              position="absolute"
              left={0}
              right={0}
              bottom={0}
              paddingHorizontal="$3.5"
              paddingBottom="$3"
              gap="$1"
            >
              <XStack alignItems="center" justifyContent="space-between" gap="$3">
                <XStack alignItems="center" gap="$2" flexShrink={1}>
                  <CheckIcon />
                  <Text fontSize={17} fontWeight="700" color="$brandChalk" flexShrink={1}>
                    {value.label}
                  </Text>
                </XStack>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={12}
                  onPress={() => {
                    onChange(undefined);
                    setQuery('');
                    setResults([]);
                    setImageFailed(false);
                  }}
                >
                  <Text fontSize={14} fontWeight="700" color="$brandPitchBright">
                    {t.club.pitchChange}
                  </Text>
                </Pressable>
              </XStack>
              {/* Commune et canton viennent du serveur : c'est la preuve que le
                  point a bien été situé, et ce qui justifie l'association
                  présélectionnée juste en dessous. */}
              <Text fontSize={14} color="$brandChalkDim">
                {`${value.locality} (${value.canton})`}
              </Text>
            </YStack>
          </YStack>

          {/* Mention obligatoire : elle n'est plus incrustée dans l'image
              (`logo=false&attribution=false`), donc elle doit figurer ici. */}
          <XStack paddingHorizontal="$3.5" paddingVertical="$2">
            <Text fontSize={10} color="rgba(169,196,184,0.55)">
              {AERIAL_ATTRIBUTION}
            </Text>
          </XStack>
        </YStack>
      </YStack>
    );
  }

  const showEmpty =
    touched && !searching && !failed && results.length === 0 && query.trim().length >= MIN_CHARS;

  return (
    <YStack gap="$2">
      <FieldLabel text={text.label} />

      <MotiView
        animate={{
          borderColor,
          backgroundColor: focused ? 'rgba(20,53,42,0.85)' : 'rgba(14,36,28,0.7)',
        }}
        transition={{ type: 'timing', duration: 160 }}
        style={{ borderWidth: 1.5, borderRadius: 16 }}
      >
        <XStack alignItems="center">
          <TextInput
            value={query}
            onChangeText={(next) => {
              setQuery(next);
              setTouched(true);
            }}
            placeholder={text.placeholder}
            placeholderTextColor="rgba(169,196,184,0.5)"
            autoCapitalize="words"
            autoCorrect={false}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{ flex: 1, height: 54, paddingHorizontal: 16, fontSize: 16, color: '#F4FBF7' }}
          />
          {searching ? (
            <YStack paddingRight="$3.5">
              <ActivityIndicator color="#39FF88" />
            </YStack>
          ) : null}
        </XStack>
      </MotiView>

      <Text fontSize={13} color="$brandChalkDim">
        {text.help}
      </Text>

      {error ? (
        <Text fontSize={13} color="$brandDanger">
          {error}
        </Text>
      ) : null}

      {failed ? (
        <Text fontSize={13} color="$brandDanger">
          {t.club.pitchUnavailable}
        </Text>
      ) : null}

      {showEmpty ? (
        <Text fontSize={13} color="$brandChalkDim">
          {t.club.pitchEmpty}
        </Text>
      ) : null}

      {/* Aucune animation d'entrée : une suggestion invisible ou décalée
          ferait croire que la recherche n'a rien trouvé. Cf. `StepTransition`. */}
      {results.map((place) => (
        <YStack key={place.id}>
          <Pressable
            accessibilityRole="button"
            disabled={resolving !== undefined}
            onPress={() => pick(place)}
          >
            {({ pressed }) => (
              <XStack
                alignItems="center"
                justifyContent="space-between"
                gap="$3"
                paddingVertical="$3"
                paddingHorizontal="$3.5"
                borderRadius={14}
                borderWidth={1.5}
                borderColor={pressed ? '#39FF88' : 'rgba(244,251,247,0.14)'}
                backgroundColor="rgba(14,36,28,0.7)"
                opacity={resolving !== undefined && resolving !== place.id ? 0.5 : 1}
              >
                <YStack flexShrink={1} gap="$1">
                  <Text fontSize={15} color="$brandChalk">
                    {place.label}
                  </Text>
                  {place.context ? (
                    <Text fontSize={13} color="$brandChalkDim">
                      {place.context}
                    </Text>
                  ) : null}
                </YStack>
                {resolving === place.id ? <ActivityIndicator color="#39FF88" /> : null}
              </XStack>
            )}
          </Pressable>
        </YStack>
      ))}
    </YStack>
  );
}

function FieldLabel({ text }: { text: string }): ReactNode {
  return (
    <Text fontSize={13} fontWeight="600" color="$brandChalkDim" letterSpacing={0.4}>
      {text.toUpperCase()}
    </Text>
  );
}
