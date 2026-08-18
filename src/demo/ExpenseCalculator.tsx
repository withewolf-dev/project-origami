import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * Tuner demo screen (dev-only route): a Revolut-style expense calculator,
 * rebuilt in pure RN as a realistic tuning target — a dozen distinct
 * surfaces, pills, a keypad grid, and a display hierarchy. Every style is a
 * literal on purpose: the whole screen is editable by the tuner.
 */

type Props = {
  onClose: () => void;
};

/** Left-to-right evaluation, the way pocket calculators do it. */
function compute(tokens: string[]): number {
  let total = parseFloat(tokens[0] ?? '0') || 0;
  for (let i = 1; i < tokens.length - 1; i += 2) {
    const value = parseFloat(tokens[i + 1] ?? '');
    if (Number.isNaN(value)) continue;
    const op = tokens[i];
    if (op === '+') total += value;
    else if (op === '−') total -= value;
    else if (op === '×') total *= value;
    else if (op === '÷' && value !== 0) total /= value;
  }
  return total;
}

function formatAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace('.', ',');
}

const KEY_ROWS = [
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '−'],
  [',', '0', '⌫', '+'],
] as const;

const OPS = new Set(['+', '−', '×', '÷']);

export function ExpenseCalculator({ onClose }: Props) {
  const [tokens, setTokens] = useState<string[]>(['75', '+', '50']);

  const press = (key: string) => {
    setTokens((current) => {
      const next = [...current];
      const last = next[next.length - 1] ?? '';
      if (OPS.has(key)) {
        if (OPS.has(last)) next[next.length - 1] = key;
        else next.push(key);
      } else if (key === '⌫') {
        if (last.length > 1) next[next.length - 1] = last.slice(0, -1);
        else next.pop();
        if (next.length === 0) next.push('0');
      } else if (key === ',') {
        if (!OPS.has(last) && !last.includes('.')) next[next.length - 1] = `${last}.`;
      } else if (OPS.has(last)) {
        next.push(key);
      } else {
        next[next.length - 1] = last === '0' ? key : `${last}${key}`;
      }
      return next;
    });
  };

  const total = compute(tokens);
  const expression = tokens.join(' ').replace(/\./g, ',');
  const usd = (total * 1.164).toFixed(2).replace('.', ',');

  return (
    <View style={styles.screen}>
      <View style={styles.navRow}>
        <Pressable style={styles.circleButton} onPress={onClose}>
          <Text style={styles.circleGlyph}>✕</Text>
        </Pressable>

        <View style={styles.modePill}>
          <View style={styles.modeChip}>
            <View style={styles.modeIconCircle}>
              <Text style={styles.modeIconGlyph}>↗</Text>
            </View>
            <Text style={styles.modeLabel}>Expense</Text>
          </View>
          <View style={styles.modeMiniCircle}>
            <Text style={styles.modeMiniGlyph}>↙</Text>
          </View>
          <View style={styles.modeMiniCircle}>
            <Text style={styles.modeMiniGlyph}>⇄</Text>
          </View>
        </View>

        <Pressable style={styles.circleButton}>
          <Text style={styles.circleGlyph}>⋯</Text>
        </Pressable>
      </View>

      <View style={styles.accountRow}>
        <View style={styles.accountPill}>
          <View style={styles.accountLogo}>
            <Text style={styles.accountLogoGlyph}>R</Text>
          </View>
          <View>
            <Text style={styles.accountName}>Revolut</Text>
            <Text style={styles.accountBalance}>$3 437,23</Text>
          </View>
        </View>
        <View style={styles.currencyPill}>
          <Text style={styles.currencyFlag}>🇪🇺</Text>
          <Text style={styles.currencyCode}>€</Text>
        </View>
      </View>

      <View style={styles.display}>
        <View style={styles.expressionPill}>
          <Text style={styles.expressionText}>{expression}</Text>
        </View>
        <Text style={styles.amount}>
          <Text style={styles.amountSymbol}>€</Text>
          {formatAmount(total)}
        </Text>
        <View style={styles.ratePill}>
          <Text style={styles.rateText}>⟳ ${usd} (€1 = $1,164) ›</Text>
        </View>
      </View>

      <View style={styles.toolsRow}>
        <View style={styles.todayPill}>
          <Text style={styles.todayGlyph}>🗓</Text>
          <Text style={styles.todayLabel}>Today</Text>
        </View>
        <View style={styles.toolCircle}>
          <Text style={styles.toolGlyph}>↺</Text>
        </View>
        <View style={styles.toolsSpacer} />
        <View style={styles.stickerCircle}>
          <Text style={styles.toolGlyph}>▢</Text>
        </View>
      </View>

      <View style={styles.keypad}>
        {KEY_ROWS.map((row) => (
          <View key={row.join('')} style={styles.keyRow}>
            {row.map((key) => (
              <Pressable key={key} style={styles.key} onPress={() => press(key)}>
                <Text style={OPS.has(key) ? styles.keyOpGlyph : styles.keyGlyph}>{key}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: 64,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  circleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleGlyph: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 26,
    padding: 6,
    gap: 8,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  modeIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeIconGlyph: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
  modeLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  modeMiniCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3A3A3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeMiniGlyph: {
    color: '#AEAEB2',
    fontSize: 13,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 18,
  },
  accountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 26,
    padding: 6,
    paddingRight: 16,
    gap: 10,
  },
  accountLogo: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#000000',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountLogoGlyph: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  accountName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  accountBalance: {
    color: '#8E8E93',
    fontSize: 12,
  },
  currencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  currencyFlag: {
    fontSize: 14,
  },
  currencyCode: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  display: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  expressionPill: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  expressionText: {
    color: '#8E8E93',
    fontSize: 15,
  },
  amount: {
    color: '#FFFFFF',
    fontSize: 76,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  amountSymbol: {
    color: '#8E8E93',
    fontSize: 56,
    fontWeight: '700',
  },
  ratePill: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  rateText: {
    color: '#8E8E93',
    fontSize: 14,
  },
  toolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 14,
  },
  todayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3A3A3C',
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  todayGlyph: {
    fontSize: 14,
  },
  todayLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  toolCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#3A3A3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolsSpacer: {
    flex: 1,
  },
  stickerCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolGlyph: {
    color: '#FFFFFF',
    fontSize: 17,
  },
  keypad: {
    paddingHorizontal: 10,
    paddingBottom: 34,
  },
  keyRow: {
    flexDirection: 'row',
  },
  key: {
    flex: 1,
    height: 62,
    margin: 5,
    borderRadius: 18,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyGlyph: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '500',
  },
  keyOpGlyph: {
    color: '#FFFFFF',
    fontSize: 25,
  },
});
