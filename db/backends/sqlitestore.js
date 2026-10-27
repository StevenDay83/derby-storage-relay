const Database = require('better-sqlite3');
const { buildCriteriaQuery } = require('./pointerstore.js');

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS Pointers (
  id TEXT PRIMARY KEY,
  pubkey TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  pointerhash TEXT NOT NULL,
  size INTEGER NOT NULL,
  nonce INTEGER NOT NULL,
  signature TEXT NOT NULL
)`;

const CREATE_INDEX_SQL = [
    'CREATE INDEX IF NOT EXISTS idx_pointers_pubkey ON Pointers(pubkey)',
    'CREATE INDEX IF NOT EXISTS idx_pointers_pointerhash ON Pointers(pointerhash)',
    'CREATE INDEX IF NOT EXISTS idx_pointers_timestamp ON Pointers(timestamp)'
];

// SQLite pointer store backend (better-sqlite3). better-sqlite3 is
// synchronous; methods still follow the async callback contract in
// ./pointerstore.js so backends are interchangeable.
class SQLitePointerStore {
    constructor(databaseSettings) {
        this.DatabaseFile = databaseSettings.file || './pointers.db';
        this.DB;
    }

    init(callback) {
        try {
            this.DB = new Database(this.DatabaseFile);
            this.DB.pragma('journal_mode = WAL');

            let tableExisted = this.DB.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='Pointers'"
            ).get() != undefined;

            this.DB.exec(CREATE_TABLE_SQL);
            CREATE_INDEX_SQL.forEach(indexSQL => this.DB.exec(indexSQL));

            callback(undefined, tableExisted);
        } catch (e) {
            callback(e);
        }
    }

    close(callback) {
        try {
            if (this.DB) {
                this.DB.close();
            }
            callback(undefined);
        } catch (e) {
            callback(e);
        }
    }

    insertPointer(pointer, replacePointerId, callback) {
        try {
            let insertStatement = this.DB.prepare(
                'INSERT INTO Pointers (id, pubkey, timestamp, pointerhash, size, nonce, signature) ' +
                'VALUES (?, ?, ?, ?, ?, ?, ?)'
            );

            let runInsert = this.DB.transaction((thisPointer, oldPointerId) => {
                insertStatement.run(
                    thisPointer.id,
                    thisPointer.pubkey,
                    thisPointer.timestamp,
                    thisPointer.pointerhash,
                    thisPointer.size,
                    thisPointer.nonce,
                    thisPointer.signature
                );

                if (oldPointerId) {
                    this.DB.prepare('DELETE FROM Pointers WHERE id = ?').run(oldPointerId);
                }
            });

            runInsert(pointer, replacePointerId);
            callback(undefined);
        } catch (e) {
            callback(e);
        }
    }

    deletePointerById(id, callback) {
        try {
            let result = this.DB.prepare('DELETE FROM Pointers WHERE id = ?').run(id);
            callback(undefined, result.changes);
        } catch (e) {
            callback(e);
        }
    }

    getPointerById(id, callback) {
        try {
            let row = this.DB.prepare('SELECT * FROM Pointers WHERE id = ?').get(id);
            callback(undefined, row);
        } catch (e) {
            callback(e);
        }
    }

    getPointerByPubkeyHash(pubkey, pointerhash, callback) {
        try {
            let row = this.DB.prepare(
                'SELECT * FROM Pointers WHERE pubkey = ? AND pointerhash = ?'
            ).get(pubkey, pointerhash);
            callback(undefined, row);
        } catch (e) {
            callback(e);
        }
    }

    queryPointers(criteria, callback) {
        try {
            let query = buildCriteriaQuery(criteria);
            let sqlString = 'SELECT * FROM Pointers' + query.where;

            if (query.limit != undefined) {
                sqlString += ' LIMIT ?';
                query.params.push(query.limit);
            }

            let rows = this.DB.prepare(sqlString).all(...query.params);
            callback(undefined, rows);
        } catch (e) {
            callback(e);
        }
    }

    countSumByPubkey(callback) {
        try {
            let rows = this.DB.prepare(
                'SELECT pubkey, COUNT(id) AS count, SUM(size) AS totalsize FROM Pointers GROUP BY pubkey'
            ).all();
            callback(undefined, rows);
        } catch (e) {
            callback(e);
        }
    }

    countByPointerHash(pointerhash, callback) {
        try {
            let row = this.DB.prepare(
                'SELECT COUNT(id) AS count FROM Pointers WHERE pointerhash = ?'
            ).get(pointerhash);
            callback(undefined, row ? row.count : 0);
        } catch (e) {
            callback(e);
        }
    }
}

module.exports = SQLitePointerStore;
