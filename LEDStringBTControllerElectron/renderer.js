let ledCharacteristic = null;
let gattServer = null;
let connectedDeviceId = null;
let connectedDeviceName = null;
// add a promise-based queue to serialize BLE writes and avoid concurrent GATT ops
let writeQueue = Promise.resolve();

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
const ledPreview = document.getElementById("led-preview");
const appCard = document.getElementById("app-card");
const powerButton = document.getElementById("power-button");
const powerButtonSpan = powerButton.querySelector("span");

const smoothTab = document.getElementById("smooth-tab");
const flashTab = document.getElementById("flash-tab");
const patternOptionsContainer = document.getElementById("pattern-options");

// simple map of discovered devices { id -> { id, name, lastSeen } }
let powerOn = true;
const discovered = new Map();
let currentRequestId = null;
let selectedDevice = null;
let isConnected = false;
let currentPattern = null;

// Pattern data
const patterns = {
  smooth: [
    { name: "Smooth 7 Colors", value: "0x8A", color: "#6366f1" },
    { name: "Smooth Red", value: "0x8B", color: "#ef4444" },
    { name: "Smooth Green", value: "0x8C", color: "#22c55e" },
    { name: "Smooth Blue", value: "0x8D", color: "#3b82f6" },
    { name: "Smooth Yellow", value: "0x8E", color: "#eab308" },
    { name: "Smooth Cyan", value: "0x8F", color: "#06b6d4" },
    { name: "Smooth Purple", value: "0x90", color: "#a855f7" },
    { name: "Smooth White", value: "0x91", color: "#f8fafc" },
    {
      name: "Smooth R-G",
      value: "0x92",
      color: "linear-gradient(to right, #ef4444, #22c55e)",
    },
    {
      name: "Smooth R-B",
      value: "0x93",
      color: "linear-gradient(to right, #ef4444, #3b82f6)",
    },
    {
      name: "Smooth G-B",
      value: "0x94",
      color: "linear-gradient(to right, #22c55e, #3b82f6)",
    },
  ],
  flash: [
    { name: "Flash 7 Colors", value: "0x95", color: "#6366f1" },
    { name: "Flash Red", value: "0x96", color: "#ef4444" },
    { name: "Flash Green", value: "0x97", color: "#22c55e" },
    { name: "Flash Blue", value: "0x98", color: "#3b82f6" },
    { name: "Flash Yellow", value: "0x99", color: "#eab308" },
    { name: "Flash Cyan", value: "0x9A", color: "#06b6d4" },
    { name: "Flash Purple", value: "0x9B", color: "#a855f7" },
    { name: "Flash White", value: "0x9C", color: "#f8fafc" },
  ],
};

// Function to render pattern buttons
const renderPatterns = (group) => {
  patternOptionsContainer.innerHTML = "";
  const patternGroup = patterns[group];
  patternGroup.forEach((pattern) => {
    const button = document.createElement("button");
    button.classList.add(
      "p-3",
      "rounded-xl",
      "transition-all",
      "duration-200",
      "font-semibold",
      "flex",
      "flex-col",
      "items-center",
      "justify-center",
      "gap-2"
    );
    button.style.backgroundColor = "#252541";
    button.style.border = "1px solid #4a4a75";
    button.style.boxShadow = "0 0 5px rgba(0, 229, 255, 0.2)";
    button.textContent = pattern.name;
    button.dataset.value = pattern.value;

    const colorCircle = document.createElement("div");
    colorCircle.classList.add(
      "w-8",
      "h-8",
      "rounded-full",
      "border-2",
      "border-gray-500"
    );
    if (pattern.color.startsWith("linear-gradient")) {
      colorCircle.style.background = pattern.color;
      colorCircle.style.borderColor = "#00e5ff";
    } else {
      colorCircle.style.backgroundColor = pattern.color;
      colorCircle.style.borderColor = pattern.color;
    }
    button.prepend(colorCircle);

    button.addEventListener("click", () => {
      // Deselect all buttons and select the current one
      document.querySelectorAll("#pattern-options button").forEach((btn) => {
        btn.style.boxShadow = "0 0 5px rgba(0, 229, 255, 0.2)";
        btn.style.border = "1px solid #4a4a75";
      });
      button.style.boxShadow = "0 0 15px #00e5ff";
      button.style.border = "1px solid #00e5ff";
      currentPattern = pattern.value;
      console.log(`Pattern selected: ${currentPattern}`);

      // Update preview based on pattern
      if (pattern.name.includes("Smooth")) {
        ledPreview.classList.add("pulse");
        ledPreview.style.backgroundColor = ""; // clear background for pulse
      } else {
        ledPreview.classList.remove("pulse");
        // For flash, maybe just show a solid color
        const solidColor = pattern.color.startsWith("linear-gradient")
          ? "#00e5ff"
          : pattern.color;
        ledPreview.style.backgroundColor = solidColor;
        ledPreview.style.boxShadow = `0 0 20px ${solidColor}`;
      }
    });
    patternOptionsContainer.appendChild(button);
  });
};

// Disable command buttons initially
commandButtons.forEach((button) => (button.disabled = true));
disconnectButton.disabled = true;

connectButton.addEventListener("click", connectToLed); // original chooser flow
scanButton.addEventListener("click", scanForDevices);
disconnectButton.addEventListener("click", disconnectFromLed);

// This section is for a non-browser environment like Electron.
// We'll keep a fallback for the browser.
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
  label.textContent = `${name || "Unknown Device"} ${id ? `(${id})` : ""}`;

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
          // Prefer the known service but search for any writable characteristic
          ledCharacteristic = await findWritableCharacteristic(
            gattServer,
            "0000fff0-0000-1000-8000-00805f9b34fb"
          );
          if (!ledCharacteristic) {
            console.warn(
              "Fallback: no writable characteristic found. Enumerating services for debugging..."
            );
            try {
              const services = await gattServer.getPrimaryServices();
              for (const s of services) {
                console.log("Service", s.uuid);
                const chars = await s.getCharacteristics();
                for (const c of chars) {
                  console.log(
                    "  Characteristic",
                    c.uuid,
                    "props:",
                    c.properties
                  );
                }
              }
            } catch (e) {
              console.warn("Failed to enumerate services/characteristics:", e);
            }
            updateStatus(
              "Fallback: no writable characteristic found. See console for details.",
              true
            );
            return;
          }

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
  updateStatus("Starting scan...");
  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ["0000fff0-0000-1000-8000-00805f9b34fb"],
    });

    // Clear existing list and add the new device
    deviceListEl.innerHTML = "";
    appendDeviceToList(device.id, device.name);

    // This simulates a selection and auto-connect after a successful scan
    // In a real app, you would wait for the user to click "Connect"
    updateStatus(
      `Device found: ${device.name || "Unknown Device"}. Ready to connect.`
    );
  } catch (err) {
    updateStatus(`Scan failed / cancelled: ${err.message}`, true);
    console.error("BLE error:", err);
  }
}

function updateStatus(message, isError = false) {
  statusElement.textContent = `Status: ${message}`;
  statusElement.classList.remove("status-success", "status-error");
  if (isError) {
    statusElement.classList.add("status-error");
  } else {
    statusElement.classList.add("status-success");
  }
}

function enableCommands() {
  commandButtons.forEach((button) => (button.disabled = false));
  connectButton.disabled = true;
  brightnessSlider.disabled = false;
  disconnectButton.disabled = false;
  colorPicker.disabled = false;
  appCard.classList.remove("disabled");
  ledPreview.classList.add("pulse");
}

function disableCommands() {
  // commandButtons.forEach((button) => (button.disabled = true));
  // connectButton.disabled = false;
  brightnessSlider.disabled = true;
  // disconnectButton.disabled = true;
  colorPicker.disabled = true;
  // appCard.classList.add("disabled");
  ledPreview.classList.remove("pulse");
  ledPreview.style.backgroundColor = "transparent";
  ledPreview.style.boxShadow = "none";
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
    // disableCommands();
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
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
};
// Update the LED preview based on current color and brightness
const updatePreview = () => {
  const { r, g, b } = currentColor;
  const brightness = brightnessSlider.value / 100;
  const brightenedRgb = `rgb(${Math.round(r * brightness)}, ${Math.round(
    g * brightness
  )}, ${Math.round(b * brightness)})`;
  ledPreview.style.backgroundColor = brightenedRgb;
  ledPreview.style.boxShadow = `0 0 20px rgb(${r}, ${g}, ${b})`;
};

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
  updatePreview();
}

// Update current color with new brightness
function updateBrightness() {
  const { r, g, b } = currentColor;
  const { r: br, g: bg, b: bb } = applyBrightness(r, g, b);
  console.log("Brightness update:", br, bg, bb);
  sendCommand([0x7e, 0x07, 0x05, 0x03, br, bg, bb, 0xef]);
  updatePreview();
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

// Power button logic
powerButton.addEventListener("click", () => {
  powerOn = !powerOn;

  // Toggle the 'on' class on the power button itself
  powerButton.classList.toggle("on", powerOn);
  powerButtonSpan.textContent = powerOn ? "ON" : "OFF";

  // Toggle the 'disabled' class on the parent app-card
  appCard.classList.toggle("disabled", !powerOn);

  // Update LED preview and animation based on power state
  if (powerOn) {
    updatePreview();
    ledPreview.classList.add("pulse");
    console.log("powerOn clicked");
    sendCommand([0x7e, 0x04, 0x04, 0x01, 0xff, 0x00, 0xef]);
  } else {
    ledPreview.style.backgroundColor = "transparent";
    ledPreview.style.boxShadow = "none";
    ledPreview.classList.remove("pulse");
    // disableCommands();
    console.log("powerOff clicked");
    sendCommand([0x7e, 0x04, 0x04, 0x00, 0xff, 0x00, 0xef]);
  }
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
// patternSelect.addEventListener("change", (event) => {
//   const selectedIndex = parseInt(event.target.value, 10); // 0–15
//   const code = 0x8a + selectedIndex;
//   console.log(
//     `Pattern selected: index=${selectedIndex}, code=0x${code.toString(16)}`
//   );
//   setPattern(code);
// });

// Event listeners for tabs
smoothTab.addEventListener("click", () => {
  smoothTab.classList.add("selected");
  flashTab.classList.remove("selected");
  renderPatterns("smooth");
});

flashTab.addEventListener("click", () => {
  flashTab.classList.add("selected");
  smoothTab.classList.remove("selected");
  renderPatterns("flash");
});
// Initial render
renderPatterns("smooth");

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
    "Queueing command to",
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

  const writeOp = async () => {
    // small gap between writes to reduce GATT conflicts
    await new Promise((res) => setTimeout(res, 25));
    try {
      if (ledCharacteristic.properties?.write) {
        await ledCharacteristic.writeValue(buffer);
      } else if (ledCharacteristic.properties?.writeWithoutResponse) {
        await ledCharacteristic.writeValueWithoutResponse(buffer);
      } else {
        updateStatus("Characteristic not writable (no write property).", true);
        console.error(
          "Characteristic properties:",
          ledCharacteristic.properties
        );
        return;
      }
      updateStatus("Command sent!", false);
    } catch (error) {
      console.error("BLE write error:", error);
      // if GATT busy, retry once after a short delay
      const msg = error && error.message ? error.message.toLowerCase() : "";
      if (msg.includes("gatt operation already in progress")) {
        console.warn("GATT busy, retrying write after 120ms...");
        await new Promise((res) => setTimeout(res, 120));
        try {
          if (ledCharacteristic.properties?.write) {
            await ledCharacteristic.writeValue(buffer);
          } else if (ledCharacteristic.properties?.writeWithoutResponse) {
            await ledCharacteristic.writeValueWithoutResponse(buffer);
          }
          updateStatus("Command sent (retry)!", false);
        } catch (err2) {
          updateStatus(`Failed to send command: ${err2.message}`, true);
          console.error("BLE write retry failed:", err2);
          if (!gattServer || !gattServer.connected) onDisconnected();
        }
      } else {
        updateStatus(`Failed to send command: ${error.message}`, true);
        if (!gattServer || !gattServer.connected) onDisconnected();
      }
    }
  };

  // serialize writes
  writeQueue = writeQueue.then(writeOp, writeOp);
  try {
    await writeQueue;
  } catch (_) {
    // errors handled inside writeOp
  }
}
