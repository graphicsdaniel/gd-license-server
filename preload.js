'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clip', {
  getState: () => ipcRenderer.invoke('get-state'),
  paste: (id, opts) => ipcRenderer.invoke('paste', id, opts),
  remove: (id) => ipcRenderer.invoke('remove', id),
  pin: (id) => ipcRenderer.invoke('pin', id),
  clear: () => ipcRenderer.invoke('clear'),
  hide: () => ipcRenderer.invoke('hide'),
  onState: (fn) => ipcRenderer.on('state', (_e, s) => fn(s)),
  onShown: (fn) => ipcRenderer.on('shown', () => fn()),
});
