import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { KeyValueStore } from '@trackrex/client-core';

const KEY = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

/** Secure store on devices (Keychain and Keystore). The browser build, used for development checks, uses localStorage. */
export const deviceStore: KeyValueStore = Platform.OS === 'web'
  ? {
      get: async (k) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY(k))),
      set: async (k, v) => { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY(k), v); },
      remove: async (k) => { if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY(k)); },
    }
  : {
      get: (k) => SecureStore.getItemAsync(KEY(k)),
      set: (k, v) => SecureStore.setItemAsync(KEY(k), v),
      remove: (k) => SecureStore.deleteItemAsync(KEY(k)),
    };
