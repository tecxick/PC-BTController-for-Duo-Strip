let ledCharacteristic = null;
let gattServer = null;
let connectedDeviceId = null;
let connectedDeviceName = null;

// Track current color (default white)
let currentColor = { r: 255, g: 255, b: 255 };

const statusElement = document.getElementById("status");
const connectButton = document.getElementById("connectButton");
const scanButton = document.getElementById("scanButton");
const disconnectButton = document.getElementById("disconnectButton");
const commandButtons = document.querySelectorAll(
  "button:not(#connectButton):not(#disconnectButton):not(#scanButton)"
);
const deviceListEl = document.getElementById("deviceList");
const brightnessSlider = document.getElementById("brightnessSlider");
const colorPicker = document.getElementById("colorPicker");
const patternSelect = document.getElementById("patternSelect");

// simple map of discovered devices { id -> { id, name, lastSeen } }
const discovered = new Map();
let currentRequestId = null;

// Disable command buttons initially
commandButtons.forEach((button) => (button.disabled = true));
disconnectButton.disabled = true;

connectButton.addEventListener("click", connectToLed); // original chooser flow
scanButton.addEventListener("click", scanForDevices);
disconnectButton.addEventListener("click", disconnectFromLed);

// listen for device lists sent from main (select-bluetooth-device interception)
if (window.ledAPI && window.ledAPI.onDeviceList) {
  window.ledAPI.onDeviceList(({ requestId, devices }) => {
    // merge incoming devices into discovered map and update UI
    let added = 0;
    devices.forEach((d) => {
      if (!d.id) return;
      if (!discovered.has(d.id)) {
        discovered.set(d.id, { id: d.id, name: d.name, lastSeen: Date.now() });
        added++;
        appendDeviceToList(d.id, d.name, requestId);
      } else {
        // update lastSeen and optional name
        const entry = discovered.get(d.id);
        entry.lastSeen = Date.now();
        if (!entry.name && d.name) entry.name = d.name;
      }
    });
    // remember the request id so click on list can call back main
    currentRequestId = requestId;
    if (added === 0) updateStatus("Scan returned devices (none new).");
    else updateStatus(`Scan returned ${added} new device(s).`);
  });
}

function appendDeviceToList(id, name, requestId) {
  const el = document.createElement("div");
  el.className = "device-item";
  el.dataset.id = id;
  // container for label and tick
  const label = document.createElement("span");
  label.className = "device-label";
  label.textContent = `${name} ${id ? `(${id})` : ""}`;

  const tick = document.createElement("span");
  tick.className = "device-tick";
  tick.style.float = "right";
  tick.style.color = "green";
  tick.style.fontWeight = "700";
  tick.style.display = "none";
  tick.textContent = "✓";

  el.appendChild(label);
  el.appendChild(tick);

  el.addEventListener("click", async () => {
    updateStatus(`Connecting to ${name || id}...`);
    // If we have a pending requestId (from main) use it to resume requestDevice.
    if (currentRequestId) {
      // send selection to main to finish the requestDevice promise
      try {
        await window.ledAPI.selectDevice(currentRequestId, id);
      } catch (e) {
        console.error("selectDevice error:", e);
      }
      // try to connect using getDevices() fallback:
      try {
        const devices = await navigator.bluetooth.getDevices();
        const device = devices.find((d) => d.id === id || d.deviceId === id);
        if (device) {
          gattServer = await device.gatt.connect();
          device.addEventListener("gattserverdisconnected", onDisconnected);
          const service = await gattServer.getPrimaryService(
            "0000fff0-0000-1000-8000-00805f9b34fb"
          );
          ledCharacteristic = await service.getCharacteristic(
            "0000fff4-0000-1000-8000-00805f9b34fb"
          );

          // record connected device and update UI tick/name
          connectedDeviceId = device.id;
          connectedDeviceName = device.name || name || device.id;
          markConnectedDevice(connectedDeviceId);

          enableCommands();
          updateStatus(`Connected: ${connectedDeviceName}`);
          try {
            localStorage.setItem("btDeviceId", device.id);
          } catch (_) {}
          return;
        }
      } catch (e) {
        console.warn("getDevices/connect fallback failed:", e);
      }
    }

    // If no pending requestId or fallback failed, show message
    updateStatus(
      "Unable to connect automatically. Use Connect (chooser) to complete.",
      true
    );
  });
  deviceListEl.appendChild(el);
}

function markConnectedDevice(id) {
  // clear previous marks
  document
    .querySelectorAll(".device-tick")
    .forEach((t) => (t.style.display = "none"));
  if (!id) return;
  // find element for id and show tick
  const el = Array.from(document.querySelectorAll(".device-item")).find(
    (x) => x.dataset.id === id
  );
  if (el) {
    const tick = el.querySelector(".device-tick");
    if (tick) tick.style.display = "inline";
  }
}

function unmarkConnectedDevice() {
  document
    .querySelectorAll(".device-tick")
    .forEach((t) => (t.style.display = "none"));
}

async function scanForDevices() {
  updateStatus("Starting scan (will show devices in list)...");
  try {
    // This triggers platform chooser interception (main will forward list to renderer)
    await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ["0000fff0-0000-1000-8000-00805f9b34fb"],
    });
    // requestDevice returns only after selection/cancel; we don't rely on its result here
  } catch (err) {
    // user cancelled or error — keep UI intact
    updateStatus(`Scan failed / cancelled: ${err.message}`, true);
  }
}

function updateStatus(message, isError = false) {
  statusElement.textContent = `Status: ${message}`;
  statusElement.className = isError ? "error" : "success";
}

function enableCommands() {
  commandButtons.forEach((button) => (button.disabled = false));
  connectButton.disabled = true;
  brightnessSlider.disabled = false;
  disconnectButton.disabled = false;
  colorPicker.disabled = false;
}

function disableCommands() {
  commandButtons.forEach((button) => (button.disabled = true));
  connectButton.disabled = false;
  brightnessSlider.disabled = true;
  disconnectButton.disabled = true;
  colorPicker.disabled = true;
}

async function findWritableCharacteristicFromService(service) {
  try {
    const chars = await service.getCharacteristics();
    for (const c of chars) {
      const props = c.properties || {};
      if (props.write || props.writeWithoutResponse) return c;
    }
  } catch (e) {
    console.warn(
      "Failed enumerate characteristics for service",
      service.uuid,
      e
    );
  }
  return null;
}

async function findWritableCharacteristic(gattServer, preferredServiceUuid) {
  // try preferred service first
  try {
    if (preferredServiceUuid) {
      try {
        const service = await gattServer.getPrimaryService(
          preferredServiceUuid
        );
        const c = await findWritableCharacteristicFromService(service);
        if (c) return c;
      } catch (_) {
        // preferred service not present
      }
    }

    // enumerate all services and find writable char
    const services = await gattServer.getPrimaryServices();
    for (const s of services) {
      const c = await findWritableCharacteristicFromService(s);
      if (c) {
        console.log(
          "Found writable characteristic",
          c.uuid,
          "in service",
          s.uuid
        );
        return c;
      }
    }
  } catch (e) {
    console.error("Error searching writable characteristic:", e);
  }
  return null;
}

// replace the rigid characteristic lookup inside connectToLed()
async function connectToLed() {
  updateStatus("Connecting...");
  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ["0000fff0-0000-1000-8000-00805f9b34fb"],
    });

    gattServer = await device.gatt.connect();

    device.addEventListener("gattserverdisconnected", onDisconnected);

    try {
      localStorage.setItem("btDeviceId", device.id);
    } catch (_) {}

    // find a writable characteristic (prefer the known service if present)
    ledCharacteristic = await findWritableCharacteristic(
      gattServer,
      "0000fff0-0000-1000-8000-00805f9b34fb"
    );

    if (!ledCharacteristic) {
      updateStatus(
        "No writable characteristic found. See console for services/characteristics.",
        true
      );
      return;
    }

    // save connected device info and update UI
    connectedDeviceId = device.id;
    connectedDeviceName = device.name || device.id;
    markConnectedDevice(connectedDeviceId);
    updateStatus(`Connected: ${connectedDeviceName}`);

    console.log(
      "Using characteristic",
      ledCharacteristic.uuid,
      "props",
      ledCharacteristic.properties
    );
    enableCommands();
  } catch (error) {
    updateStatus(`Connection failed: ${error.message}`, true);
    console.error("BLE error:", error);
  }
}

async function disconnectFromLed() {
  if (gattServer && gattServer.connected) {
    gattServer.disconnect();
    updateStatus("Disconnected.");
    disableCommands();
  }
}

function onDisconnected() {
  updateStatus("Disconnected.", true);
  ledCharacteristic = null;
  gattServer = null;
  connectedDeviceId = null;
  connectedDeviceName = null;
  unmarkConnectedDevice();
  disableCommands();
}

// Try to auto-connect to a previously remembered device on load.
async function tryAutoConnect() {
  const storedId = localStorage.getItem("btDeviceId");
  if (!storedId) return;
  updateStatus("Restoring connection...");
  try {
    // getDevices() returns previously-granted devices without prompting
    const devices = await navigator.bluetooth.getDevices();
    const device = devices.find(
      (d) => d.id === storedId || d.deviceId === storedId
    );
    if (!device) {
      updateStatus(
        "Saved device not available. Use Connect/Browse to select.",
        true
      );
      return;
    }

    gattServer = await device.gatt.connect();
    device.addEventListener("gattserverdisconnected", onDisconnected);

    ledCharacteristic = await findWritableCharacteristic(
      gattServer,
      "0000fff0-0000-1000-8000-00805f9b34fb"
    );
    if (!ledCharacteristic) {
      updateStatus(
        "Auto-connect: no writable characteristic found. See console.",
        true
      );
      return;
    }

    console.log(
      "Auto-connected using characteristic",
      ledCharacteristic.uuid,
      ledCharacteristic.properties
    );
    enableCommands();
    updateStatus("Auto-connected to remembered device");
  } catch (err) {
    updateStatus(`Auto-connect failed: ${err.message}`, true);
    console.error("Auto-connect error:", err);
  }
}

// ----------------------
// COLOR & BRIGHTNESS LOGIC
// ----------------------

// Apply brightness scaling to given color
function applyBrightness(r, g, b) {
  const brightness = brightnessSlider.value / 100; // 0.0 - 1.0
  const scaledR = Math.round(r * brightness);
  const scaledG = Math.round(g * brightness);
  const scaledB = Math.round(b * brightness);
  return { r: scaledR, g: scaledG, b: scaledB };
}

// Set static color and apply current brightness
function setStaticColor(r, g, b) {
  currentColor = { r, g, b }; // Save chosen color
  const { r: br, g: bg, b: bb } = applyBrightness(r, g, b);
  sendCommand([0x7e, 0x07, 0x05, 0x03, br, bg, bb, 0xef]);
}

// Update current color with new brightness
function updateBrightness() {
  const { r, g, b } = currentColor;
  const { r: br, g: bg, b: bb } = applyBrightness(r, g, b);
  console.log("Brightness update:", br, bg, bb);
  sendCommand([0x7e, 0x07, 0x05, 0x03, br, bg, bb, 0xef]);
}
// pattern selection
function setPattern(code) {
  sendCommand([0x7e, 0x00, 0x03, code, 0x03, 0x00, 0x00, 0x00, 0xef]);
}

// run auto-connect after script loads
tryAutoConnect();

// ----------------------
// EVENT LISTENERS
// ----------------------

// after your element queries and before disabling command buttons, add listeners:
document.getElementById("powerOn").addEventListener("click", () => {
  console.log("powerOn clicked");
  sendCommand([0x7e, 0x04, 0x04, 0x01, 0xff, 0x00, 0xef]);
});
document.getElementById("powerOff").addEventListener("click", () => {
  console.log("powerOff clicked");
  sendCommand([0x7e, 0x04, 0x04, 0x00, 0xff, 0x00, 0xef]);
});

document.getElementById("red").addEventListener("click", () => {
  console.log("Red clicked");
  setStaticColor(0xff, 0x00, 0x00);
});

document.getElementById("green").addEventListener("click", () => {
  console.log("Green clicked");
  setStaticColor(0x00, 0xff, 0x00);
});

document.getElementById("blue").addEventListener("click", () => {
  console.log("Blue clicked");
  setStaticColor(0x00, 0x00, 0xff);
});

// color picker
colorPicker.addEventListener("input", (event) => {
  const hex = event.target.value; // e.g. "#ff00ff"
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);

  console.log("Picked color:", hex, "→", r, g, b);
  setStaticColor(r, g, b);
});

// Brightness slider
brightnessSlider.addEventListener("input", () => {
  updateBrightness();
});

// Pattern select dropdown
patternSelect.addEventListener("change", (event) => {
  const selectedIndex = parseInt(event.target.value, 10); // 0–15
  const code = 0x8d + selectedIndex;
  console.log(
    `Pattern selected: index=${selectedIndex}, code=0x${code.toString(16)}`
  );
  setPattern(code);
});

// when you obtain the characteristic, log its properties for debugging
// e.g. inside connectToLed() after ledCharacteristic is set:
console.log("LED characteristic properties:", ledCharacteristic?.properties);

// replace sendCommand with the version below so it picks the supported write method
async function sendCommand(cmdArray) {
  if (!ledCharacteristic) {
    updateStatus("Not connected. Please connect first.", true);
    return;
  }

  const buffer = new Uint8Array(cmdArray);
  console.log(
    "Sending command to",
    connectedDeviceName || connectedDeviceId,
    "buffer:",
    Array.from(buffer)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" "),
    "char:",
    ledCharacteristic.uuid,
    "props:",
    ledCharacteristic.properties
  );

  // Try to write using the best available method, with fallbacks.
  try {
    // If both are available, prefer write (with response) first for reliability
    if (
      ledCharacteristic.properties?.write &&
      ledCharacteristic.properties?.writeWithoutResponse
    ) {
      try {
        await ledCharacteristic.writeValue(buffer);
      } catch (e) {
        console.warn("writeValue failed, trying writeValueWithoutResponse:", e);
        await ledCharacteristic.writeValueWithoutResponse(buffer);
      }
    } else if (ledCharacteristic.properties?.write) {
      await ledCharacteristic.writeValue(buffer);
    } else if (ledCharacteristic.properties?.writeWithoutResponse) {
      await ledCharacteristic.writeValueWithoutResponse(buffer);
    } else {
      updateStatus("Characteristic not writable (no write property).", true);
      console.error("Characteristic properties:", ledCharacteristic.properties);
      return;
    }

    updateStatus("Command sent!", false);
  } catch (error) {
    updateStatus(`Failed to send command: ${error.message}`, true);
    console.error(
      "BLE write error:",
      error,
      "char props:",
      ledCharacteristic?.properties
    );
    if (!gattServer || !gattServer.connected) onDisconnected();
  }
}
