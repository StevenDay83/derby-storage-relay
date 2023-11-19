// Derby Media Storage Relay

// Read from Settings.json

const BigInteger = require('bigi');
const schnorr = require('bip-schnorr');
const convert = schnorr.convert;
const pointertools = require('./pointer/pointer.js');
const nostrtools = require('nostr-tools');
const blob = require('./pointer/blob.js');
const RelayServer = require('./server/server.js');
const Logger = require('./logging/log.js');

const SettingsJSONFile = "./settings.json";
let GlobalSettings = {};

// 6c84ac05abb76c3f127dc400c81c3afbaca8d09175a52b801ee789ab12e6cdc9
// var privKey = '981e951a3cdfc221831c10ae63c37b74919f710f686645898335e7d1e6f6581a';
// var privKey = nostrtools.generatePrivateKey();

// var pointerObject = {
//     pubkey:nostrtools.getPublicKey(privKey),
//     timestamp:Math.floor(Date.now() / 1000),
//     pointerhash:'6c84ac05abb76c3f127dc400c81c3afbaca8d09175a52b801ee789ab12e6cdc9',
//     size:10000,
//     nonce:78
// };

// pointerObject.id = pointertools.generatePointerId(pointerObject);
// pointerObject.signature = pointertools.generateSignature(privKey,pointerObject);

// console.log(JSON.stringify(pointerObject, false, 2));

// process.exit(1);

function loadSettings() {
    let fs = require('fs');

    try {
        if (fs.existsSync(SettingsJSONFile)){
            GlobalSettings = JSON.parse(fs.readFileSync(SettingsJSONFile));
        } else {
            throw new Error ("Settings file not found");
        }
    } catch (e) {
        throw e;
    }
}

Logger.WriteInfoLog("Loading log file from " + SettingsJSONFile);

try {
    loadSettings();
    Logger.WriteInfoLog("Settings loaded");
} catch (e) {
    Logger.WriteErrorLog("Error loading log file: " + e.message);
}

// console.log(JSON.stringify(GlobalSettings, undefined, 4));

const PointerManager = require("./db/pointermanager.js");
const { DataStorageManager } = require('./db/blobstoragemanager.js');

let pointerMgr = new PointerManager(GlobalSettings, new DataStorageManager(GlobalSettings.storage));

let testSearch = {ids:["12345"],owners:["6789"],olderthan:1697420666,pointerhashes:["0abcde"],sizelargerthan:10000,limit:10};
// let testSearch = {limit:10};

// pointerMgr.getPointerByCriteria(testSearch, (err, results) => {
//     if (err){
//         console.error(err);
//     }
// });


Logger.WriteInfoLog("Initializing connection to database at " + GlobalSettings.database.host + (GlobalSettings.database.port ? ':' + GlobalSettings.database.port : ""));
pointerMgr.initializeDatabase(err => {
    if (err){
        console.error(err);
    } else {
        // console.log("Database Initialized!")
        Logger.WriteInfoLog("Initialized connection to database " + GlobalSettings.database.pointerDatabase);

        let thisRelayServer = new RelayServer(GlobalSettings.server, pointerMgr);
        Logger.WriteInfoLog("Starting Server at host " + GlobalSettings.server.host + 
        (GlobalSettings.server.port ? ':' + GlobalSettings.server.port : ""));
        thisRelayServer.startServer(err => {
            if (!err){
                // console.log("Server started");
                Logger.WriteInfoLog("Server started, listening for connections");
            } else {
                // console.log(err);
                Logger.WriteErrorLog("Error starting server: " + err.message);
            }
        });
    }
});


// 6c84ac05abb76c3f127dc400c81c3afbaca8d09175a52b801ee789ab12e6cdc9
// var privKey = '981e951a3cdfc221831c10ae63c37b74919f710f686645898335e7d1e6f6581a';
// var privKey = nostrtools.generatePrivateKey();

// var pointerObject = {
//     pubkey:nostrtools.getPublicKey(privKey),
//     timestamp:Math.floor(Date.now() / 1000),
//     pointerhash:'1c7f005040b1708b12839c89d0bcc5303751f2befc52ae93c071be5170256ca2',
//     size:103976,
//     nonce:78
// };

// pointerObject.id = pointertools.generatePointerId(pointerObject);
// pointerObject.signature = pointertools.generateSignature(privKey,pointerObject);

// console.log(JSON.stringify(pointerObject, false, 2));
// console.log(pointertools.getPointerString(pointerObject));
// console.log(pointertools.verifySignature(pointerObject));
// console.log(pointertools.verifyId(pointerObject));

// const privateKey = BigInteger.fromHex('B7E151628AED2A6ABF7158809CF4F3C762E7160F38B4DA56A784D9045190CFEF');
// const message = Buffer.from('243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C89', 'hex');
// const createdSignature = schnorr.sign(privateKey, message);
// console.log('The signature is: ' + createdSignature.toString('hex'));

// const fs = require('fs');

// let imageData = fs.readFileSync("Image1.jpg");

// let cArray = blob.chunkData(imageData, 10000);

// for (let i = 0; i < cArray.length; i++){
//     thisBuf = cArray[i];
//     console.log(blob.getBase64(thisBuf).length);
//     console.log(thisBuf.length);
//     console.log(blob.getDataHash(thisBuf));
//     blob.publishBlobToFile("./BlobData", thisBuf, (fileName, err) => {
//         if (err) {
//             console.error(err);
//         } else {
//             console.log("Blob Saved to File: " + fileName);
//         }
//     });
// }
// // console.log(cArray);

// const SQLDB = require('mariadb');
// const pool = SQLDB.createConnection({
//     host:'localhost',
//     user:'dbuser',
//     password:'fuckoff27',
//     database:'pointer_db'
// }).then(conn => {
//     console.log("Connected");

//     conn.query("SELECT * FROM Pointers").then(rows => {
//         console.log(rows);

//         if (rows[0]){
//             var pointerTest = rows[0];
//             console.log(pointerTest.nonce);
//         }
//     });
// }).catch(err => {
//     console.error(err);
// });

// const blobMgr = require('./db/blobstoragemanager.js');

// let blobStorageManager = new blobMgr.DataStorageManager({
//     directory:'./BlobData',
//     fileSuffix: 'blob',
//     dataBlockLimit: 512000
// });

// blobStorageManager.getDataByHash('f98b2285388d1b4798ac817fe837fdc3576db30f4a5867f63b8b7534921c58ab', (err, data) => {
//     if (err){
//         console.error(err);
//     } else {
//         console.log(blob.getBase64(data));
//     }
// });