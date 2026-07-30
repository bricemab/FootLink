import { DarkTheme, Tabs, ThemeProvider } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/i18n';
import { ClubHeader } from '@/ui/club-header';
import { BackdropRoot } from '@/ui/pitch-backdrop';
import { GlassSurface, TAB_BAR_HEIGHT } from '@/ui/glass';
import { MegaphoneIcon, StadiumIcon, TeamsIcon } from '@/ui/icons';

/**
 * Espace club : un bandeau de contexte en haut, des destinations en bas.
 *
 * Il y avait avant un tableau de bord fait de cartes menant ailleurs. Un écran
 * d'aiguillage n'apprend rien et ajoute un appui avant chaque chose utile.
 *
 * **Deux registres, volontairement séparés.** Le bandeau porte le *contexte* —
 * au nom de quel club on agit, et demain quelle équipe est active et sous
 * quelle vue. Les onglets portent les *destinations*. Mélanger les deux (« Vue »
 * comme cinquième onglet) ferait perdre le contexte dès qu'on en sort.
 *
 * **La barre porte la structure DEFINITIVE, pas celle du moment.** Club,
 * Équipes, Annonces aujourd'hui ; Joueurs et Messages s'inséreront après sans
 * rien déplacer de ce que l'utilisateur aura appris. C'est tout l'intérêt de ne
 * pas remplir la barre avec ce qui existe : on la remplit avec ce qui restera.
 * Cinq destinations au maximum — au-delà, les libellés se tronquent et la barre
 * devient un menu qu'on lit au lieu d'un repère qu'on reconnaît.
 *
 * Trois conséquences de ce choix :
 *
 * - **`Entraîneurs` n'est pas un onglet** : on ajoute un entraîneur une fois par
 *   saison. C'est de l'administration, donc ça vit dans l'onglet `Club`, atteint
 *   par un appui depuis sa configuration.
 * - **`Annonces` en est un**, alors que l'inverse avait été tranché au départ.
 *   L'argument d'alors — une annonce appartient à une équipe — portait sur la
 *   **création**, et il tient toujours : le formulaire demande l'équipe. Mais on
 *   **consulte** ses annonces bien plus souvent qu'on n'en crée, et « ce que mon
 *   club cherche » est une question de club. Les enfermer dans une équipe
 *   imposait deux écrans à chaque fois.
 * - **`Aperçu` n'en est plus un** : c'est une vérification qu'on fait juste
 *   après avoir modifié sa fiche, pas un endroit où l'on va. Il est devenu une
 *   carte de l'onglet `Club`, à côté de ce qu'il sert à contrôler — et il libère
 *   la place pour `Messages`.
 *
 * ⚠️ **Aucun onglet vide** : Joueurs et Messages n'ont pas d'API. Un onglet qui
 * mène au néant est pire que pas d'onglet.
 *
 * `teams` et `coaches` ont leur propre `_layout` en pile : sans ça, chaque
 * fichier de ces dossiers (`new`, `[id]`) deviendrait un onglet.
 */
const ACTIVE = '#39FF88';
const INACTIVE = 'rgba(169,196,184,0.65)';

/**
 * `tabBarIcon` annonce un `ColorValue`, qui peut être un objet opaque sur
 * certaines plateformes (couleurs système Android). Nos deux couleurs sont des
 * chaînes : on ne retient que ce cas et on laisse l'icône à son défaut sinon,
 * plutôt qu'un `as string` qui mentirait sur le type.
 */
function asColor(value: ColorValue): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * 🔴 **Le thème de navigation, transparent, et pourquoi `contentStyle` ne
 * suffisait pas.**
 *
 * Sur Android, rendre les piles transparentes via `contentStyle` a suffi. Sur
 * iOS, non : `react-native-screens` peint le fond de chaque écran **natif**
 * depuis `colors.background` du thème, et `contentStyle` ne style que la vue de
 * contenu *à l'intérieur*. Résultat observé par Brice sur son iPhone : le décor
 * dans l'onglet Club, un fond plat dans Équipes et Annonces — les deux onglets
 * qui contiennent une pile.
 *
 * `ThemeProvider` d'expo-router s'applique **à n'importe quel niveau** : on le
 * pose donc ici, sur l'espace club uniquement, plutôt qu'à la racine. Le reste
 * de l'app garde son fond opaque, et aucun écran ne risque le flash blanc.
 *
 * Sans danger parce que `BackdropRoot` peint juste dessous : derrière ces écrans
 * transparents il y a toujours la nuit de terrain, jamais du vide.
 */
const TRANSPARENT_THEME = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: 'transparent' },
};

export default function ClubLayout(): ReactNode {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    /*
      Le décor est peint ICI, une seule fois, et il court sur tout l'écran —
      donc aussi derrière l'en-tête et derrière la barre d'onglets, qui sont
      translucides. Les halos ne s'arrêtent plus net à leur bord.

      Le contenu, lui, ne passe pas dessous : en-tête et barre occupent leur
      place dans la mise en page. C'est la combinaison des deux qui est demandée
      — décor traversant, contenu contenu.
    */
    <BackdropRoot>
      <ThemeProvider value={TRANSPARENT_THEME}>
        <ClubHeader />
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: ACTIVE,
            tabBarInactiveTintColor: INACTIVE,
            /*
              🔴 La barre **ne flotte pas** (`position` par défaut, pas `absolute`).

              En flottant, le contenu défilait derrière son verre : joli à l'arrêt,
              pénible à l'usage — pendant chaque défilement, cartes et boutons
              disparaissaient sous les icônes. Brice l'a signalé deux fois, la
              lisibilité passe devant l'effet.

              Contrepartie assumée : sur iOS 26 le Liquid Glass ne réfracte plus le
              contenu qui passe dessous, il ne garde que sa brillance et son
              liseré. Repasser en flottant tient en une ligne — remettre
              `position: 'absolute'` ici — si l'arbitrage change.
            */
            tabBarStyle: {
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              elevation: 0,
              height: TAB_BAR_HEIGHT + insets.bottom,
              paddingTop: 8,
              // La barre descend jusqu'au bord ; son contenu s'arrete au-dessus de
              // la barre de gestes.
              paddingBottom: insets.bottom + 10,
            },
            tabBarBackground: () => (
              <GlassSurface edge="top" intensity={36}>
                <View style={StyleSheet.absoluteFill} />
              </GlassSurface>
            ),
            tabBarLabelStyle: { fontSize: 11.5, fontWeight: '700' },
            /*
              Sans ça, rien de ce qui précède ne se voit : le navigateur pose son
              propre fond opaque (thème de react-navigation) par-dessus le décor,
              et les halos disparaissent — y compris derrière la barre, qui vit
              dans ce même conteneur.
            */
            sceneStyle: { backgroundColor: 'transparent' },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: t.clubSpace.tabClub,
              tabBarIcon: ({ color }) => <StadiumIcon size={24} color={asColor(color)} />,
            }}
          />
          <Tabs.Screen
            name="teams"
            options={{
              title: t.clubSpace.tabTeams,
              tabBarIcon: ({ color }) => <TeamsIcon size={24} color={asColor(color)} />,
            }}
          />
          <Tabs.Screen
            name="listings"
            options={{
              title: t.clubSpace.tabListings,
              tabBarIcon: ({ color }) => <MegaphoneIcon size={24} color={asColor(color)} />,
            }}
          />
          {/* Routes atteintes depuis l'onglet Club : `coaches` et `preview`.
              `href: null` les retire de la barre sans les retirer de la
              navigation. */}
          <Tabs.Screen name="coaches" options={{ href: null }} />
          <Tabs.Screen name="preview" options={{ href: null }} />
          {/* ⚠️ Tout DOSSIER de `club/` devient un onglet : `players` s'est
              invite dans la barre des son ajout. `href: null` le retire de la
              barre sans le retirer de la navigation. */}
          <Tabs.Screen name="players" options={{ href: null }} />
        </Tabs>
      </ThemeProvider>
    </BackdropRoot>
  );
}
