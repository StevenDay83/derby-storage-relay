// Pointer store backend interface contract.
//
// A pointer store backend persists pointer metadata (blobs themselves live on
// the filesystem, content-addressed by pointerhash). All methods are
// callback-style: callback(err, result).
//
// Implementations: ./mariadbstore.js, ./sqlitestore.js
//
// Pointer object shape:
//   {
//     id: string,          // 64-char hex, sha256 of ordered pointer JSON
//     pubkey: string,      // 64-char hex
//     timestamp: number,   // unix seconds
//     pointerhash: string, // 64-char hex, sha256 of the blob data
//     size: number,        // blob size in bytes
//     nonce: number,
//     signature: string    // 128-char hex schnorr signature
//   }
//
// Required methods:
//
//   init(callback)
//     Open the connection/database and create the Pointers table and indexes
//     if they do not exist. callback(err, tableExisted)
//
//   close(callback)
//     Shut down the connection/pool. callback(err)
//
//   insertPointer(pointer, replacePointerId, callback)
//     Insert the pointer. If replacePointerId is given, delete that pointer in
//     the SAME transaction so a replace is atomic. callback(err)
//
//   deletePointerById(id, callback)
//     callback(err, affectedRows)
//
//   getPointerById(id, callback)
//     callback(err, pointer|undefined)
//
//   getPointerByPubkeyHash(pubkey, pointerhash, callback)
//     Indexed lookup of a single pointer by owner+hash. callback(err, pointer|undefined)
//
//   queryPointers(criteria, callback)
//     criteria: {ids, owners, olderthan, since, pointerhashes, size,
//                sizelargerthan, sizesmallerthan, limit}
//     callback(err, rows) — rows are raw pointer objects
//
//   countSumByPubkey(callback)
//     callback(err, [{pubkey, count, totalsize}]) — used for the quota index
//
//   countByPointerHash(pointerhash, callback)
//     callback(err, count) — blob refcount used before deleting blob data

// Shared criteria -> WHERE builder. Both backends use '?' bound parameters,
// so the generated fragment is identical; only execution differs.
// Returns { where: string ('' if none), params: array, limit: number|undefined }
function buildCriteriaQuery(criteria) {
    let whereClauses = [];
    let params = [];
    let limit;

    if (criteria) {
        if (Array.isArray(criteria.ids) && criteria.ids.length > 0) {
            whereClauses.push('id IN (' + criteria.ids.map(() => '?').join(',') + ')');
            params.push(...criteria.ids);
        }
        if (Array.isArray(criteria.owners) && criteria.owners.length > 0) {
            whereClauses.push('pubkey IN (' + criteria.owners.map(() => '?').join(',') + ')');
            params.push(...criteria.owners);
        }
        if (Number.isInteger(criteria.olderthan)) {
            whereClauses.push('`timestamp` < ?');
            params.push(criteria.olderthan);
        } else if (Number.isInteger(criteria.since)) {
            whereClauses.push('`timestamp` >= ?');
            params.push(criteria.since);
        }
        if (Array.isArray(criteria.pointerhashes) && criteria.pointerhashes.length > 0) {
            whereClauses.push('pointerhash IN (' + criteria.pointerhashes.map(() => '?').join(',') + ')');
            params.push(...criteria.pointerhashes);
        }
        if (Number.isInteger(criteria.size)) {
            whereClauses.push('`size` = ?');
            params.push(criteria.size);
        } else if (Number.isInteger(criteria.sizelargerthan)) {
            whereClauses.push('`size` > ?');
            params.push(criteria.sizelargerthan);
        } else if (Number.isInteger(criteria.sizesmallerthan)) {
            whereClauses.push('`size` < ?');
            params.push(criteria.sizesmallerthan);
        }
        if (Number.isInteger(criteria.limit) && criteria.limit > 0) {
            limit = criteria.limit;
        }
    }

    return {
        where: whereClauses.length > 0 ? ' WHERE ' + whereClauses.join(' AND ') : '',
        params: params,
        limit: limit
    };
}

module.exports.buildCriteriaQuery = buildCriteriaQuery;
