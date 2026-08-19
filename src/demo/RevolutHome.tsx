import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

/**
 * Tuner demo screen (dev-only route): a Revolut-style home screen in pure
 * RN — gradient backdrop, balance block, action row, transaction card, and
 * a tab bar. Every style is a literal so the whole screen is tunable.
 *
 * The gradient is banded rather than a native gradient dependency: 16 stacked
 * views from one JSX element, which doubles as a multi-instance selection
 * test (edit one band, all sixteen change).
 */

type Props = {
  onClose: () => void;
};

/**
 * Flip to `false` to hide the content and tune the gradient in isolation.
 */
const SHOW_CONTENT = true;

const GRADIENT = [
  '#4470FF', '#3A63FA', '#2F55F2', '#2447E8',
  '#1B3ADB', '#142FCC', '#0E25B8', '#0A1D9E',
  '#071681', '#051063', '#040C4A', '#030935',
  '#020724', '#020518', '#010410', '#01030B',
];

const ACTIONS = [
  { glyph: '+', label: 'Add money' },
  { glyph: '⇄', label: 'Move' },
  { glyph: '🏛', label: 'Details' },
  { glyph: '⋯', label: 'More' },
] as const;

const TABS = [
  { glyph: 'R', label: 'Home' },
  { glyph: '📈', label: 'Invest' },
  { glyph: '⇄', label: 'Payments' },
  { glyph: '₿', label: 'Crypto' },
  { glyph: '◵', label: 'Lifestyle' },
] as const;

export function RevolutHome({ onClose }: Props) {
  return (
    <View style={styles.screen}>
      <View style={styles.backdrop} pointerEvents="none">
        {GRADIENT.map((color) => (
          <View key={color} style={[styles.band, { backgroundColor: color }]} />
        ))}
      </View>

      {!SHOW_CONTENT ? (
        <Pressable style={styles.isolatedClose} onPress={onClose}>
          <Text style={styles.isolatedCloseGlyph}>✕</Text>
        </Pressable>
      ) : null}

      {SHOW_CONTENT ? (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable style={styles.avatar} onPress={onClose}>
            <Text style={styles.avatarGlyph}>👤</Text>
            <View style={styles.avatarDot} />
          </Pressable>
          <View style={styles.search}>
            <Text style={styles.searchIcon}>⌕</Text>
            <Text style={styles.searchLabel}>Search</Text>
          </View>
          <View style={styles.topCircle}>
            <Text style={styles.topCircleGlyph}>▥</Text>
          </View>
          <View style={styles.topCircle}>
            <Text style={styles.topCircleGlyph}>▤</Text>
          </View>
        </View>

        <View style={styles.balanceBlock}>
          <Text style={styles.accountLabel}>Personal · SGD</Text>
          <Text style={styles.balance}>$18</Text>
          <Pressable style={styles.accountsPill}>
            <Text style={styles.accountsLabel}>Accounts</Text>
          </Pressable>
        </View>

        <View style={styles.dots}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>

        <View style={styles.actionRow}>
          {ACTIONS.map((action) => (
            <View key={action.label} style={styles.action}>
              <View style={styles.actionCircle}>
                <Text style={styles.actionGlyph}>{action.glyph}</Text>
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.txRow}>
            <View style={styles.flagStack}>
              <Text style={styles.flagBack}>🇸🇬</Text>
              <Text style={styles.flagFront}>🇺🇸</Text>
            </View>
            <View style={styles.txText}>
              <Text style={styles.txTitle}>SGD → USD</Text>
              <Text style={styles.txTime}>Today, 23:27</Text>
            </View>
            <View style={styles.txAmounts}>
              <Text style={styles.txAmount}>-$2</Text>
              <Text style={styles.txSecondary}>+US$1.49</Text>
            </View>
          </View>

          <View style={styles.txRow}>
            <View style={styles.appleIcon}>
              <Text style={styles.appleGlyph}></Text>
            </View>
            <View style={styles.txText}>
              <Text style={styles.txTitle}>Money added via Apple Pay</Text>
              <Text style={styles.txTime}>Today, 23:17</Text>
            </View>
            <View style={styles.txAmounts}>
              <Text style={styles.txAmount}>+$20</Text>
            </View>
          </View>

          <Pressable style={styles.seeAll}>
            <Text style={styles.seeAllLabel}>See all</Text>
          </Pressable>
        </View>

        <View style={styles.productsCard}>
          <Text style={styles.productsLabel}>Products for you ›</Text>
        </View>
      </ScrollView>
      ) : null}

      {SHOW_CONTENT ? (
      <View style={styles.tabBar}>
        {TABS.map((tab, index) => (
          <View key={tab.label} style={styles.tab}>
            <Text style={[styles.tabGlyph, index === 0 ? styles.tabGlyphActive : null]}>
              {tab.glyph}
            </Text>
            <Text style={[styles.tabLabel, index === 0 ? styles.tabLabelActive : null]}>
              {tab.label}
            </Text>
          </View>
        ))}
      </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#05050D',
  },
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 620,
  },
  band: {
    flex: 1,
  },
  isolatedClose: {
    position: 'absolute',
    right: 16,
    top: 60,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  isolatedCloseGlyph: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  scroll: {
    paddingTop: 60,
    paddingBottom: 24,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGlyph: {
    fontSize: 20,
  },
  avatarDot: {
    position: 'absolute',
    top: 0,
    right: 2,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
  },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 14,
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  searchIcon: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  searchLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
  },
  topCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCircleGlyph: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  balanceBlock: {
    alignItems: 'center',
    marginTop: 60,
  },
  accountLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 17,
    fontWeight: '500',
  },
  balance: {
    color: '#FFFFFF',
    fontSize: 64,
    fontWeight: '700',
    marginTop: 4,
  },
  accountsPill: {
    marginTop: 16,
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  accountsLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '500',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 52,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    marginTop: 40,
  },
  action: {
    alignItems: 'center',
    gap: 10,
  },
  actionCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionGlyph: {
    color: '#FFFFFF',
    fontSize: 24,
  },
  actionLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  card: {
    marginTop: 28,
    marginHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#14141F',
    paddingVertical: 6,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  flagStack: {
    width: 46,
    height: 46,
  },
  flagBack: {
    fontSize: 26,
  },
  flagFront: {
    position: 'absolute',
    left: 12,
    top: 14,
    fontSize: 26,
  },
  appleIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleGlyph: {
    color: '#FFFFFF',
    fontSize: 24,
  },
  txText: {
    flex: 1,
  },
  txTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  txTime: {
    color: '#8E8E9A',
    fontSize: 14,
    marginTop: 3,
  },
  txAmounts: {
    alignItems: 'flex-end',
  },
  txAmount: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  txSecondary: {
    color: '#8E8E9A',
    fontSize: 14,
    marginTop: 3,
  },
  seeAll: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  seeAllLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  productsCard: {
    marginTop: 14,
    marginHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#14141F',
    padding: 20,
  },
  productsLabel: {
    color: '#C9C9D2',
    fontSize: 16,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0C0C15',
    paddingTop: 10,
    paddingBottom: 26,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  tabGlyph: {
    color: '#6E6E7A',
    fontSize: 20,
  },
  tabGlyphActive: {
    color: '#FFFFFF',
  },
  tabLabel: {
    color: '#6E6E7A',
    fontSize: 11,
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
});
