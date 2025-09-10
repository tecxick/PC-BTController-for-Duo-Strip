const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ledAPI", {
  sendCommand: (cmdArray) => ipcRenderer.invoke("ble-command", cmdArray),
  onDeviceList: (fn) => {
    ipcRenderer.on("bluetooth-device-list", (event, data) => {
      try {
        fn(data);
      } catch (e) {
        console.error(e);
      }
    });
  },
  selectDevice: (requestId, deviceId) =>
    ipcRenderer.invoke("bluetooth-select", { requestId, deviceId }),
});
