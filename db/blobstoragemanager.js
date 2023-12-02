const binarytools = require('../pointer/blob');
const fs = require('fs');
const sha256 = require('sha256');

module.exports.DataStorageManager = class DataStorageManager {
    constructor(storageSettings) {
        this.directory = storageSettings.directory;
        this.fileSuffix = storageSettings.fileSuffix;
        this.datablocklimit = 512000;
    }

    getDataByHash(thisHash, callback){
        if (thisHash){
            let dataFilePath = this.getDataPath(thisHash);
            try {
                fs.stat(dataFilePath, (err) => {
                    if (!err){
                        fs.readFile(dataFilePath, (err, rawData) => {
                            if (!err){
                                if (binarytools.getDataHash(rawData) == thisHash){
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