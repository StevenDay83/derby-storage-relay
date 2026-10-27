// Smoke test for the Derby storage relay.
//
// Spins up the real server (node index.js) with the SQLite backend in a temp
// directory, then over a WebSocket: publishes a signed pointer with real data,
// requests it, downloads the data (verifying the sha256 matches pointerhash),
// replaces the pointer, deletes it, and confirms it is gone.
//
// Exits 0 on success, 1 on any failure.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const ws = require('ws');
const nostrtools = require('nostr-tools');
const pointertools = require('../pointer/pointer.js');

const RELAY_PORT = 18456;
const RELAY_URL = 'ws://127.0.0.1:' + RELAY_PORT;

function fail(message) {
    console.error('SMOKE FAIL: ' + message);
    process.exit(1);
}

function makePointer(privKey, pubkey, dataBuffer, nonce, timestamp) {
    let pointerObject = {
        pubkey: pubkey,
        timestamp: timestamp,
        pointerhash: crypto.createHash('sha256').update(dataBuffer).digest('hex'),
        size: dataBuffer.length,
        nonce: nonce
    };

    pointerObject.id = pointertools.generatePointerId(pointerObject);
    pointerObject.signature = pointertools.generateSignature(privKey, pointerObject);

    return pointerObject;
}

function makeDeletionPointer(privKey, pubkey, pointerhash, size, nonce, timestamp) {
    let pointerObject = {
        pubkey: pubkey,
        timestamp: timestamp,
        pointerhash: pointerhash,
        size: size,
        nonce: nonce
    };

    pointerObject.id = pointertools.generatePointerId(pointerObject);
    pointerObject.signature = pointertools.generateSignature(privKey, pointerObject);

    return pointerObject;
}

// Promise-based request/response helper over a single websocket
function sendAndWait(socket, message, matchFn, description) {
    return new Promise((resolve, reject) => {
        let timeout = setTimeout(() => reject(new Error('Timeout waiting for ' + description)), 10000);

        let handler = rawMessage => {
            let parsed;
            try {
                parsed = JSON.parse(rawMessage.toString());
            } catch (e) {
                return;
            }

            if (matchFn(parsed)) {
                clearTimeout(timeout);
                socket.off('message', handler);
                resolve(parsed);
            } else if (parsed[0] == 'ERROR') {
                clearTimeout(timeout);
                socket.off('message', handler);
                reject(new Error(description + ' got ERROR response: ' + rawMessage.toString()));
            }
        };

        socket.on('message', handler);
        socket.send(JSON.stringify(message));
    });
}

function connectWithRetry(attemptsLeft) {
    return new Promise((resolve, reject) => {
        let socket = new ws(RELAY_URL);
        socket.on('open', () => resolve(socket));
        socket.on('error', err => {
            if (attemptsLeft > 0) {
                setTimeout(() => connectWithRetry(attemptsLeft - 1).then(resolve, reject), 300);
            } else {
                reject(err);
            }
        });
    });
}

async function main() {
    // --- Temp environment -------------------------------------------------
    let tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'derby-smoke-'));
    let blobDir = path.join(tempDir, 'BlobData');
    fs.mkdirSync(blobDir);

    let filterGroupFile = path.join(tempDir, 'filter.json');
    fs.writeFileSync(filterGroupFile, JSON.stringify({
        "default": {
            "settings": {
                "canpublish": true,
                "canreplace": true,
                "candelete": true,
                "pointerexpiration": 0,
                "maximumpointers": 1000,
                "maximumpointerhashsize": 50000000
            }
        }
    }));

    let filterKeysFile = path.join(tempDir, 'filterkeys.json');
    fs.writeFileSync(filterKeysFile, JSON.stringify({}));

    let ipFilterFile = path.join(tempDir, 'ipfilter.json');
    fs.writeFileSync(ipFilterFile, JSON.stringify({ "block": [], "safe": ["0.0.0.0/0"] }));

    let settingsFile = path.join(tempDir, 'settings.json');
    fs.writeFileSync(settingsFile, JSON.stringify({
        "server": { "host": "127.0.0.1", "port": RELAY_PORT, "sessionTimeout": 30000, "filteripfile": ipFilterFile },
        "storage": { "directory": blobDir, "fileSuffix": "blob", "dataBlockLimit": 512000 },
        "pointer": { "timestampDelta": 300 },
        "database": { "type": "sqlite", "file": path.join(tempDir, 'pointers.db') },
        "filter": { "filtergroupfile": filterGroupFile, "filterkeysfile": filterKeysFile },
        "cache": { "pointerCache": { "pointerCacheTTL": 300, "maxPointers": 10000 } }
    }));

    // --- Start the real relay ---------------------------------------------
    let serverProcess = spawn('node', ['index.js'], {
        cwd: path.join(__dirname, '..'),
        env: Object.assign({}, process.env, { DERBY_SETTINGS: settingsFile }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    serverProcess.stderr.on('data', data => process.stderr.write('[relay] ' + data));

    let cleanup = () => {
        try { serverProcess.kill(); } catch (e) {}
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    };
    process.on('exit', cleanup);

    try {
        // --- Test data: real keypair, real signed pointer -------------------
        let privKey = nostrtools.generatePrivateKey();
        let pubKey = nostrtools.getPublicKey(privKey);
        let testData = crypto.randomBytes(4096);
        let baseNow = Math.floor(Date.now() / 1000);

        let socket = await connectWithRetry(40);
        console.log('Connected to relay at ' + RELAY_URL);

        // 1. Publish
        let pointer = makePointer(privKey, pubKey, testData, 1, baseNow);
        let publishResponse = await sendAndWait(socket,
            ["POINTER", pointer, "PUBLISH", testData.toString('base64')],
            parsed => parsed[0] == 'OK' && parsed[1] == pointer.id,
            'PUBLISH');
        if (publishResponse[2] != pointer.pointerhash) {
            throw new Error('PUBLISH returned wrong pointerhash: ' + publishResponse[2]);
        }
        console.log('1. PUBLISH ok: ' + publishResponse[1]);

        // 2. Request the pointer back
        let requestResponse = await sendAndWait(socket,
            ["REQUEST", "smoke-req-1", { ids: [pointer.id] }],
            parsed => parsed[0] == 'POINTER' && parsed[1] == 'smoke-req-1',
            'REQUEST');
        if (!Array.isArray(requestResponse[2]) || requestResponse[2].length != 1 ||
            requestResponse[2][0].id != pointer.id) {
            throw new Error('REQUEST did not return the published pointer: ' + JSON.stringify(requestResponse));
        }
        console.log('2. REQUEST ok, got pointer ' + requestResponse[2][0].id);

        // 3. Download the data and verify the hash
        let dataResponse = await sendAndWait(socket,
            ["REQDATA", pointer.id],
            parsed => parsed[0] == 'DATAOK' && parsed[1] == pointer.id,
            'REQDATA');
        let downloadedData = Buffer.from(dataResponse[3], 'base64');
        let downloadedHash = crypto.createHash('sha256').update(downloadedData).digest('hex');
        if (downloadedHash != pointer.pointerhash || downloadedHash != dataResponse[2]) {
            throw new Error('REQDATA hash mismatch: ' + downloadedHash);
        }
        console.log('3. REQDATA ok, sha256 verified: ' + downloadedHash);

        // 4. Replace the pointer (same pubkey + pointerhash, new id/nonce)
        let replacementPointer = makePointer(privKey, pubKey, testData, 2, baseNow + 10);
        let replaceResponse = await sendAndWait(socket,
            ["POINTER", replacementPointer, "PUBLISH"],
            parsed => parsed[0] == 'OK' && parsed[1] == replacementPointer.id,
            'REPLACE');
        console.log('4. REPLACE ok: ' + replaceResponse[1]);

        // The old pointer id must be gone
        let oldGone = await sendAndWait(socket,
            ["REQUEST", "smoke-req-2", { ids: [pointer.id] }],
            parsed => parsed[0] == 'POINTER' && parsed[1] == 'smoke-req-2',
            'REQUEST old pointer');
        if (oldGone[2].length != 0) {
            throw new Error('Old pointer still present after replace');
        }
        console.log('   old pointer id correctly removed');

        // 5. Delete the pointer
        let deletionPointer = makeDeletionPointer(privKey, pubKey, replacementPointer.pointerhash,
            replacementPointer.size, 3, baseNow + 20);
        let deleteResponse = await sendAndWait(socket,
            ["POINTER", deletionPointer, "DELETE"],
            parsed => parsed[0] == 'OK' && parsed[1] == deletionPointer.id,
            'DELETE');
        if (deleteResponse[2] != replacementPointer.id) {
            throw new Error('DELETE removed unexpected pointer: ' + deleteResponse[2]);
        }
        console.log('5. DELETE ok, removed ' + deleteResponse[2]);

        // 6. Confirm nothing remains
        let emptyResponse = await sendAndWait(socket,
            ["REQUEST", "smoke-req-3", { owners: [pubKey] }],
            parsed => parsed[0] == 'POINTER' && parsed[1] == 'smoke-req-3',
            'REQUEST after delete');
        if (emptyResponse[2].length != 0) {
            throw new Error('Pointers still present after delete');
        }
        console.log('6. No pointers remain after delete');

        socket.close();
        console.log('SMOKE PASS');
        process.exit(0);
    } catch (e) {
        fail(e.message);
    }
}

main();
