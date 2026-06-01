const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('norai', {
  platform: process.platform,
  openLocationSettings: () => ipcRenderer.invoke('open-location-settings'),
  getNativeLocation: () => ipcRenderer.invoke('get-native-location'),
});
