import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { ApiClient } from '@trackrex/client-core';

/**
 * Asks for notification permission and registers this phone's Expo push token with the server. Best effort and
 * silent: no permission, no EAS project id, or a simulator all simply mean no push. NOT verified on a device or
 * against Expo's push service (this environment has neither).
 */
export async function registerForPush(api: ApiClient): Promise<'registered' | 'skipped'> {
  if (Platform.OS === 'web') return 'skipped';
  try {
    const Notifications = await import('expo-notifications');
    const have = await Notifications.getPermissionsAsync();
    const granted = have.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return 'skipped';
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    if (!projectId) return 'skipped';
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.post('/v1/notifications/push-devices', { token: data, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
    return 'registered';
  } catch {
    return 'skipped';
  }
}
