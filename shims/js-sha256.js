// Build-time replacement for the js-sha256 package (a bip-schnorr dependency).
// js-sha256 loads Node's crypto via eval("require('crypto')"), which fails in
// bun-compiled standalone binaries. Only the create().update().array() API is
// used (by bip-schnorr/src/convert.js), backed here by Node native crypto.
const crypto = require('crypto');

function sha256() {
    throw new Error('js-sha256 shim only supports sha256.create().update().array()');
}

sha256.create = function () {
    const hash = crypto.createHash('sha256');
    const wrapper = {
        update(data) {
            hash.update(data);
            return wrapper;
        },
        array() {
            return Array.from(hash.digest());
        }
    };
    return wrapper;
};

module.exports = sha256;
