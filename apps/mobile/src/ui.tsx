import { ActivityIndicator, Pressable, StyleSheet, Text, View, type PressableProps, type TextProps, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { useFonts } from 'expo-font';
import { TOUCH, space, usePalette } from './theme';

const WORDMARK_COLORS = ['#4285F4', '#EA4335', '#FBBC05', '#34A853'];

export const BRAND_TAGLINE = 'Track It Easy';

/** The Trackrex name in its brand lettering (Google Sans, four colours in turn), optionally with the tagline under it. Needs a light background. */
export function Wordmark({ size = 28, tagline }: { size?: number; tagline?: boolean }) {
  const p = usePalette();
  const [loaded] = useFonts({
    TrackrexWordmark: require('../assets/fonts/google-sans-wordmark.ttf'),
    TrackrexTagline: require('../assets/fonts/google-sans-tagline.ttf'),
  });
  const taglineSize = Math.max(11, Math.round(size * 0.36));
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={tagline ? `Trackrex, ${BRAND_TAGLINE}` : 'Trackrex'} style={{ alignItems: 'flex-start', gap: size * 0.12 }}>
      <Text style={{ fontSize: size, lineHeight: size * 1.15, letterSpacing: -0.04 * size, ...(loaded ? { fontFamily: 'TrackrexWordmark' } : { fontWeight: '700' }) }}>
        {[...'Trackrex'].map((ch, i) => <Text key={i} style={{ color: WORDMARK_COLORS[i % 4] }}>{ch}</Text>)}
      </Text>
      {tagline ? (
        <Text style={{ fontSize: taglineSize, lineHeight: taglineSize * 1.2, letterSpacing: 0.08 * taglineSize, color: p.muted, paddingLeft: 0.1 * taglineSize, ...(loaded ? { fontFamily: 'TrackrexTagline' } : { fontWeight: '500' }) }}>{BRAND_TAGLINE}</Text>
      ) : null}
    </View>
  );
}

export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const p = usePalette();
  return <View style={[{ flex: 1, backgroundColor: p.canvas, padding: space.md, gap: space.md }, style]}>{children}</View>;
}

export function T({ style, muted, bold, size = 16, ...rest }: TextProps & { muted?: boolean; bold?: boolean; size?: number }) {
  const p = usePalette();
  return <Text {...rest} style={[{ color: muted ? p.muted : p.ink, fontSize: size, fontWeight: bold ? '600' : '400' }, style]} />;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const p = usePalette();
  return <View style={[{ backgroundColor: p.surface, borderColor: p.rule, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: space.md, gap: space.sm }, style]}>{children}</View>;
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, ...rest }: Omit<PressableProps, 'children'> & { title: string; variant?: 'primary' | 'secondary' | 'danger'; loading?: boolean }) {
  const p = usePalette();
  const bg = variant === 'primary' ? p.brand : variant === 'danger' ? p.absent : p.surface;
  const fg = variant === 'secondary' ? p.ink : p.onBrand;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled || loading} onPress={onPress} {...rest}
      style={({ pressed }) => ({ minHeight: TOUCH, borderRadius: 10, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, borderWidth: variant === 'secondary' ? 1 : 0, borderColor: p.rule })}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontSize: 16, fontWeight: '600' }}>{title}</Text>}
    </Pressable>
  );
}

export function Banner({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode }) {
  const p = usePalette();
  const c = tone === 'error' ? p.absent : tone === 'warn' ? p.late : p.pending;
  return <View accessibilityRole="alert" style={{ borderLeftWidth: 4, borderLeftColor: c, backgroundColor: p.surface, padding: space.sm + 4, borderRadius: 8 }}><Text style={{ color: p.ink, fontSize: 14 }}>{children}</Text></View>;
}

export const Row = ({ children, style }: { children: ReactNode; style?: ViewStyle }) => <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.sm }, style]}>{children}</View>;
