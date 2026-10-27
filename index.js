// Derby Media Storage Relay

const pointertools = require('./pointer/pointer.js');
const RelayServer = require('./server/server.js');
const Logger = require('./logging/log.js');

const SettingsJSONFile = process.env.DERBY_SETTINGS || "./settings.json";
let GlobalSettings = {};

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

Logger.WriteInfoLog("Loading settings file from " + SettingsJSONFile);

try {
    loadSettings();
    Logger.WriteInfoLog("Settings loaded");
} catch (e) {
    Logger.WriteErrorLog("Error loading settings file: " + e.message);
    process.exit(1);
}

const PointerManager = require("./db/pointermanager.js");
const { DataStorageManager } = require('./db/blobstoragemanager.js');
const MariaDBPointerStore = require('./db/backends/mariadbstore.js');
const SQLitePointerStore = require('./db/backends/sqlitestore.js');

// Select the pointer metadata backend from settings: "sqlite" or "mariadb"
let databaseSettings = GlobalSettings.database || {};
let databaseType = (databaseSettings.type || "mariadb").toLowerCase();
let pointerStore;

if (databaseType == "sqlite") {
    pointerStore = new SQLitePointerStore(databaseSettings);
} else if (databaseType == "mariadb") {
    pointerStore = new MariaDBPointerStore(databaseSettings);
} else {
    Logger.WriteErrorLog("Unknown database type in settings: " + databaseType);
    process.exit(1);
}

let pointerMgr = new PointerManager(GlobalSettings, new DataStorageManager(GlobalSettings), pointerStore);

Logger.WriteInfoLog("Initializing " + databaseType + " pointer database");
pointerMgr.initializeDatabase((err, tableExisted) => {
    if (!err){
        Logger.WriteInfoLog("Pointer database connection: OK");
        if (tableExisted){
            Logger.WriteInfoLog("Database table for pointers: PRESENT");
        } else {
            Logger.WriteInfoLog("Database table for pointers: CREATED");
        }
        pointerMgr.rehashPointerIndexer(err => {
            if (err){
                console.error(err);
            } else {

                Logger.WriteInfoLog("Initializing Pointer Cache");
                pointerMgr.initializeCacheManager((err, cacheCount) => {
                    if (err) {
                        Logger.WriteErrorLog("Error Loading Cache");
                        Logger.WriteErrorLog("WARNING: Performance my be degraded");
                    } else {
                        Logger.WriteInfoLog(cacheCount + " pointers loaded into cache");
                    }

                    let thisRelayServer = new RelayServer(GlobalSettings.server, pointerMgr);
                    Logger.WriteInfoLog("Starting Server at host " + GlobalSettings.server.host +
                    (GlobalSettings.server.port ? ':' + GlobalSettings.server.port : ""));
                    thisRelayServer.startServer(err => {
                        if (!err){
                            Logger.WriteInfoLog("Server started, listening for connections");
                        } else {
                            Logger.WriteErrorLog("Error starting server: " + err.message);
                        }
                    });
                });
            }
        });
    } else {
        console.error(err);
    }
});
