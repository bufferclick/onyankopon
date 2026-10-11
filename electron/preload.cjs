/**
 * The only bridge between the renderer and the desktop shell.
 * Everything the game is allowed to touch is listed here — nothing else is
 * exposed, and `contextIsolation` stays on.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  /** true when running inside the packaged/installed app */
  get available() { return true; },
  info: () => ipcRenderer.invoke('desktop:info'),
  minimize: () => ipcRenderer.send('desktop:minimize'),
  maximize: () => ipcRenderer.send('desktop:maximize'),
  close: () => ipcRenderer.send('desktop:close'),
  isMaximized: () => ipcRenderer.invoke('desktop:isMaximized'),
  fullscreen: (on) => ipcRenderer.invoke('desktop:fullscreen', on),
  /** save a data: url png to Pictures/Kitsuna no Akuma and reveal it */
  screenshot: (dataUrl) => ipcRenderer.invoke('desktop:screenshot', dataUrl),
  chooseDir: () => ipcRenderer.invoke('desktop:chooseDir'),
  onFullscreen: (fn) => ipcRenderer.on('desktop:fullscreen', (_e, v) => fn(v)),
});
