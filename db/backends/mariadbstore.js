const mariaDB = require('mariadb/callback');
const { buildCriteriaQuery } = require('./pointerstore.js');

const CREATE_TABLE_SQL = "CREATE TABLE IF NOT EXISTS `Pointers` (" +
    "  `id` varchar(64) NOT NULL COMMENT 'Pointer ID'," +
    "  `pubkey` varchar(64) NOT NULL COMMENT 'Pointer Public Key'," +
    "  `timestamp` int(10) unsigned NOT NULL COMMENT 'Unix Time in Seconds'," +
    "  `pointerhash` varchar(64) NOT NULL COMMENT 'Hash to Pointed Data'," +
    "  `size` int(10) unsigned NOT NULL COMMENT 'Size of pointed data'," +
    "  `nonce` int(10) unsigned NOT NULL COMMENT 'Nonce data'," +
    "  `signature` varchar(128) NOT NULL COMMENT 'Schnorr signature'," +
    "  PRIMARY KEY (`id`)," +
    "  KEY `idx_pointers_pubkey` (`pubkey`)," +
    "  KEY `idx_pointers_pointerhash` (`pointerhash`)," +
    "  KEY `idx_pointers_timestamp` (`timestamp`)" +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci";

// MariaDB pointer store backend. Callback contract per ./pointerstore.js.
class MariaDBPointerStore {
    constructor(databaseSettings) {
        this.SQLConnectionInformation = {
            host: databaseSettings.host,
            port: databaseSettings.port,
            user: databaseSettings.username,
            password: databaseSettings.password,
            database: databaseSettings.pointerDatabase,
            connectionLimit: 100
        };
        this.DBpool;
    }

    init(callback) {
        try {
            this.DBpool = mariaDB.createPool(this.SQLConnectionInformation);

            this._query(CREATE_TABLE_SQL, undefined, (err, response) => {
                if (!err) {
                    // warningStatus is 0 when the table already existed
                    callback(undefined, !(response && response.warningStatus));
                } else {
                    callback(err);
                }
            });
        } catch (e) {
            callback(e);
        }
    }

    close(callback) {
        try {
            if (this.DBpool) {
                this.DBpool.end(() => callback(undefined));
            } else {
                callback(undefined);
            }
        } catch (e) {
            callback(e);
        }
    }

    insertPointer(pointer, replacePointerId, callback) {
        this.DBpool.getConnection((err, connection) => {
            if (err) {
                callback(err);
                return;
            }

            let finish = (finishErr) => {
                if (finishErr) {
                    connection.rollback(() => {
                        connection.end();
                        callback(finishErr);
                    });
                } else {
                    connection.commit(commitErr => {
                        connection.end();
                        callback(commitErr);
                    });
                }
            };

            connection.beginTransaction(beginErr => {
                if (beginErr) {
                    connection.end();
                    callback(beginErr);
                    return;
                }

                connection.query(
                    'INSERT INTO Pointers (id, pubkey, `timestamp`, pointerhash, `size`, nonce, signature) ' +
                    'VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [
                        pointer.id,
                        pointer.pubkey,
                        pointer.timestamp,
                        pointer.pointerhash,
                        pointer.size,
                        pointer.nonce,
                        pointer.signature
                    ],
                    insertErr => {
                        if (insertErr) {
                            finish(insertErr);
                            return;
                        }

                        if (replacePointerId) {
                            connection.query('DELETE FROM Pointers WHERE id = ?', [replacePointerId],
                                deleteErr => finish(deleteErr));
                        } else {
                            finish(undefined);
                        }
                    });
            });
        });
    }

    deletePointerById(id, callback) {
        this._query('DELETE FROM Pointers WHERE id = ?', [id], (err, response) => {
            if (!err) {
                callback(undefined, response ? Number(response.affectedRows) : 0);
            } else {
                callback(err);
            }
        });
    }

    getPointerById(id, callback) {
        this._query('SELECT * FROM Pointers WHERE id = ?', [id], (err, rows) => {
            if (!err) {
                callback(undefined, rows && rows.length > 0 ? rows[0] : undefined);
            } else {
                callback(err);
            }
        });
    }

    getPointerByPubkeyHash(pubkey, pointerhash, callback) {
        this._query('SELECT * FROM Pointers WHERE pubkey = ? AND pointerhash = ?', [pubkey, pointerhash],
            (err, rows) => {
                if (!err) {
                    callback(undefined, rows && rows.length > 0 ? rows[0] : undefined);
                } else {
                    callback(err);
                }
            });
    }

    queryPointers(criteria, callback) {
        let query = buildCriteriaQuery(criteria);
        let sqlString = 'SELECT * FROM Pointers' + query.where;

        if (query.limit != undefined) {
            sqlString += ' LIMIT ?';
            query.params.push(query.limit);
        }

        this._query(sqlString, query.params, callback);
    }

    countSumByPubkey(callback) {
        this._query('SELECT pubkey, COUNT(id) AS count, SUM(size) AS totalsize FROM Pointers GROUP BY pubkey',
            undefined, (err, rows) => {
                if (!err) {
                    let indexRows = (rows || []).map(thisRow => {
                        return {
                            pubkey: thisRow.pubkey,
                            count: Number(thisRow.count),
                            totalsize: Number(thisRow.totalsize)
                        };
                    });
                    callback(undefined, indexRows);
                } else {
                    callback(err);
                }
            });
    }

    countByPointerHash(pointerhash, callback) {
        this._query('SELECT COUNT(id) AS count FROM Pointers WHERE pointerhash = ?', [pointerhash],
            (err, rows) => {
                if (!err) {
                    callback(undefined, rows && rows.length > 0 ? Number(rows[0].count) : 0);
                } else {
                    callback(err);
                }
            });
    }

    _query(sqlString, sqlValues, callback) {
        this.DBpool.getConnection((err, connection) => {
            if (!err) {
                connection.query(sqlString, sqlValues, (queryErr, queryResponse) => {
                    connection.end();
                    if (!queryErr) {
                        callback(undefined, queryResponse);
                    } else {
                        callback(queryErr);
                    }
                });
            } else {
                callback(err);
            }
        });
    }
}

module.exports = MariaDBPointerStore;
