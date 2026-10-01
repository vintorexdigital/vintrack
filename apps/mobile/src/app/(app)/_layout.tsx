import { Tabs } from 'expo-router/js-tabs';
import { Text, type ColorValue } from 'react-native';
import { useSession } from '@/session';
import { usePalette } from '@/theme';

const glyph = (g: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }} accessible={false}>{g}</Text>;

export default function AppLayout() {
  const p = usePalette();
  const { me } = useSession();
  const has = (m: string) => !me || m === 'core' || me.modules.includes(m);
  return (
    <Tabs screenOptions={{ headerStyle: { backgroundColor: p.surface }, headerTitleStyle: { color: p.ink }, tabBarStyle: { backgroundColor: p.surface, borderTopColor: p.rule, minHeight: 56 }, tabBarActiveTintColor: p.brand, tabBarInactiveTintColor: p.muted, tabBarLabelStyle: { fontSize: 12 } }}>
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: glyph('●') }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks', tabBarIcon: glyph('✓'), href: has('tasks') ? undefined : null }} />
      <Tabs.Screen name="leave" options={{ title: 'Leave', tabBarIcon: glyph('☼'), href: has('leave') ? undefined : null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: glyph('☺') }} />
    </Tabs>
  );
}
