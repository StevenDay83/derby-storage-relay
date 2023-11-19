const fs = require('fs');
const binarytools = require('../pointer/blob.js');
const pointertools = require('../pointer/pointer.js');
const ErrorManager = require('../server/error.js');
const sha256 = require('sha256');
const mariaDB = require('mariadb');

module.exports = class PointerStorageManagement {
    constructor(relaySettings, dataStorageManager){
        this.RelaySettings = relaySettings;
        this.DataStorageManager = dataStorageManager;
        this.DBpool;
        this.DBConnection;
        this.SQLConnectionInformation = {
            host:this.RelaySettings.database.host,
            port:this.RelaySettings.database.port,
            user:this.RelaySettings.database.username,
            password:this.RelaySettings.database.password,
            database:this.RelaySettings.database.pointerDatabase
        };
    }

    initializeDatabase(callback){
        try {
            this.DBpool = mariaDB.createConnection({
                host:this.RelaySettings.database.host,
                port:this.RelaySettings.database.port,
                user:this.RelaySettings.database.username,
                password:this.RelaySettings.database.password,
                database:this.RelaySettings.database.pointerDatabase,
                idleTimeout:0,
                minDelayValidation:0
            }).then(conn => {
                this.DBConnection = conn;
                this.DBConnection.end();
                callback(undefined);
            }).catch(err => {
                callback(err);
            }).finally(() => {
                if (this.DBConnection){
                    this.DBConnection.end();
                }
            });
        } catch (e) {
            callback(e);
        }
    }

    executePointerQuery(sqlQueryString, SQLValues = undefined, callback) {
        let newSQLConnection = mariaDB.createConnection(this.SQLConnectionInformation).then(
            newConnection => {
                newConnection.query(sqlQueryString, SQLValues).then(
                    queryResponse => {
                        if (queryResponse){
                            newConnection.end();
                            callback(undefined, queryResponse);
                        } else {
                            newConnection.end();
                            callback(new Error("Query response error")); // Make this clearer
                        }
                    }
                ).catch(err => {
                    callback(err)
                }).finally(() => {
                    newConnection.end();
                });
            }
        ).catch(err => {
            callback(err);
        });
    }

    publishNewPointer(newPointer, blob, callback) {
        // Steps
        // Validate pointer object
        // Verify ID and Signature
        // Validate Timestamp (+/- time)
        // Check if existing pointer exists
        // If yes, initiate a replacement (call replacePointer())
        // If no, move below
        // Validate blob hash and size
        // Save blob and pointer
        // Send to callback
        let insertSQLString = 'INSERT INTO Pointers (id, pubkey, `timestamp`, pointerhash, `size`, nonce, signature)';
        try {
            if (newPointer){
                if (pointertools.verifySignature(newPointer)){ // Verify pointer hash and sig
                    let timeStamp = newPointer.timestamp;
                    let timeNow = Math.floor(Date.now() / 1000);
                    let timeDelta = Math.abs(timeStamp - timeNow);

                    // Check time delta
                    // If time delta is 0, any time is permissible
                    // TODO: May want to prevent future dates no matter what
                    if ((this.RelaySettings.pointer.timestampDelta == 0 ? true : false) || timeDelta <= this.RelaySettings.pointer.timestampDelta){
                        let newPointerId = newPointer.id;

                        this.getPointerById(newPointerId, (err, result) => { // Check for existing duplicate ID
                            try {
                                if (!err){
                                    if (!result){
                                        // Check if this is a replacement by looking at
                                        // PointerHash and Pubkey
                                        // If there is an existing PointerHash and PubKey, treat as a replacement
                                        let pointerSearchCriteria = {
                                            owners:[newPointer.pubkey],
                                            pointerhashes:[newPointer.pointerhash]
                                        };

                                        this.getPointerByCriteria(pointerSearchCriteria, (err, results) => {
                                            try {
                                                if (!err) {
                                                    if (results && results.length == 0) { // No existing pubkey claim on data
                                                        // New Pointer
                                                        if (blob && blob.length > 0){
                                                            if (binarytools.isBase64Data(blob)){
                                                                // Verify converted binary matches pointerhash
                                                                let bufferData = binarytools.getBufferData(blob);
                                                                let bufferDataHash = binarytools.getDataHash(bufferData);

                                                                if (bufferDataHash == newPointer.pointerhash){
                                                                    if (bufferData.length <= this.RelaySettings.storage.dataBlockLimit){
                                                                        if (bufferData.length == newPointer.size){
                                                                            // Write data to disk
                                                                            this.DataStorageManager.publishData(bufferData, (err, dataHash) => {
                                                                                try {
                                                                                    if (!err){
                                                                                        // Write pointer to Database
                                                                                        let SQLValues = [
                                                                                            newPointer.id,
                                                                                            newPointer.pubkey,
                                                                                            newPointer.timestamp,
                                                                                            newPointer.pointerhash,
                                                                                            newPointer.size,
                                                                                            newPointer.nonce,
                                                                                            newPointer.signature
                                                                                        ];
                                                                                        let useOld = false;

                                                                                        if (useOld){
                                                                                            // A Rock
                                                                                            this.DBConnection.query(insertSQLString +
                                                                                                ' VALUES (?, ?, ?, ?, ?, ?, ?)',
                                                                                                SQLValues).then((res) => {
                                                                                                    if (res && res.affectedRows == 1){
                                                                                                            callback(undefined, newPointer.id, newPointer.pointerhash);
                                                                                                        } else {
                                                                                                           callback(new Error("SQL Error"), undefined, undefined); 
                                                                                                        }
                                                                                                }).catch(err => {
                                                                                                    let criticalSQLError = ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.NOTICE,
                                                                                                        newPointer ? newPointer.id : "", "Critcal error publishing pointer");
                                                                                                    callback(criticalSQLError, undefined, undefined); 
                                                                                                });
                                                                                            // A hard place
                                                                                        } else {
                                                                                            this.executePointerQuery(insertSQLString +
                                                                                                ' VALUES (?, ?, ?, ?, ?, ?, ?)', SQLValues, (err, response) => {
                                                                                                    if (!err) {
                                                                                                        if (response && response.affectedRows == 1){
                                                                                                            callback(undefined, newPointer.id, newPointer.pointerhash);
                                                                                                        } else {
                                                                                                           callback(new Error("SQL Error"), undefined, undefined); 
                                                                                                        }
                                                                                                    } else {
                                                                                                        callback(new Error("SQL Error"), undefined, undefined); 
                                                                                                    }
                                                                                                });
                                                                                        }


                                                                                    } else {
                                                                                        throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.NOTICE,
                                                                                            newPointer ? newPointer.id : "","Critical error saving data");
                                                                                    }
                                                                                } catch (e) {
                                                                                    console.log(e);
                                                                                    callback(e, undefined, undefined);
                                                                                }
                                                                            });
                                                                        } else {
                                                                            // throw new Error("Data size mismatch of data");
                                                                            throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_SIZE,
                                                                                newPointer.id, "Data size mismatch");
                                                                        }
                                                                    } else {
                                                                        throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_SIZE,
                                                                            newPointer.id, "Data size " + bufferData.length + " exceeds data block limit " + 
                                                                            this.RelaySettings.storage.dataBlockLimit);
                                                                    }
                                                                } else {
                                                                    // throw new Error("Hash mismatch of data and pointerhash");
                                                                    throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_DATA_HASH,
                                                                        newPointer.id, "Hash mismatch of data and pointerhash");
                                                                }
                                                            } else {
                                                                // throw new Error("Invalid data encoding");
                                                                throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_VALUES, 
                                                                    newPointer.id, "Invalid data encoding, expecting base64");
                                                            }
                                                        }
                                                    } else if (results && results.length > 0){
                                                        // Replacement Pointer
                                                        let oldPointerId = results[0].id;
                                                        this.replacePointer(oldPointerId, newPointer, (err, confirmId) => {
                                                            if (!err) {
                                                                callback(undefined, newPointer.id, newPointer.pointerhash);
                                                            } else {
                                                                callback(err, undefined, undefined); 
                                                            }
                                                        });
                                                    } else {
                                                        // throw new Error("Error retrieving pointers");
                                                        throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.ERROR_RETRIVING_POINTERS,
                                                            newPointer ? newPointer.id : "", "");

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
                                        // throw new Error ("Pointer already exists, ignoring");
                                        throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.NOTICE, 
                                            newPointer ? newPointer.id : "", "Duplicate pointer, ignoring");
                                    }
                                } else {
                                    // throw err;
                                    throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.ERROR_RETRIVING_POINTERS, 
                                        newPointer ? newPointer.id : "", "");
                                }
                            } catch (e) {
                                // console.error(e);
                                callback(e, undefined, undefined);
                            }
                        });
                    } else {
                        // throw new Error("invalid timestamp");
                        throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_POINTER, 
                            newPointer ? newPointer.id : "", "Pointer timestamp is not within threshold");
                    }
                    
                } else {
                    // throw new Error("Pointer failed verification");
                    throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_POINTER, 
                        newPointer ? newPointer.id : "", "Pointer verification failed");
                }
            } else {
                // throw new Error("Invalid Pointer");
                throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_POINTER, 
                    newPointer ? newPointer.id : "", "Pointer object malformed");
            }
        } catch (e) {
            console.error(e);
            callback(e, undefined, undefined);
        }
    } // Publish Pointer

    replacePointer(oldPointerId, newPointerObject, callback) {
        // New pointer and old pointer should not be identical
        // callback (err, newPointerObject.id)
        let insertSQLString = 'INSERT INTO Pointers (id, pubkey, `timestamp`, pointerhash, `size`, nonce, signature) ';
        let deleteSQLString = 'DELETE FROM Pointers WHERE id in (?)';
        try {
            if (oldPointerId && newPointerObject && newPointerObject.id){
                // Should I check if the blob exists?

                let SQLValues = [
                    newPointerObject.id,
                    newPointerObject.pubkey,
                    newPointerObject.timestamp,
                    newPointerObject.pointerhash,
                    newPointerObject.size,
                    newPointerObject.nonce,
                    newPointerObject.signature
                ];

                this.executePointerQuery(insertSQLString +
                    ' VALUES (?, ?, ?, ?, ?, ?, ?)',
                    SQLValues, (err, response) => {
                        if (!err) {
                            if (response && response.affectedRows > 0) {
                                callback(undefined, newPointerObject.id);
                            }
                        } else {
                            throw err;
                        }
                    });
            } else {
                // throw new Error("Pointer reference error");
                throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_POINTER, 
                    newPointerObject ? newPointerObject.id : "", "Pointer object malformed");
            }
        } catch (e) {
            console.error(e);
            callback(err, undefined);
        }

    }

    deletePointer(deletionValidationPointer, callback) {
        // We must find the pointer with the same pubkey and pointer hash
        // The nonce should be different from the found pointer
        // The timestamp should also be newer

        // callback(err, deletedPointerId)

        try {
            if (deletionValidationPointer && pointertools.verifySignature(deletionValidationPointer)){
                let dateNow = Math.floor(Date.now() / 1000);
                let publicKey = deletionValidationPointer.pubkey;
                let pointerHash = deletionValidationPointer.pointerhash;

                this.getPointerByPKPH(publicKey, pointerHash, (err, result) => {
                    try {
                        if (result){
                            let pointerResult = this._formatSQLResultsIntoPointers([result])[0];
                            let pointerResultTimeStamp = pointerResult.timestamp;

                            if (pointerResultTimeStamp < deletionValidationPointer.timestamp 
                                && pointerResult.nonce != deletionValidationPointer.nonce){
                                this._removePointerInternal(pointerResult, (err, deletedPointerId) => {
                                    if (!err) {
                                        callback(undefined, deletedPointerId);
                                    } else {
                                        callback(err, undefined);
                                    }
                                });
                            } else {
                                // throw new Error("Invalid deletion pointer");
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
                // throw new Error ("Invalid pointer");
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
            let deleteSQLString = 'DELETE FROM Pointers WHERE id in (?)';
            let pHashSQLString = 'SELECT id FROM Pointers WHERE pointerhash in (?)';

            if (deletionPointer){
                let pointerHash = deletionPointer.pointerhash;
                let deleteBlob = false;

                // OLD
                // this.DBConnection.query(pHashSQLString, pointerHash).then((rows) => {
                //     if (rows && rows.length <= 1){ // If it finds more than "itself" leave blob
                //         deleteBlob = true;
                //     }
                //     return this.DBConnection.query(deleteSQLString, deletionPointer.id);
                // }).then(res => {
                //     if (res && res.affectedRows > 0){
                //         if (deleteBlob){
                //             this.DataStorageManager.deleteData(pointerHash, (err, pHash) => {
                //                 if (!err){
                //                     callback(undefined, deletionPointer.id);
                //                 }
                //             });
                //         } else {
                //             callback(undefined, deletionPointer.id);
                //         }
                //     } else {
                //         // throw new Error("Error deleting pointer");
                // throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.NOTICE, 
                //     deletionPointer ? deletionPointer.id : "", "Critcal error deleting pointer");

                //     }
                // }).catch(err => {
                //     callback(err, undefined);
                // });
                // OLD

                // @TODO Come back to this
                this.executePointerQuery(pHashSQLString, pointerHash, (err, rows) => {
                    if (!err) {
                        if (rows && rows.length <= 1){ // If it finds more than "itself" leave blob
                            deleteBlob = true;
                        }
                        this.executePointerQuery(deleteSQLString, deletionPointer.id, (err, response) => {
                            if (!err) {
                                if (response && response.affectedRows > 0) {
                                    if (deleteBlob) {
                                        this.DataStorageManager.deleteData(pointerHash, (err, pHash) => {
                                            if (!err) {
                                                callback(undefined, deletionPointer.id);
                                            }
                                        });
                                    } else {
                                        callback(undefined, deletionPointer.id);
                                    }
                                } else {
                                    // throw new Error("Error deleting pointer");
                                    throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.NOTICE,
                                        deletionPointer ? deletionPointer.id : "", "Critcal error deleting pointer");
                                }
                            } else {
                                throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.NOTICE,
                                    deletionPointer ? deletionPointer.id : "", "Critcal error deleting pointer");
                            }
                        });
                    } else {
                        // callback(err);
                        throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.NOTICE,
                            deletionPointer ? deletionPointer.id : "", "Critcal error deleting pointer");
                    }
                });
            } else {
                // throw new Error("Invalid Pointer");
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
        // Only return one result (as there should only be 1 result)
        // TODO: Log if there are more than one
        // callback (err, result)
        
        let pointerSearchCriteria = {
            owners:[publicKey],
            pointerhashes:[pointerHash]
        };

        this.getPointerByCriteria(pointerSearchCriteria, (err, results) => {
            if (!err){
                if (results && results.length > 0){
                    callback(err, results[0]);
                } else {
                    callback(err, undefined);
                }
            }
        });
    }

    getPointerById(pointerId, callback, reqId = ""){
        this.getPointerByCriteria({ids:[pointerId]}, (err, results) => {
            if (results && results.length > 0){
                callback(err, results[0]);
            } else {
                callback(err, undefined);
            }
        }, reqId);
    }

    getPointerByCriteria(criteria, callback, reqId = ""){
        let queryString = "SELECT * FROM Pointers ";
        let limit;
        let criteriaStrings = {};
        let results = [];

        if (criteria) {
            if (criteria.ids && Array.isArray(criteria.ids)) {
                criteriaStrings["id"] = this._formatCriteria(criteria.ids, false);
            }
            if (criteria.owners && Array.isArray(criteria.owners)) {
                criteriaStrings["pubkey"] = this._formatCriteria(criteria.owners, false);
            }
            if (criteria.olderthan != undefined && Number.isInteger(criteria.olderthan)) {
                criteriaStrings["timestamp"] = " < " + criteria.olderthan;
            } else if (criteria.since != undefined && Number.isInteger(criteria.since)) {
                criteriaStrings["timestamp"] = " >= " + criteria.since;
            }
            if (criteria.pointerhashes && Array.isArray(criteria.pointerhashes)) {
                criteriaStrings["pointerhash"] = this._formatCriteria(criteria.pointerhashes, false);
            }
            if (criteria.size != undefined && Number.isInteger(criteria.size)) {
                criteriaStrings["size"] = " = " + criteria.size;
            } else if (criteria.sizelargerthan != undefined  && Number.isInteger(criteria.sizelargerthan)) {
                criteriaStrings["size"] = " > " + criteria.sizelargerthan;
            } else if (criteria.sizesmallerthan != undefined && Number.isInteger(criteria.sizesmallerthan)) {
                criteriaStrings["size"] = " < " + criteria.sizesmallerthan;
            }
            if (criteria.limit != undefined && Number.isInteger(criteria.limit)) {
                criteriaStrings["limit"] = criteria.limit;
            }

            let criteriaLabels = Object.keys(criteriaStrings);
            if (criteriaLabels){
                // TODO: Fix Limit 0 issue
                if (!(criteriaLabels.length == 1 && criteriaStrings["limit"] != undefined) &&
                criteriaLabels.length > 0){
                    console.log("Good to go");
                    queryString += " WHERE ";
                    for (let i = 0; i < criteriaLabels.length; i++){
                        let thisLabel = criteriaLabels[i];
        
                        if (thisLabel == "size" || thisLabel == "timestamp" || thisLabel == "limit"){
                            if (thisLabel == "limit"){
                                limit = criteriaStrings["limit"];
                            } else {
                                queryString += ((i > 0) ? " and " : " ") + thisLabel + " " + criteriaStrings[thisLabel];
                            }
                        } else {
                            queryString += ((i > 0) ? " and " : " ") + thisLabel + " in " + criteriaStrings[thisLabel];
                        }
                    }
                } else if (criteriaStrings["limit"]) {
                    limit = Math.abs(criteriaStrings["limit"]);
                }

                if (limit){
                    queryString += " limit " + limit;
                } else {
                    queryString += " limit " + 1000;
                }
                console.log(queryString);
                // OLD
                // this.DBConnection.query(queryString).then((rows) => {
                //     // console.log(rows);
                //     results = this._formatSQLResultsIntoPointers(rows);
                //     callback(undefined, results);
                // }).catch(err => {
                //     console.log("Caught?");
                // });

                // OLD

                this.executePointerQuery(queryString, undefined, (err, rows) => {
                    if (!err) {
                        results = this._formatSQLResultsIntoPointers(rows);
                        callback(undefined, results);
                    } else {
                        throw err;
                    }
                });
            } else {
                let invalidQueryError = ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_QUERY, reqId, "");
                callback(invalidQueryError, undefined);
            }
        } else {
            // callback(new Error("No Criteria. Need Error here"), undefined);
            let invalidQueryError = ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_QUERY, reqId, "");
            callback(invalidQueryError, undefined);
        }
    }

    getBinaryByPointerId(pointerId, callback){
        try {
            if (pointerId){
                this.getPointerById(pointerId, (err, result) => {
                    try {
                        if (!err) {
                            if (result) {
                                let pointerHash = result.pointerhash;
                                this.DataStorageManager.getDataByHash(pointerHash, (err, blob) => {
                                    try {
                                        if (!err){
                                            if (blob) {
                                                if (blob.length == result.size){
                                                    let base64Data = binarytools.getBase64(blob);
                                                    callback (undefined, pointerHash, base64Data);
                                                } else {
                                                    // throw new Error ("Blob size mismatch from pointer");
                                                    throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_SIZE,
                                                        pointerId ? pointerId : "", "Data size mismatch");
                                                }
                                            } else {
                                                // throw new Error ("Blob data empty");
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
                                // throw new Error("Pointer not found");
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
            //  throw new Error("Pointer ID missing"); 
             throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_POINTER, 
                pointerId ? pointerId : "", "Pointer object malformed");
            }
        } catch (e) {
            callback(e, undefined, undefined);
        }
    }

    _formatSQLResultsIntoPointers(SQLResults){
        let pointerArray = [];

        if (SQLResults && SQLResults.length > 0){
            for (let i = 0; i < SQLResults.length; i++){
                let thisSQLResult = SQLResults[i];
                let thisPointer = {
                    id:thisSQLResult.id,
                    pubkey:thisSQLResult.pubkey,
                    timestamp:thisSQLResult.timestamp,
                    pointerhash:thisSQLResult.pointerhash,
                    size:thisSQLResult.size,
                    nonce:thisSQLResult.nonce,
                    signature:thisSQLResult.signature
                };

                if (pointertools.verifySignature(thisPointer)){
                    pointerArray.push(thisPointer);
                }
            }
        }

        return pointerArray;
    }

    _formatCriteria(criteriaList, isNum) {
        let sqlCriteria = "";

        if (criteriaList && criteriaList.length > 0){
            sqlCriteria += '(';
            for (let i = 0; i < criteriaList.length; i++){
                sqlCriteria += (!isNum ? '"' : '') + criteriaList[i] + (!isNum ? '"' : '') + (i == criteriaList.length - 1 ? '' : ',');
            }
            sqlCriteria += ')';
        } else if (criteriaList.length == 0) {
            sqlCriteria += '(' +  (!isNum ? '"' : 0) + (!isNum ? '"' : '') + ')';
        }

        return sqlCriteria;
    }
}