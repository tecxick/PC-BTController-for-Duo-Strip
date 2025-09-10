const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      // enable web bluetooth support
      experimentalFeatures: true,
    },
  });

  // store pending select callbacks until renderer replies
  const pendingSelectCallbacks = new Map();

  // allow bluetooth permission requests
  const ses = mainWindow.webContents.session;
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    if (
      permission === "bluetooth" ||
      permission === "bluetoothDevices" ||
      permission === "bluetoothScanning"
    ) {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Intercept the platform chooser and forward device lists to renderer
  mainWindow.webContents.on(
    "select-bluetooth-device",
    (event, deviceList, callback) => {
      event.preventDefault();

      const devices = (Array.isArray(deviceList) ? deviceList : []).map(
        (d) => ({
          id: d.deviceId || d.id || "",
          name: d.deviceName || d.name || "Unknown device",
        })
      );

      const reqId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      pendingSelectCallbacks.set(reqId, callback);

      // send device list (may be multiple devices) to renderer for in-app list merging
      mainWindow.webContents.send("bluetooth-device-list", {
        requestId: reqId,
        devices,
      });
      // do not call the callback here; wait for renderer selection
    }
  );

  // renderer calls this to forward the user's pick (deviceId or '' for cancel)
  ipcMain.handle("bluetooth-select", (event, { requestId, deviceId }) => {
    const cb = pendingSelectCallbacks.get(requestId);
    if (typeof cb === "function") {
      try {
        cb(deviceId || "");
      } catch (e) {
        console.error("Error invoking select callback:", e);
      }
      pendingSelectCallbacks.delete(requestId);
    } else {
      console.warn("No pending callback for requestId:", requestId);
    }
    return true;
  });

  mainWindow.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();
});
