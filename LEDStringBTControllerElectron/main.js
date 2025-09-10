const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.loadFile("index.html");

  mainWindow.webContents.on('select-bluetooth-device', async (event, deviceList, callback) => {
    event.preventDefault();
    
    // Create an array of device names for the dialog
    const deviceNames = deviceList.map(device => device.deviceName);
    
    // Show a dialog to the user to select a device
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'Select a Bluetooth Device',
      message: 'Please choose a Bluetooth device to connect to:',
      buttons: deviceNames,
      cancelId: deviceNames.length,
    });

    if (response === deviceNames.length) {
      // User clicked "Cancel" or closed the dialog
     callback('');
    } else {
      // User selected a device, find the corresponding deviceId
      const selectedDeviceId = deviceList[response].deviceId;
      callback(selectedDeviceId);
    }
  });
}

app.whenReady().then(() => {
  createWindow();
});