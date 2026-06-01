// Preload for future native APIs
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('norai', { platform: process.platform });
