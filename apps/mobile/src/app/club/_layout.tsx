import { Tabs } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/i18n';
import { ClubHeader } from '@/ui/club-header';
import { GlassSurface, TAB_BAR_HEIGHT } from '@/ui/glass';
import { EyeIcon, StadiumIcon, TeamsIcon } from '@/ui/icons';

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
 * Équipes, Aperçu aujourd'hui ; Joueurs et Messages s'inséreront entre Équipes
 * et Aperçu sans rien déplacer de ce que l'utilisateur aura appris. C'est tout
 * l'intérêt de ne pas remplir la barre avec ce qui existe : on la remplit avec
 * ce qui restera.
 *
 * Deux conséquences de ce choix :
 *
 * - **`Entraîneurs` n'est pas un onglet** : on ajoute un entraîneur une fois par
 *   saison. C'est de l'administration, donc ça vit dans l'onglet `Club`, atteint
 *   par un appui depuis sa configuration.
 * - **Les annonces n'en seront pas un non plus** : une annonce appartient à une
 *   **équipe**, elle vivra donc dans le détail de l'équipe. Un onglet `Annonces`
 *   obligerait à redemander « laquelle ? » à chaque fois.
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

export default function ClubLayout(): ReactNode {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
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
        {/* Routes atteintes depuis ailleurs : `coaches` depuis l'onglet Club,
            `listings` depuis une équipe. `href: null` les retire de la barre
            sans les retirer de la navigation. */}
        <Tabs.Screen name="coaches" options={{ href: null }} />
        <Tabs.Screen name="listings" options={{ href: null }} />
        <Tabs.Screen
          name="preview"
          options={{
            title: t.clubSpace.tabPreview,
            tabBarIcon: ({ color }) => <EyeIcon size={24} color={asColor(color)} />,
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07130F' },
});
