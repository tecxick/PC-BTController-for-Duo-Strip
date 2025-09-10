const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ledAPI", {
  sendCommand: (cmdArray) => ipcRenderer.invoke("ble-command", cmdArray)
});
