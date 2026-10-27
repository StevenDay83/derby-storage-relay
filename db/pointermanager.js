const binarytools = require('../pointer/blob.js');
const pointertools = require('../pointer/pointer.js');
const ErrorManager = require('../server/error.js');
const StorageNodeFilter = require('./filter.js');
const PointerCacheManager = require('./pointercachemanager.js');

module.exports = class PointerStorageManagement {
    constructor(relaySettings, dataStorageManager, pointerStore) {
        this.RelaySettings = relaySettings;
        this.DataStorageManager = dataStorageManager;
        this.PointerStore = pointerStore;
        this.pointerIndex = {
        };

        this.PubKeyFilter = new StorageNodeFilter.KeysFilterManager(relaySettings, this.pointerIndex);

        this.PubKeyFilter.loadFilterGroups();
        this.PubKeyFilter.loadFilterKeys();

        this.PubKeyFilter.checkForChanges(true);

        this.PointerCache;
    }

    initializeCacheManager(callback) {
        // The cache is a bounded LRU in front of the database (the source of
        // truth); it starts empty instead of loading the whole Pointers table.
        this.PointerCache = new PointerCacheManager(this.RelaySettings.cache);

        callback(undefined, this.PointerCache.CacheTable.size);
    }

    rehashPointerIndexer(callback) {
        try {
            this.PointerStore.countSumByPubkey((err, rows) => {
                if (!err) {
                    if (rows && rows.length > 0) {
                        rows.forEach(uniqueKeyRow => {
                            let thisKey = uniqueKeyRow["pubkey"];
                            let thisPubkeyPointerCount = Number(uniqueKeyRow["count"]);
                            let thisPubKeyPointerSum = Number(uniqueKeyRow["totalsize"]);

                            this.pointerIndex[thisKey] = {
                                pointerCount: thisPubkeyPointerCount,
                                pointerHashSum: thisPubKeyPointerSum
                            };
                        });
                    }
                    callback(undefined);
                } else {
                    callback(err);
                }
            });
        } catch (e) {
            callback(e);
        }
    }

    updateIndexer(key, addCount, addSize) {
        if (this.pointerIndex[key]) {
            this.pointerIndex[key].pointerCount += addCount != undefined ? addCount : 0;
            this.pointerIndex[key].pointerHashSum += addSize != undefined ? addSize : 0;

            if (this.pointerIndex[key].pointerCount == 0) {
                delete this.pointerIndex[key];
            }
        } else {
            // New unique key
            this.pointerIndex[key] = {
                pointerCount: addCount != undefined ? addCount : 0,
                pointerHashSum: addSize != undefined ? addSize : 0
            }
        }
    }

    initializeDatabase(callback) {
        this.PointerStore.init(callback);
    }

    closeDatabase(callback) {
        this.PointerStore.close(callback);
    }

    publishNewPointer(newPointer, blob, callback) {
        // Steps
        // Validate pointer object
        // Verify ID and Signature (only here, at publish time)
        // Validate Timestamp (+/- time)
        // Check if existing pointer exists
        // If yes, initiate a replacement (call replacePointer())
        // If no, move below
        // Validate blob hash and size
        // Save blob and pointer
        // Send to callback
        try {
            if (newPointer) {
                if (pointertools.verifySignature(newPointer)) { // Verify pointer hash and sig
                    let timeStamp = newPointer.timestamp;
                    let timeNow = Math.floor(Date.now() / 1000);
                    let timeDelta = Math.abs(timeStamp - timeNow);

                    let filterActionPublish = this.PubKeyFilter.filterPointerByAction(newPointer, "publish");

                    if (filterActionPublish.action == StorageNodeFilter.POINTER_ACCEPTED) {
                        // Check time delta
                        // If time delta is 0, any time is permissible
                        // TODO: May want to prevent future dates no matter what
                        if ((this.RelaySettings.pointer.timestampDelta == 0 ? true : false) || timeDelta <= this.RelaySettings.pointer.timestampDelta) {
                            let newPointerId = newPointer.id;

                            this.getPointerById(newPointerId, (err, result) => { // Check for existing duplicate ID
                                try {
                                    if (!err) {
                                        if (!result) {
                                            // Check if this is a replacement by looking at
                                            // PointerHash and Pubkey
                                            // If there is an existing PointerHash and PubKey, treat as a replacement
                                            this.PointerStore.getPointerByPubkeyHash(newPointer.pubkey, newPointer.pointerhash, (err, existingRow) => {
                                                try {
                                                    if (!err) {
                                                        if (!existingRow) { // No existing pubkey claim on data
                                                            // New Pointer
                                                            if (blob && blob.length > 0) {
                                                                if (binarytools.isBase64Data(blob)) {
                                                                    // Verify converted binary matches pointerhash
                                                                    let bufferData = binarytools.getBufferData(blob);
                                                                    let bufferDataHash = binarytools.getDataHash(bufferData);

                                                                    if (bufferDataHash == newPointer.pointerhash) {
                                                                        if (bufferData.length <= this.RelaySettings.storage.dataBlockLimit) {
                                                                            if (bufferData.length == newPointer.size) {
                                                                                // Write data to disk
                                                                                this.DataStorageManager.publishData(bufferData, (err, dataHash) => {
                                                                                    try {
                                                                                        if (!err) {
                                                                                            // Write pointer to Database
                                                                                            this.PointerStore.insertPointer(newPointer, undefined, (err) => {
                                                                                                if (!err) {
                                                                                                    this.updateIndexer(newPointer.pubkey, 1, newPointer.size);
                                                                                                    this.PointerCache.addPointerToCache(newPointer);
                                                                                                    callback(undefined, newPointer.id, newPointer.pointerhash);
                                                                                                } else {
                                                                                                    callback(new Error("SQL Error"), undefined, undefined);
                                                                                                }
                                                                                            });
                                                                                        } else {
                                                                                            throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.NOTICE,
                                                                                                newPointer ? newPointer.id : "", "Critical error saving data");
                                                                                        }
                                                                                    } catch (e) {
                                                                                        console.log(e);
                                                                                        callback(e, undefined, undefined);
                                                                                    }
                                                                                });
                                                                            } else {
                                                                                throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_SIZE,
                                                                                    newPointer.id, "Data size mismatch");
                                                                            }
                                                                        } else {
                                                                            throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_SIZE,
                                                                                newPointer.id, "Data size " + bufferData.length + " exceeds data block limit " +
                                                                            this.RelaySettings.storage.dataBlockLimit);
                                                                        }
                                                                    } else {
                                                                        throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_DATA_HASH,
                                                                            newPointer.id, "Hash mismatch of data and pointerhash");
                                                                    }
                                                                } else {
                                                                    throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_VALUES,
                                                                        newPointer.id, "Invalid data encoding, expecting base64");
                                                                }
                                                            }
                                                        } else {
                                                            // Replacement Pointer
                                                            let oldPointerId = existingRow.id;
                                                            this.replacePointer(oldPointerId, newPointer, (err, confirmId) => {
                                                                if (!err) {
                                                                    callback(undefined, newPointer.id, newPointer.pointerhash);
                                                                } else {
                                                                    callback(err, undefined, undefined);
                                                                }
                                                            });
                                                        }
                                                    } else {
                                                        throw err;
                                                    }
                                                } catch (e) {
                                                    console.error(e);
                                                    callback(e, undefined, undefined);
                                                }
                                            });
                                        } else { // Do nothing, inform client
                                            throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.NOTICE,
                                                newPointer ? newPointer.id : "", "Duplicate pointer, ignoring");
                                        }
                                    } else {
                                        throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.ERROR_RETRIVING_POINTERS,
                                            newPointer ? newPointer.id : "", "");
                                    }
                                } catch (e) {
                                    callback(e, undefined, undefined);
                                }
                            });
                        } else {
                            throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_POINTER,
                                newPointer ? newPointer.id : "", "Pointer timestamp is not within threshold");
                        }
                    } else if (filterActionPublish.action == StorageNodeFilter.POINTER_PUBLISH_DENY) {
                        throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_PUBKEY,
                            newPointer ? newPointer.id : "", ErrorManager.DEFAULT_ACTION_ERRORS.PUBLISH_ACTION_DENIED);
                    } else if (filterActionPublish.action == StorageNodeFilter.POINTER_SIZE_QUOTA) {
                        throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.ACTION_NOT_ALLOWED,
                            newPointer ? newPointer.id : "", ErrorManager.DEFAULT_ACTION_ERRORS.QUOTA_EXCEEDED_SIZE);
                    } else if (filterActionPublish.action == StorageNodeFilter.POINTER_COUNT_QUOTA) {
                        throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.ACTION_NOT_ALLOWED,
                            newPointer ? newPointer.id : "", ErrorManager.DEFAULT_ACTION_ERRORS.QUOTA_EXCEEDED_POINTER_COUNT);
                    }

                } else {
                    throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_POINTER,
                        newPointer ? newPointer.id : "", "Pointer verification failed");
                }
            } else {
                throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_POINTER,
                    newPointer ? newPointer.id : "", "Pointer object malformed");
            }
        } catch (e) {
            callback(e, undefined, undefined);
        }
    } // Publish Pointer

    replacePointer(oldPointerId, newPointerObject, callback) {
        // New pointer and old pointer should not be identical
        // Insert of the new pointer and delete of the old pointer happen in a
        // single transaction inside the backend.
        // callback (err, newPointerObject.id)
        try {
            if (oldPointerId && newPointerObject && newPointerObject.id) {
                if (pointertools.verifySignature(newPointerObject)) {
                    let filterActionReplace = this.PubKeyFilter.filterPointerByAction(newPointerObject, "replace");

                    if (filterActionReplace.action == StorageNodeFilter.POINTER_ACCEPTED) {
                        this.PointerStore.insertPointer(newPointerObject, oldPointerId, (err) => {
                            if (!err) {
                                this.PointerCache.removePointerFromCache(oldPointerId);
                                this.PointerCache.addPointerToCache(newPointerObject);
                                callback(undefined, newPointerObject.id);
                            } else {
                                throw err;
                            }
                        });
                    } else {
                        throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_PUBKEY,
                            newPointerObject ? newPointerObject.id : "", ErrorManager.DEFAULT_ACTION_ERRORS.REPLACE_ACTION_DENIED);
                    }
                } else {
                    throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_POINTER,
                        newPointerObject ? newPointerObject.id : "", "Pointer verification failed");
                }
            } else {
                throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_POINTER,
                    newPointerObject ? newPointerObject.id : "", "Pointer object malformed");
            }
        } catch (e) {
            console.error(e);
            callback(e, undefined);
        }

    }

    deletePointer(deletionValidationPointer, callback) {
        // We must find the pointer with the same pubkey and pointer hash
        // The nonce should be different from the found pointer
        // The timestamp should also be newer

        // callback(err, deletedPointerId)

        try {
            if (deletionValidationPointer && pointertools.verifySignature(deletionValidationPointer)) {
                let filterActionDelete = this.PubKeyFilter.filterPointerByAction(deletionValidationPointer, "delete");

                if (filterActionDelete.action == StorageNodeFilter.POINTER_ACCEPTED) {
                    let dateNow = Math.floor(Date.now() / 1000);
                    let publicKey = deletionValidationPointer.pubkey;
                    let pointerHash = deletionValidationPointer.pointerhash;

                    this.getPointerByPKPH(publicKey, pointerHash, (err, pointerResult) => {
                        try {
                            if (pointerResult) {
                                let pointerResultTimeStamp = pointerResult.timestamp;

                                if (pointerResultTimeStamp < deletionValidationPointer.timestamp
                                    && pointerResult.nonce != deletionValidationPointer.nonce &&
                                    Math.abs(dateNow - deletionValidationPointer.timestamp) <= 300 &&
                                    deletionValidationPointer.nonce < 9 && deletionValidationPointer.nonce >= 0) {
                                    this._removePointerInternal(pointerResult, (err, deletedPointerId) => {
                                        if (!err) {
                                            this.updateIndexer(pointerResult.pubkey, -1, -pointerResult.size);
                                            callback(undefined, deletedPointerId);
                                        } else {
                                            callback(err, undefined);
                                        }
                                    });
                                } else {
                                    throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_DELETION_POINTER,
                                        deletionValidationPointer ? deletionValidationPointer.id : "",
                                        "Invalid deletion pointer. Timestamp or Nonce value failed check");
                                }
                            } else {
                                throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_POINTER,
                                    deletionValidationPointer ? deletionValidationPointer.id : "",
                                    "Pointer does not exist");
                            }
                        } catch (e) {
                            callback(e, undefined);
                        }
                    });
                } else {
                    throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_PUBKEY,
                        deletionValidationPointer ? deletionValidationPointer.id : "", ErrorManager.DEFAULT_ACTION_ERRORS.DELETE_ACTION_DENIED);
                }
            } else {
                throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_POINTER,
                    deletionValidationPointer ? deletionValidationPointer.id : "", "Pointer verification failed");
            }
        } catch (e) {
            callback(e, undefined);
        }
    }

    _removePointerInternal(deletionPointer, callback) {
        // Remove pointer from the database
        // Delete pointer follows specific rules on existing pointer and nonce enforcement
        // Assuming this pointer has been verified already to speed up code
        // callback(err, deletedPointerId)
        try {
            if (deletionPointer) {
                let pointerHash = deletionPointer.pointerhash;

                // If this pointer is the last claim on the blob, remove the
                // blob data as well; otherwise other pointers still reference it.
                this.PointerStore.countByPointerHash(pointerHash, (err, pointerHashCount) => {
                    if (!err) {
                        let deleteBlob = pointerHashCount <= 1;

                        this.PointerStore.deletePointerById(deletionPointer.id, (err, affectedRows) => {
                            if (!err) {
                                if (affectedRows > 0) {
                                    this.PointerCache.removePointerFromCache(deletionPointer.id);
                                    if (deleteBlob) {
                                        this.DataStorageManager.deleteData(pointerHash, (err, pHash) => {
                                            if (!err) {
                                                callback(undefined, deletionPointer.id);
                                            } else {
                                                callback(err, undefined);
                                            }
                                        });
                                    } else {
                                        callback(undefined, deletionPointer.id);
                                    }
                                } else {
                                    throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.NOTICE,
                                        deletionPointer ? deletionPointer.id : "", "Critcal error deleting pointer");
                                }
                            } else {
                                throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.NOTICE,
                                    deletionPointer ? deletionPointer.id : "", "Critcal error deleting pointer");
                            }
                        });
                    } else {
                        throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.NOTICE,
                            deletionPointer ? deletionPointer.id : "", "Critcal error deleting pointer");
                    }
                });
            } else {
                throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_POINTER,
                    deletionPointer ? deletionPointer.id : "", "Pointer object malformed");

            }
        } catch (e) {
            callback(e, undefined);
        }
    }

    getPointerByPKPH(publicKey, pointerHash, callback) {
        // Used to find an existing pointer for a pubkey
        // Only one pointerhash per pubkey
        // Indexed DB lookup; the database is the source of truth.
        // callback (err, result)
        this.PointerStore.getPointerByPubkeyHash(publicKey, pointerHash, (err, result) => {
            if (!err && result) {
                this.PointerCache.addPointerToCache(result);
            }
            callback(err, result);
        });
    }

    getPointerById(pointerId, callback, reqId = "") {
        let cachedPointer = this.PointerCache.getPointerById(pointerId);

        if (cachedPointer) {
            callback(undefined, cachedPointer);
        } else {
            this.PointerStore.getPointerById(pointerId, (err, result) => {
                if (!err && result) {
                    this.PointerCache.addPointerToCache(result);
                }
                callback(err, result);
            });
        }
    }

    getPointerByCriteria(criteria, callback, reqId = "") {
        if (criteria) {
            this.PointerStore.queryPointers(criteria, (err, rows) => {
                if (!err) {
                    callback(undefined, rows || []);
                } else {
                    callback(err, undefined);
                }
            });
        } else {
            let invalidQueryError = ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_QUERY, reqId, "");
            callback(invalidQueryError, undefined);
        }
    }

    getBinaryByPointerId(pointerId, callback) {
        try {
            if (pointerId) {
                this.getPointerById(pointerId, (err, result) => {
                    try {
                        if (!err) {
                            if (result) {
                                let pointerHash = result.pointerhash;
                                this.DataStorageManager.getDataByHash(pointerHash, (err, blob) => {
                                    try {
                                        if (!err) {
                                            if (blob) {
                                                if (blob.length == result.size) {
                                                    let base64Data = binarytools.getBase64(blob);
                                                    callback(undefined, pointerHash, base64Data);
                                                } else {
                                                    throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_SIZE,
                                                        pointerId ? pointerId : "", "Data size mismatch");
                                                }
                                            } else {
                                                throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.ERROR_RETRIEVING_DATA,
                                                    pointerId ? pointerId : "", "Data empty");
                                            }
                                        } else {
                                            throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.ERROR_RETRIEVING_DATA,
                                                pointerId ? pointerId : "", "Data empty");;
                                        }
                                    } catch (e) {
                                        callback(e, undefined, undefined);
                                    }
                                });
                            } else {
                                throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_POINTER,
                                    pointerId ? pointerId : "", "Pointer not found");
                            }
                        } else {
                            throw err;
                        }

                    } catch (e) {
                        callback(e, undefined, undefined)
                    }
                });
            } else {
                throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_POINTER,
                    pointerId ? pointerId : "", "Pointer object malformed");
            }
        } catch (e) {
            callback(e, undefined, undefined);
        }
    }
}
