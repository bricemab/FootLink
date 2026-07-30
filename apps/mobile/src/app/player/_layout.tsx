import { DarkTheme, Tabs, ThemeProvider } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/i18n';
import { GlassSurface, TAB_BAR_HEIGHT } from '@/ui/glass';
import { BallIcon, BookmarkIcon, MegaphoneIcon } from '@/ui/icons';
import { BackdropRoot } from '@/ui/pitch-backdrop';

/**
 * Espace joueur.
 *
 * 🔴 **Le joueur n'avait aucune navigation.** Il atterrissait sur un écran
 * unique, sans barre, sans ailleurs — pendant que le club avait déjà trois
 * onglets. C'était le symptôme le plus visible d'un produit construit d'un seul
 * côté.
 *
 * Trois destinations aujourd'hui, et la barre porte la structure DEFINITIVE :
 * `Messages` s'insérera entre `Candidatures` et `Profil` sans rien déplacer de
 * ce que l'utilisateur aura appris. Cinq places au maximum, comme côté club.
 *
 * ⚠️ **Aucun onglet vide** : `Candidatures` n'est apparu qu'avec le module
 * d'interactions qui lui donne un contenu. Un onglet qui mène au néant est pire
 * que pas d'onglet — et c'est aussi pour ça que `Messages` attend encore.
 *
 * Le décor et le thème transparent suivent exactement la même règle que
 * l'espace club — voir `club/_layout.tsx` pour le détail des trois endroits qui
 * doivent devenir transparents.
 */
const ACTIVE = '#39FF88';
const INACTIVE = 'rgba(169,196,184,0.65)';

function asColor(value: ColorValue): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

const TRANSPARENT_THEME = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: 'transparent' },
};

export default function PlayerLayout(): ReactNode {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    // `header={false}` : l'espace joueur n'a PAS de bandeau de contexte — aucun
    // club a nommer. C'est donc chaque ecran qui porte la barre d'etat.
    <BackdropRoot header={false}>
      <ThemeProvider value={TRANSPARENT_THEME}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: ACTIVE,
            tabBarInactiveTintColor: INACTIVE,
            // La barre ne flotte pas : voir `club/_layout.tsx`, la lisibilité
            // passe devant l'effet.
            tabBarStyle: {
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              elevation: 0,
              height: TAB_BAR_HEIGHT + insets.bottom,
              paddingTop: 8,
              paddingBottom: insets.bottom + 10,
            },
            tabBarBackground: () => (
              <GlassSurface edge="top" intensity={36}>
                <View style={StyleSheet.absoluteFill} />
              </GlassSurface>
            ),
            tabBarLabelStyle: { fontSize: 11.5, fontWeight: '700' },
            sceneStyle: { backgroundColor: 'transparent' },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: t.feed.title,
              tabBarIcon: ({ color }) => <MegaphoneIcon size={24} color={asColor(color)} />,
            }}
          />
          {/* Insere ENTRE Decouvrir et Profil, a la place reservee des le
              depart. Sans cet onglet, « garder » serait une ecriture sans
              lecture : le feed exclut deja tout ce sur quoi on s'est prononce. */}
          <Tabs.Screen
            name="applications"
            options={{
              title: t.feed.myTitle,
              tabBarIcon: ({ color }) => <BookmarkIcon size={23} color={asColor(color)} />,
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: t.home.tab,
              tabBarIcon: ({ color }) => <BallIcon size={24} color={asColor(color)} />,
            }}
          />
        </Tabs>
      </ThemeProvider>
    </BackdropRoot>
  );
}
