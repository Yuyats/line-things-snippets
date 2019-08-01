const THERMAL_PRINTER_SERVICE_UUID = "4a40d898-cb8a-49fa-9471-c16aaef23b56";
const COMMAND_CHARACTERISTIC = "2064E034-2E6A-40E1-9682-20742CAA9987";

const PAPER_WIDTH = 128;
const PAPER_HEIGHT = 100;

const CMD_RESET       = 0x00;
const CMD_TEST        = 0x01;
const CMD_TESTPAGE    = 0x02;
const CMD_SET_DEFAULT = 0x03;
const CMD_WAKE        = 0x04;
const CMD_SLEEP       = 0x05;
const CMD_FEED        = 0x06;
const CMD_BITMAP_WRITE  = 0x10;
const CMD_BITMAP_FLUSH  = 0x11;
const CMD_TEXT_PRINT    = 0x20;
const CMD_TEXT_PRINTLN  = 0x21;

const deviceUUIDSet = new Set();
const connectedUUIDSet = new Set();
const connectingUUIDSet = new Set();

let logNumber = 1;

Object.defineProperty(Array.prototype, 'flatMap', {
  value: function (f, self) {
    self = self || this;
    return this.reduce(function (ys, x) {
      return ys.concat(f.call(self, x));
    }, []);
  },
  enumerable: false,
});

function onScreenLog(text) {
    const logbox = document.getElementById('logbox');
    logbox.value += '#' + logNumber + '> ';
    logbox.value += text;
    logbox.value += '\n';
    logbox.scrollTop = logbox.scrollHeight;
    logNumber++;
}

window.onload = () => {
    liff.init(async () => {
        onScreenLog('LIFF initialized');
        renderVersionField();

        await liff.initPlugins(['bluetooth']);
        onScreenLog('BLE plugin initialized');

        checkAvailablityAndDo(() => {
            onScreenLog('Finding devices...');
            findDevice();
        });
    }, e => {
        flashSDKError(e);
        onScreenLog(`ERROR on getAvailability: ${e}`);
    });
}

async function checkAvailablityAndDo(callbackIfAvailable) {
    const isAvailable = await liff.bluetooth.getAvailability().catch(e => {
        flashSDKError(e);
        onScreenLog(`ERROR on getAvailability: ${e}`);
        return false;
    });
    onScreenLog("Check availablity: " + isAvailable);

    if (isAvailable) {
        document.getElementById('alert-liffble-notavailable').style.display = 'none';
        callbackIfAvailable();
    } else {
        document.getElementById('alert-liffble-notavailable').style.display = 'block';
        setTimeout(() => checkAvailablityAndDo(callbackIfAvailable), 1000);
    }
}

// Find LINE Things device using requestDevice()
async function findDevice() {
    const device = await liff.bluetooth.requestDevice().catch(e => {
        flashSDKError(e);
        onScreenLog(`ERROR on requestDevice: ${e}`);
        throw e;
    });
    onScreenLog('detect: ' + device.id);

    try {
        if (!deviceUUIDSet.has(device.id)) {
            deviceUUIDSet.add(device.id);
            addDeviceToList(device);
        } else {
            // TODO: Maybe this is unofficial hack > device.rssi
            document.querySelector(`#${device.id} .rssi`).innerText = device.rssi;
        }

        checkAvailablityAndDo(() => setTimeout(findDevice, 100));
    } catch (e) {
        onScreenLog(`ERROR on findDevice: ${e}\n${e.stack}`);
    }
}

// Add device to found device list
function addDeviceToList(device) {
    onScreenLog('Device found: ' + device.name);

    const deviceList = document.getElementById('device-list');
    const deviceItem = document.getElementById('device-list-item').cloneNode(true);
    deviceItem.setAttribute('id', device.id);
    deviceItem.querySelector(".device-id").innerText = device.id;
    deviceItem.querySelector(".device-name").innerText = device.name;
    deviceItem.querySelector(".rssi").innerText = device.rssi;
    deviceItem.classList.add("d-flex");
    deviceItem.addEventListener('click', () => {
        deviceItem.classList.add("active");
        connectDevice(device);
    });
    deviceList.appendChild(deviceItem);
}

// Select target device and connect it
function connectDevice(device) {
    onScreenLog('Device selected: ' + device.name);

    if (!device) {
        onScreenLog('No devices found. You must request a device first.');
    } else if (connectingUUIDSet.has(device.id) || connectedUUIDSet.has(device.id)) {
        onScreenLog('Already connected to this device.');
    } else {
        connectingUUIDSet.add(device.id);
        initializeCardForDevice(device);

        // Wait until the requestDevice call finishes before setting up the disconnect listner
        const disconnectCallback = () => {
            updateConnectionStatus(device, 'disconnected');
            device.removeEventListener('gattserverdisconnected', disconnectCallback);
        };
        device.addEventListener('gattserverdisconnected', disconnectCallback);

        onScreenLog('Connecting ' + device.name);
        device.gatt.connect().then(() => {
            updateConnectionStatus(device, 'connected');
            connectingUUIDSet.delete(device.id);
        }).catch(e => {
            flashSDKError(e);
            onScreenLog(`ERROR on gatt.connect(${device.id}): ${e}`);
            updateConnectionStatus(device, 'error');
            connectingUUIDSet.delete(device.id);
        });
    }
}

// Setup device information card
function initializeCardForDevice(device) {
    const template = document.getElementById('device-template').cloneNode(true);
    const cardId = 'device-' + device.id;

    template.style.display = 'block';
    template.setAttribute('id', cardId);
    template.querySelector('.card > .card-header > .device-name').innerText = device.name;

    // Device disconnect button
    template.querySelector('.device-disconnect').addEventListener('click', () => {
        onScreenLog('Clicked disconnect button');
        device.gatt.disconnect();
    });

    // Display LINE Profile refresh button
    template.querySelector('.display-line-refresh').addEventListener('click', () => {
        onScreenLog('Clicked display line profile refresh button');
        refreshImageDisplay(device, getProfileCanvas(device), "upload-profile-progress")
            .catch(e => onScreenLog(`ERROR on refreshImageDisplay(): ${e}\n${e.stack}`));
    });

    // Display text refresh button
    template.querySelector('.display-text-refresh').addEventListener('click', () => {
        onScreenLog('Clicked display text refresh button');
        refreshTextDisplay(device)
            .catch(e => onScreenLog(`ERROR on refreshTextDisplay(): ${e}\n${e.stack}`));
    });

    // Display image refresh button
    template.querySelector('.display-image-refresh').addEventListener('click', () => {
        onScreenLog('Clicked display image refresh button');
        refreshImageDisplay(device, getImageCanvas(device), "upload-image-progress")
            .catch(e => onScreenLog(`ERROR on refreshImageDisplay(): ${e}\n${e.stack}`));
    });

    // Profile image size form
    template.querySelector('.value-profile-image-size').addEventListener('change', event => {
        onScreenLog(`Changed profile image size: ${event.target.value}`);
        renderProfileToCanvas(device)
            .catch(e => onScreenLog(`ERROR on renderProfileToCanvas(): ${e}\n${e.stack}`));
    });

    // Add input form button
    const form = template.querySelector('.form-text-command').cloneNode(true);
    template.querySelector('.add-input').addEventListener('click', () => {
        onScreenLog('Clicked add input button');
        getTextCommandForms(device)[0].parentNode.appendChild(form.cloneNode(true));
    });

    // Image processing
    template.querySelector('.image-input').addEventListener("change", event => {
        const reader = new FileReader();
        reader.readAsDataURL(event.target.files[0]);
        reader.onload = () => {
            onScreenLog('Read file completed.');
            renderImageToCanvas(device, reader.result);
        };
    });

    // Tabs
    ['line', 'text', 'image'].map(key => {
        const tab = template.querySelector(`#nav-${key}-tab`);
        const nav = template.querySelector(`#nav-${key}`);

        tab.id = `nav-${key}-tab-${device.id}`;
        nav.id = `nav-${key}-${device.id}`;

        tab.href = '#' + nav.id;
        tab['aria-controls'] = nav.id;
        nav['aria-labelledby'] = tab.id;
    })

    // Remove existing same id card
    const oldCardElement = getDeviceCard(device);
    if (oldCardElement && oldCardElement.parentNode) {
        oldCardElement.parentNode.removeChild(oldCardElement);
    }

    document.getElementById('device-cards').appendChild(template);
    onScreenLog('Device card initialized: ' + device.name);

    // Render profile information
    renderProfileToCanvas(device)
        .catch(e => onScreenLog(`ERROR on renderProfileToCanvas(): ${e}\n${e.stack}`));
}

// Update Connection Status
function updateConnectionStatus(device, status) {
    if (status == 'connected') {
        onScreenLog('Connected to ' + device.name);
        connectedUUIDSet.add(device.id);

        const statusBtn = getDeviceStatusButton(device);
        statusBtn.setAttribute('class', 'device-status btn btn-outline-primary btn-sm disabled');
        statusBtn.innerText = "Connected";
        getDeviceDisconnectButton(device).style.display = 'inline-block';
        getDeviceCardBody(device).style.display = 'block';
    } else if (status == 'disconnected') {
        onScreenLog('Disconnected from ' + device.name);
        connectedUUIDSet.delete(device.id);

        const statusBtn = getDeviceStatusButton(device);
        statusBtn.setAttribute('class', 'device-status btn btn-outline-secondary btn-sm disabled');
        statusBtn.innerText = "Disconnected";
        getDeviceDisconnectButton(device).style.display = 'none';
        getDeviceCardBody(device).style.display = 'none';
        document.getElementById(device.id).classList.remove('active');
    } else {
        onScreenLog('Connection Status Unknown ' + status);
        connectedUUIDSet.delete(device.id);

        const statusBtn = getDeviceStatusButton(device);
        statusBtn.setAttribute('class', 'device-status btn btn-outline-danger btn-sm disabled');
        statusBtn.innerText = "Error";
        getDeviceDisconnectButton(device).style.display = 'none';
        getDeviceCardBody(device).style.display = 'none';
        document.getElementById(device.id).classList.remove('active');
    }
}

async function renderProfileToCanvas(device) {
    const profile = await liff.getProfile();
    onScreenLog(`Profile: ${profile.displayName} ${profile.statusMessage} ${profile.pictureUrl}`);

    const canvas = getProfileCanvas(device);
    if (!canvas.getContext) {
        onScreenLog("Canvas is not supported on this device.");
        return;
    }

    updateDeviceProgress(device, 'upload-profile-progress', 0);
    canvas.width = PAPER_WIDTH;
    canvas.height = PAPER_HEIGHT;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, PAPER_WIDTH, PAPER_HEIGHT);

    let imageWidth;
    switch (getProfileCommandForm(device).querySelector('.value-profile-image-size').value) {
        case 'F':
            imageWidth = PAPER_WIDTH / 2;
            break;
        case 'L':
            imageWidth = PAPER_WIDTH / 2 - 20;
            break;
        case 'M':
            imageWidth = PAPER_WIDTH / 2 - 40;
            break;
        case 'S':
            imageWidth = PAPER_WIDTH / 2 - 60;
            break;
        default:
            imageWidth = 0;
            break;
    }

    if (imageWidth > 0 && profile.pictureUrl) {
        await renderProfileImage(device, canvas, profile.pictureUrl, imageWidth);
    }

    const offsetX = imageWidth + 5;
    const maxWidth = PAPER_WIDTH - offsetX - 5;
    ctx.strokeStyle = 'black';
    ctx.fillStyle = 'black';
    ctx.font = "bold 30px Verdana";
    ctx.fillText(profile.displayName, offsetX, 50, maxWidth);
    ctx.font = "bold 20px Verdana";
    ctx.fillText(profile.statusMessage || "", offsetX, 95, maxWidth);

    // threshold for text
    const image = ctx.getImageData(imageWidth, 0, PAPER_WIDTH - imageWidth, PAPER_HEIGHT);
    const dithered = CanvasDither.threshold(image, 190);
    ctx.putImageData(dithered, imageWidth, 0);
}

function renderProfileImage(device, canvas, dataUrl, width) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "Anonymous";
        image.onload = () => {
            onScreenLog(`Image loaded: ${image.width}x${image.height}`);
            drawImage(canvas, image, 0, (PAPER_HEIGHT - width) / 2, width, width);
            resolve();
        };
        image.src = dataUrl;
    });
}

function renderImageToCanvas(device, dataUrl) {
    const image = new Image();
    image.crossOrigin = "Anonymous";
    image.onload = () => {
        onScreenLog(`Image loaded: ${image.width}x${image.height}`);
        updateDeviceProgress(device, 'upload-image-progress', 0);

        const canvas = getImageCanvas(device);
        if (!canvas.getContext) {
            onScreenLog("Canvas is not supported on this device.");
            return;
        }

        canvas.width = PAPER_WIDTH;
        canvas.height = PAPER_HEIGHT;

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, PAPER_WIDTH, PAPER_HEIGHT);

        const ratioWidth = PAPER_WIDTH / image.width;
        const ratioHeight = PAPER_HEIGHT / image.height;

        if (ratioHeight > ratioWidth) {
            const height = Math.floor(image.height * ratioWidth);
            const y = Math.floor((PAPER_HEIGHT - height) / 2);
            drawImage(canvas, image, 0, y, PAPER_WIDTH, height);
        } else {
            const width = Math.floor(image.width * ratioHeight);
            //const x = Math.floor((DISPLAY_CANVAS_WIDTH - width) / 2);
            drawImage(canvas, image, 0, 0, width, PAPER_HEIGHT);
        }
    };
    image.src = dataUrl;
}

function drawImage(canvas, image, x, y, width, height) {
    if (!canvas.getContext) {
        onScreenLog("Canvas is not supported on this device.");
        return;
    }

    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, x, y, width, height);

    // apply dither
    const source = ctx.getImageData(x, y, width, height);
    const dithered = CanvasDither.atkinson(source);
    ctx.putImageData(dithered, x, y);

    onScreenLog(`Rendered image: ${width}x${height} on ${x}:${y}`);
}

async function refreshImageDisplay(device, canvas, progressBarClass) {
    if (!connectedUUIDSet.has(device.id)) {
        window.alert('Please connect to a device first');
        onScreenLog('Please connect to a device first.');
        return;
    }
    if (!canvas.getContext) {
        onScreenLog("Canvas is not supported on this device.");
        return;
    }

    const ctx = canvas.getContext('2d');
    const commandCharacteristic = await getCharacteristic(
        device, THERMAL_PRINTER_SERVICE_UUID, COMMAND_CHARACTERISTIC);

    await writeCharacteristic(commandCharacteristic, [CMD_WAKE]);
    await writeCharacteristic(commandCharacteristic, [CMD_SET_DEFAULT]);

    const commands = [...Array(PAPER_HEIGHT).keys()]
        .map(y => [...Array(Math.floor(PAPER_WIDTH / 8)).keys()]
            .map(x => x * 8)
            .map(x => ctx.getImageData(x, y, 8, 1).data
                .map((p, i, arr) => (p > 0 || arr[i+3] == 0) ? 0 : 1)
                .filter((p, i) => i % 4 == 0)
                .reduce((acc, cur, i) => acc | cur << i, 0)
            )
            .reduce((acc, bitmap, i) => {
                if (i % 16 == 0) {
                    acc.push([CMD_BITMAP_WRITE, y & 0xff, y >> 8, i / 16, bitmap]);
                } else {
                    acc[acc.length - 1].push(bitmap);
                }
                return acc;
            }, [])
        );

    for (const y in commands) {
        const row = commands[y];
        const intY = parseInt(y, 10);

        await Promise.all(row.map((command) => {
            onScreenLog(`${y}: ${command.map(c => c.toString(16)).join(' ')}`);
            return writeCharacteristic(commandCharacteristic, command);
        }));

        updateDeviceProgress(device, progressBarClass, Math.floor((intY + 1) / commands.length * 100));
    }

    await writeCharacteristic(commandCharacteristic, [CMD_BITMAP_FLUSH, PAPER_HEIGHT & 0xff, PAPER_HEIGHT >> 8]);
    await writeCharacteristic(commandCharacteristic, [CMD_FEED, 1]);
    await writeCharacteristic(commandCharacteristic, [CMD_SLEEP]);
}

async function refreshTextDisplay(device) {
    if (!connectedUUIDSet.has(device.id)) {
        window.alert('Please connect to a device first');
        onScreenLog('Please connect to a device first.');
        return;
    }

    const commandCharacteristic = await getCharacteristic(
        device, THERMAL_PRINTER_SERVICE_UUID, COMMAND_CHARACTERISTIC);

    await writeCharacteristic(commandCharacteristic, [CMD_WAKE]);
    await writeCharacteristic(commandCharacteristic, [CMD_SET_DEFAULT]);

    // Write pixels to frame buffer
    await Promise.all([...getTextCommandForms(device)].flatMap(f => {
        const textValue = f.querySelector('.value-input-text').value;
        const fontSize = f.querySelector('.value-font-size').value;
        const posX = f.querySelector('.value-pos-x').value || 0;
        const posY = f.querySelector('.value-pos-y').value || 0;
        onScreenLog(`Text: "${textValue}" ${fontSize} ${posX} ${posY}`);

        if (posY % 8 > 0) {
            onScreenLog(`Invalid posY: ${posY}`);
            return;
        }
        if (!textValue || textValue.length == 0) {
            return;
        }

        return writeCharacteristic(commandCharacteristic, [CMD_TEXT_PRINTLN]
            .concat(Array.from(textValue).map(c => c.charCodeAt()))
            .concat([0]));
    }));

    await writeCharacteristic(commandCharacteristic, [CMD_FEED, 1]);
    await writeCharacteristic(commandCharacteristic, [CMD_SLEEP]);
}

async function readCharacteristic(characteristic) {
    const response = await characteristic.readValue().catch(e => {
        flashSDKError(e);
        throw e;
    });
    if (response) {
        const values = new Uint8Array(response.buffer);
        onScreenLog(`Read ${characteristic.uuid}: ${values}`);
        return values;
    } else {
        throw 'Read value is empty?';
    }
}

async function writeCharacteristic(characteristic, command) {
    await characteristic.writeValue(new Uint8Array(command)).catch(e => {
        flashSDKError(e);
        throw e;
    });
    //onScreenLog(`Wrote ${characteristic.uuid}: ${command}`);
}

async function getCharacteristic(device, serviceId, characteristicId) {
    const service = await device.gatt.getPrimaryService(serviceId).catch(e => {
        flashSDKError(e);
        throw e;
    });
    const characteristic = await service.getCharacteristic(characteristicId).catch(e => {
        flashSDKError(e);
        throw e;
    });
    onScreenLog(`Got characteristic ${serviceId} ${characteristicId} ${device.id}`);
    return characteristic;
}

function getDeviceCard(device) {
    return document.getElementById('device-' + device.id);
}

function getDeviceCardBody(device) {
    return getDeviceCard(device).getElementsByClassName('card-body')[0];
}

function getDeviceStatusButton(device) {
    return getDeviceCard(device).getElementsByClassName('device-status')[0];
}

function getDeviceDisconnectButton(device) {
    return getDeviceCard(device).getElementsByClassName('device-disconnect')[0];
}

function getProfileCommandForm(device) {
    return getDeviceCard(device).getElementsByClassName('form-profile-command')[0];
}

function getTextCommandForms(device) {
    return getDeviceCard(device).getElementsByClassName('form-text-command');
}

function getImageCanvas(device) {
    return getDeviceCard(device).getElementsByClassName('image-thumbnail')[0];
}

function getProfileCanvas(device) {
    return getDeviceCard(device).getElementsByClassName('profile-preview')[0];
}

function updateDeviceProgress(device, clazz, level) {
    const progressBar = document.getElementById('device-' + device.id).getElementsByClassName(clazz)[0];

    if (level) {
        progressBar.style.width = level + '%';
        progressBar.innerText = level + '%';
        progressBar.setAttribute("aria-valuenow", level);
    } else {
        progressBar.style.width = '0%';
        progressBar.innerText = 'N/A';
        progressBar.setAttribute("aria-valuenow", 0);
    }
}

function renderVersionField() {
    const element = document.getElementById('sdkversionfield');
    const versionElement = document.createElement('p')
        .appendChild(document.createTextNode('SDK Ver: ' + liff._revision));
    element.appendChild(versionElement);
}

function flashSDKError(error){
    window.alert('SDK Error: ' + error.code);
    window.alert('Message: ' + error.message);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
