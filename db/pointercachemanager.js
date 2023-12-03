const PointerTools = require("../pointer/pointer.js");

class PointerCacheManager {
    constructor(cacheSettings){
        this.CacheTable = {};
        this.CacheTimeStampTable = {};
        this.CacheSettings = cacheSettings;

        setInterval(() => this.removeOldCacheItems(), 10000);
    }

    importPointersIntoCache(pointersArray) {
        let cacheCount = 0;

        if (pointersArray && Array.isArray(pointersArray) && pointersArray.length > 0){
            let newCacheTable = {};

            pointersArray.forEach(thisPointer => {
                if (PointerTools.verifySignature(thisPointer)){
                    newCacheTable[thisPointer.id] = [thisPointer, Math.floor(Date.now() / 1000)];
                }
            });

            cacheCount = Object.keys(newCacheTable).length;
            if (cacheCount > 0){
                this.CacheTable = newCacheTable;
            }
        }

        return cacheCount;
    }

    getPointerById(pointerId) {
        let requestedPointer;

        if (pointerId && pointerId.length == 64 && pointerId in this.CacheTable) {
            requestedPointer = this.CacheTable[pointerId][0];
            this._updatePointCacheTimestamp(pointerId);
        }

        return requestedPointer;
    }

    addPointerToCache(newPointer) {
        let success = false;

        if (PointerTools.verifySignature(newPointer)){
            this.CacheTable[newPointer.id] = [newPointer, Math.floor(Date.now() / 1000)];
            success = true;
        }

        return success;
    }

    removePointerFromCache(deletePointerId) {
        let success = false;

        if (deletePointerId && deletePointerId.length == 64){
            if (deletePointerId in this.CacheTable){
                delete this.CacheTable[deletePointerId];

                success = true;
            }
        }

        return success;
    }

    getPointerByPKPH(publicKey, pointerHash) {
        let pointersArray = Object.values(this.CacheTable);
        let requestedPointer;

        pointersArray.every(thisPointerCache => {
            let thisPointer = thisPointerCache[0];
            let foundPointer = (thisPointer.pubkey == publicKey && thisPointer.pointerhash == pointerHash);

            if (foundPointer){
                requestedPointer = thisPointer;
                this._updatePointCacheTimestamp(foundPointer.id);
            }

            return foundPointer;
        });

        return requestedPointer;
    }

    removeOldCacheItems() {
        if (this.CacheSettings && this.CacheSettings.cacheTTL){
            let timeNow = Math.floor(Date.now() / 1000);
            let pointerArray = Object.values(this.CacheTable);
            let deletionPointerIdArray = [];

            pointerArray.forEach(thisPointerCache => {
                let thisPointer = thisPointerCache[0];
                let timeStamp = thisPointerCache[1];

                if (timeNow - timeStamp > this.CacheSettings.cacheTTL){
                    deletionPointerArray.push(thisPointer.id);
                }
            });

            deletionPointerIdArray.forEach(deletionPointerId => {
                this.removePointerFromCache(deletionPointerId);
            });
        }
    }

    _updatePointCacheTimestamp(pointerId){
        let timeNow = Math.floor(Date.now() / 1000);

        this.CacheTable[pointerId][1] = timeNow;
    }
}

module.exports = PointerCacheManager;