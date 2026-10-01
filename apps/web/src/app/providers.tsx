'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@trackrex/ui';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/shared/api/client';
import { AuthProvider } from '@/shared/auth/auth';
import { I18nProvider } from '@/shared/i18n/i18n';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: false,
        retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      },
    },
  }));
  return (
    <QueryClientProvider client={client}>
      <I18nProvider>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
