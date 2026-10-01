import { contextBridge, ipcRenderer } from 'electron';

/** The only things the window can ask the main process to do. No Node access in the page. */
contextBridge.exposeInMainWorld('trackrex', {
  state: (): Promise<unknown> => ipcRenderer.invoke('agent:state'),
  signIn: (v: { tenant: string; identifier: string; password: string }): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke('agent:sign-in', v),
  signOut: (): Promise<void> => ipcRenderer.invoke('agent:sign-out'),
  onState: (fn: (s: unknown) => void): void => { ipcRenderer.on('agent:state', (_e, s) => fn(s)); },
});
