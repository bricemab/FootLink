import { AERIAL_ATTRIBUTION } from '@footlink/shared';
import { MotiView } from 'moti';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, TextInput } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text, XStack, YStack } from 'tamagui';
import {
  newSearchSession,
  resolveHere,
  retrievePlace,
  searchPlaces,
  type PlaceSuggestion,
  type ResolvedPlace,
} from '@/api/geo';
import { useI18n } from '@/i18n';
import { CheckIcon } from '@/ui/icons';
import { TYPE } from '@/ui/type-scale';

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
  /**
   * Propose « Utiliser ma position ».
   *
   * ⚠️ **Reserve au JOUEUR, et desactive par defaut.** Pour un club, ce bouton
   * serait un contresens : on cherche l'emplacement de son TERRAIN, pas l'endroit
   * ou se tient la personne qui remplit le formulaire — souvent son canape. Pour
   * un joueur au contraire, sa position EST la reponse, et la lui faire taper a
   * la main alors que le telephone la connait est une friction gratuite.
   */
  allowMyPosition?: boolean;
}

export function PlacePicker({
  authed,
  value,
  onChange,
  error,
  onUnavailable,
  copy,
  allowMyPosition = false,
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
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string>();

  /**
   * Renseigne le lieu depuis la position du telephone.
   *
   * 🔴 **`expo-location` est charge A L'APPUI, jamais en haut du module.** C'est
   * un module natif : un import de premier niveau ferait tomber tout l'ecran sur
   * un build qui ne le contient pas encore. Ici, seul le bouton echoue — avec un
   * message.
   *
   * `Balanced` et non `Highest` : on cherche une commune, pas un point precis.
   * La haute precision coute de la batterie et plusieurs secondes d'attente pour
   * une reponse qu'on va de toute facon arrondir.
   *
   * ⚠️ La position brute ne quitte l'appareil que pour cet appel, et c'est la
   * COMMUNE qui est conservee. Ce que le profil stocke reste arrondi a ~1 km.
   */
  const useMyPosition = async (): Promise<void> => {
    setLocationError(undefined);

    let Location: typeof import('expo-location');
    try {
      Location = await import('expo-location');
    } catch {
      setLocationError(t.club.locationUnavailable);
      return;
    }

    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationError(t.club.locationDenied);
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = position.coords;
      const here = await authed((token) => resolveHere(token, latitude, longitude));
      onChange({
        // Identifiant local : ce lieu ne vient pas du catalogue Mapbox, il n'a
        // donc pas d'identifiant de leur cote.
        id: `here:${latitude},${longitude}`,
        label: `${here.locality} (${here.canton})`,
        lat: latitude,
        lng: longitude,
        canton: here.canton,
        locality: here.locality,
        regionCode: null,
      });
      setQuery('');
      setResults([]);
    } catch {
      // Hors de Suisse, ou aucune commune au point : le serveur refuse, et la
      // saisie manuelle reste ouverte juste en dessous.
      setLocationError(t.club.locationOutside);
    } finally {
      setLocating(false);
    }
  };

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
          <YStack height={value.aerialUrl ? PREVIEW_HEIGHT : undefined}>
            {value.aerialUrl ? (
              <Image
                source={{ uri: value.aerialUrl }}
                style={{ width: '100%', height: PREVIEW_HEIGHT }}
                resizeMode="cover"
                accessibilityLabel={value.label}
                onError={() => setImageFailed(true)}
                onLoad={() => setImageFailed(false)}
              />
            ) : null}

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
                <Text {...TYPE.meta} color="$brandChalkDim">
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
                  <Text {...TYPE.heading} color="$brandChalk" flexShrink={1}>
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
                  <Text {...TYPE.body} fontWeight="700" color="$brandPitchBright">
                    {t.club.pitchChange}
                  </Text>
                </Pressable>
              </XStack>
              {/* Commune et canton viennent du serveur : c'est la preuve que le
                  point a bien été situé, et ce qui justifie l'association
                  présélectionnée juste en dessous. */}
              <Text {...TYPE.body} color="$brandChalkDim">
                {`${value.locality} (${value.canton})`}
              </Text>
            </YStack>
          </YStack>

          {/* Mention obligatoire : elle n'est plus incrustée dans l'image
              (`logo=false&attribution=false`), donc elle doit figurer ici. */}
          <XStack paddingHorizontal="$3.5" paddingVertical="$2">
            {/* Hors echelle, deliberement : une mention legale d'attribution
                doit etre lisible sans jamais entrer en concurrence avec le
                contenu. C'est le seul emploi de cette taille. */}
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

      <Text {...TYPE.meta} color="$brandChalkDim">
        {text.help}
      </Text>

      {/* Position du telephone : un appui au lieu d'une saisie. Voir
          `allowMyPosition` — jamais propose pour le terrain d'un club. */}
      {allowMyPosition ? (
        <Pressable
          onPress={() => void useMyPosition()}
          disabled={locating}
          accessibilityRole="button"
        >
          <XStack alignItems="center" gap="$2">
            {locating ? <ActivityIndicator color="#39FF88" size="small" /> : null}
            <Text {...TYPE.body} fontWeight="700" color="$brandPitchBright">
              {locating ? t.club.locating : t.club.useMyPosition}
            </Text>
          </XStack>
        </Pressable>
      ) : null}

      {locationError ? (
        <Text {...TYPE.meta} color="#FFC14D">
          {locationError}
        </Text>
      ) : null}

      {error ? (
        <Text {...TYPE.meta} color="$brandDanger">
          {error}
        </Text>
      ) : null}

      {failed ? (
        <Text {...TYPE.meta} color="$brandDanger">
          {t.club.pitchUnavailable}
        </Text>
      ) : null}

      {showEmpty ? (
        <Text {...TYPE.meta} color="$brandChalkDim">
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
                  <Text {...TYPE.body} color="$brandChalk">
                    {place.label}
                  </Text>
                  {place.context ? (
                    <Text {...TYPE.meta} color="$brandChalkDim">
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
    <Text {...TYPE.meta} color="$brandChalkDim">
      {text.toUpperCase()}
    </Text>
  );
}
