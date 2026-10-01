import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SessionProvider, useSession } from '@/session';
import { usePalette } from '@/theme';

function Guard() {
  const { status } = useSession();
  const path = usePathname();
  const p = usePalette();
  if (status === 'loading') return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: p.canvas }}><ActivityIndicator color={p.brand} /></View>;
  if (status === 'anonymous' && path !== '/sign-in') return <Redirect href="/sign-in" />;
  if (status === 'authenticated' && path === '/sign-in') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } });

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <StatusBar style="auto" />
        <Guard />
      </SessionProvider>
    </QueryClientProvider>
  );
}
