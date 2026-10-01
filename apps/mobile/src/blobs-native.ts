import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import type { BlobStore } from './core';

const name = (id: string) => `trk-blob-${id.replace(/[^A-Za-z0-9-]/g, '')}.b64`;

/** Photos waiting to upload live in the app's document folder on a device (localStorage in the browser build). */
export const deviceBlobs: BlobStore = Platform.OS === 'web'
  ? {
      put: async (id, v) => { localStorage.setItem(name(id), v); },
      get: async (id) => localStorage.getItem(name(id)),
      remove: async (id) => { localStorage.removeItem(name(id)); },
    }
  : {
      put: async (id, v) => { new File(Paths.document, name(id)).write(v); },
      get: async (id) => { const f = new File(Paths.document, name(id)); return f.exists ? f.text() : null; },
      remove: async (id) => { const f = new File(Paths.document, name(id)); if (f.exists) f.delete(); },
    };
