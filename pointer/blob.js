const sha256 = require('sha256');

module.exports.getDataHash = function (bufferData){
    let bufHash;

    if (Buffer.isBuffer(bufferData)){
        bufHash = sha256(bufferData);
    }

    return bufHash;
}

module.exports.chunkData = function(bufferData, blockSize) {
    let chunkArray = [];
    
    if (Buffer.isBuffer(bufferData) && blockSize > 0){
        let numBlocks = Math.floor(bufferData.length / blockSize);
        let remainderBytes = bufferData.length % blockSize;

        for (let i = 0; i < numBlocks; i++){
            chunkArray.push(bufferData.slice(blockSize * i, (blockSize * (i + 1))));
        }

        // chunkArray.push(bufferData.length - remainderBytes, bufferData.length);
        chunkArray.push(bufferData.slice(bufferData.length - remainderBytes, bufferData.length))
    }

    return chunkArray;
}

module.exports.getBase64 = function (bufferData){
    let base64Data;

    if (Buffer.isBuffer(bufferData)){
        base64Data = bufferData.base64Slice();
    }

    return base64Data;
}

module.exports.getBufferData = function(base64Data){
    let bufferData;

    if (base64Data != undefined){
        bufferData = Buffer.from(base64Data, 'base64');
    }

    return bufferData;
}

module.exports.publishBlobToFile = function (directory, bufferData, callback) {
    if (Buffer.isBuffer(bufferData)){
        const fs = require('fs');
        try {
            let fileName = module.exports.getDataHash(bufferData) + '.blob';
    
            fs.writeFile(directory + '/' + fileName, bufferData, err => {
                if (err) {
                    callback(undefined, err);
                } else {
                    callback(fileName, undefined);
                }
            });
        } catch (e) {
            callback(undefined, e);
        }
    } else {
        callback(undefined, new Error("Data is not Buffer"));
    }
}

module.exports.isBase64Data = function (thisData){
    return true;
    // TODO: Put some checks
}