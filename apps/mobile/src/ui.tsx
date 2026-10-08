import { ActivityIndicator, Pressable, StyleSheet, Text, View, type PressableProps, type TextProps, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { TOUCH, space, usePalette } from './theme';

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
