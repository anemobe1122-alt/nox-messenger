const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("noxDesktop", {
  isDesktop: true,
  platform: process.platform
});
