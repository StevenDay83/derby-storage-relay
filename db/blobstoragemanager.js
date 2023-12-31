const binarytools = require('../pointer/blob');
const BlobCacheManager = require('./blobcachemanager.js');
const fs = require('fs');
const sha256 = require('sha256');

module.exports.DataStorageManager = class DataStorageManager {
    constructor(relaySettings) {
        this.directory = relaySettings.storage.directory;
        this.fileSuffix = relaySettings.storage.fileSuffix;
        this.datablocklimit = 512000;
        this.BlobCacheManager = new BlobCacheManager(relaySettings.cache);
    }

    getDataByHash(thisHash, callback){
        if (thisHash){
            let cachedBlob = this.BlobCacheManager.getBlobByHash(thisHash);

            if (cachedBlob && binarytools.getDataHash(cachedBlob) == thisHash){
                callback(undefined, cachedBlob);
            } else {
                let dataFilePath = this.getDataPath(thisHash);
                try {
                    fs.stat(dataFilePath, (err) => {
                        if (!err){
                            fs.readFile(dataFilePath, (err, rawData) => {
                                if (!err){
                                    if (binarytools.getDataHash(rawData) == thisHash){
                                        this.BlobCacheManager.addBlobToCache(thisHash, rawData);
                                        callback(undefined, rawData);
                                    } else {
                                        throw new Error ("Hash file mismatch");
                                    }
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