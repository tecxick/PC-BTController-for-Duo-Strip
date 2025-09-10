let ledCharacteristic = null;
let gattServer = null;

const statusElement = document.getElementById("status");
const connectButton = document.getElementById("connectButton");
const disconnectButton = document.getElementById("disconnectButton");
const commandButtons = document.querySelectorAll("button:not(#connectButton):not(#disconnectButton)");

// Disable command buttons initially
commandButtons.forEach(button => button.disabled = true);
disconnectButton.disabled = true;

connectButton.addEventListener("click", connectToLed);
disconnectButton.addEventListener("click", disconnectFromLed);

// Add listeners for the command buttons
document.getElementById("powerOn").addEventListener("click", () => {
    sendCommand([0x7E, 0x04, 0x04, 0x01, 0xFF, 0x00, 0xEF]);
});

document.getElementById("powerOff").addEventListener("click", () => {
    sendCommand([0x7E, 0x04, 0x04, 0x00, 0xFF, 0x00, 0xEF]);
});

document.getElementById("red").addEventListener("click", () => {
    sendCommand([0x7E, 0x07, 0x05, 0xFF, 0x00, 0x00, 0x00, 0xEF]);
});

document.getElementById("green").addEventListener("click", () => {
    sendCommand([0x7E, 0x07, 0x05, 0x00, 0xFF, 0x00, 0x00, 0xEF]);
});

document.getElementById("blue").addEventListener("click", () => {
    sendCommand([0x7E, 0x07, 0x05, 0x00, 0x00, 0xFF, 0x00, 0xEF]);
});

function updateStatus(message, isError = false) {
    statusElement.textContent = `Status: ${message}`;
    statusElement.className = isError ? "error" : "success";
}

function enableCommands() {
    commandButtons.forEach(button => button.disabled = false);
    connectButton.disabled = true;
    disconnectButton.disabled = false;
}

function disableCommands() {
    commandButtons.forEach(button => button.disabled = true);
    connectButton.disabled = false;
    disconnectButton.disabled = true;
}

async function connectToLed() {
    updateStatus("Connecting...");
    try {
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: ["0000fff0-0000-1000-8000-00805f9b34fb"]
        });

        gattServer = await device.gatt.connect();
        updateStatus("Connected!");
        
        gattServer.on("gattserverdisconnected", onDisconnected);

        const service = await gattServer.getPrimaryService("0000fff0-0000-1000-8000-00805f9b34fb");
        ledCharacteristic = await service.getCharacteristic("0000fff4-0000-1000-8000-00805f9b34fb");
        
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
    disableCommands();
}

async function sendCommand(cmdArray) {
    if (!ledCharacteristic) {
        updateStatus("Not connected. Please connect first.", true);
        return;
    }

    try {
        const buffer = new Uint8Array(cmdArray);
        await ledCharacteristic.writeValueWithoutResponse(buffer);
        updateStatus("Command sent!", false);
    } catch (error) {
        updateStatus(`Failed to send command: ${error.message}`, true);
        console.error("BLE write error:", error);
        // If write fails, the connection might be gone.
        if (!gattServer.connected) {
            onDisconnected();
        }
    }
}