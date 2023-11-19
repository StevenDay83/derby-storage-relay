// module.exports = function p() {console.log("Hi")};
const sha256 = require('sha256');
const BigInteger = require('bigi');
const schnorr = require('bip-schnorr');
const nostrtools = require('nostr-tools');

module.exports.generatePointerId = function (pointerObject){
    var genID;

    if (checkForAttributes(pointerObject)){
        var pointerJSON = getOrderedJSONString(pointerObject);
        genID = sha256(pointerJSON);
    }
    // TODO throw error if not valid
    return genID;
}

module.exports.generateSignature = function(privateKey, pointerObject){
    var genSignature;
    if (pointerObject.id && nostrtools.getPublicKey(privateKey) === pointerObject.pubkey){
        var bigPrivKey = BigInteger.fromHex(privateKey);
        var hexID = Buffer.from(pointerObject.id, 'hex');
        genSignature = schnorr.sign(bigPrivKey, hexID);
    }
    // Todo Throw error if not valid
    return genSignature.toString('hex');
}

module.exports.verifySignature = function (pointerObject){
    var verified = false;

    if (pointerObject.id && pointerObject.signature && pointerObject.pubkey && module.exports.verifyId(pointerObject)){
        var bufID = Buffer.from(pointerObject.id, 'hex');
        var bufSignature = Buffer.from(pointerObject.signature, 'hex');
        var bufPubKey = Buffer.from(pointerObject.pubkey, 'hex');
        try {
            schnorr.verify(bufPubKey, bufID, bufSignature);
            verified = true;
        } catch (e) {
            verified = false;
        }
    }

    return verified;
}

module.exports.verifyId = function(pointerObject){
    var testObject = {
        pubkey:pointerObject.pubkey,
        timestamp:pointerObject.timestamp,
        size:pointerObject.size,
        pointerhash:pointerObject.pointerhash,
        nonce:pointerObject.nonce
    };

    var testID = module.exports.generatePointerId(testObject);

    return (testID == pointerObject.id);
}

function getOrderedJSONString(pointerObject){
    return JSON.stringify(pointerObject,["id","pubkey","timestamp","pointerhash","size","nonce","signature"]);
}

module.exports.getPointerString = function (pointerObject){
    return getOrderedJSONString(pointerObject);
};

function checkForAttributes(pointerObject){
    var isValid = false;
    if (!pointerObject.id && !pointerObject.signature && (pointerObject.nonce != undefined) && pointerObject.pubkey && pointerObject.pointerhash && pointerObject.timestamp && pointerObject.size){
        // Todo Check for timestamp and size as integers
        isValid = true;
    }
    return isValid;
}