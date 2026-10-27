const binarytools = require('../pointer/blob');
const BlobCacheManager = require('./blobcachemanager.js');
const Logger = require('../logging/log.js');
const fs = require('fs');

module.exports.DataStorageManager = class DataStorageManager {
    constructor(relaySettings) {
        this.directory = relaySettings.storage.directory;
        this.fileSuffix = relaySettings.storage.fileSuffix;
        this.datablocklimit = relaySettings.storage.dataBlockLimit || 512000;

        if (!fs.existsSync(this.directory)) {
            Logger.WriteInfoLog("Blob storage directory " + this.directory + " does not exist, creating it");
            fs.mkdirSync(this.directory, { recursive: true });
        }

        this.BlobCacheManager = new BlobCacheManager(relaySettings.cache);
    }

    getDataByHash(thisHash, callback){
        if (thisHash){
            // Content-addressed data is verified once at write time; cached and
            // on-disk blobs are trusted, so no re-hashing on the read path.
            let cachedBlob = this.BlobCacheManager.getBlobByHash(thisHash);

            if (cachedBlob){
                callback(undefined, cachedBlob);
            } else {
                let dataFilePath = this.getDataPath(thisHash);
                try {
                    fs.stat(dataFilePath, (err) => {
                        if (!err){
                            fs.readFile(dataFilePath, (err, rawData) => {
                                if (!err){
                                    this.BlobCacheManager.addBlobToCache(thisHash, rawData);
                                    callback(undefined, rawData);
                                } else {
                                    throw err;
                                }
                            });
                        } else  {
                            throw new Error ("Data Block Not Found");
                        }
                    });
                } catch (e){
                    callback(e, undefined);
                }
            }
        }
    }

    getDataPath(thisHash){
        let thisFilePath;

        if (thisHash != undefined){
            thisFilePath = this.directory + '/' + thisHash.toLowerCase() + '.' + this.fileSuffix;
        }

        return thisFilePath;
    }

    publishData(bufferData, callback){
        if (bufferData){
            try {
                let thisHash = binarytools.getDataHash(bufferData);
                let saveFilePath = this.getDataPath(thisHash)
    
                fs.writeFile(saveFilePath, bufferData, err => {
                    if (err) {
                        throw err;
                    } else {
                        callback(undefined, thisHash);
                    }
                });
            } catch (e) {
                callback(e, undefined);
            }
        }
    }

    deleteData(thisHash, callback) {
        try {
            if (thisHash){
                let blobFilePath = this.getDataPath(thisHash);
                fs.stat(blobFilePath, (err, stat) => {
                    if (!err){
                        fs.unlink(blobFilePath, err => {
                            if (!err){
                                this.BlobCacheManager.removeBlobFromCache(thisHash);
                                callback(undefined, thisHash);
                            } else {
                                callback(err, undefined);
                            }
                        });
                    } else {
                        callback(err, undefined);
                    }
                });
            } else {
                throw new Error("Invalid pointer hash");
            }
        } catch (e) {
            callback(e, undefined);
        }
    }
}