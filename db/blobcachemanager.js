const Logger = require('../logging/log.js');

class BlobCacheManager {
    constructor(cacheSettings){
        this.CacheTTL = cacheSettings && cacheSettings.blobCache && cacheSettings.blobCache.blobCacheTTL ? 
        cacheSettings.blobCache.blobCacheTTL : 300;
        this.CacheSizeLimit = cacheSettings && cacheSettings.blobCache && cacheSettings.blobCache.blobCacheSizeLimit ? 
        cacheSettings.blobCache.blobCacheSizeLimit : 100000000;
        this.BlobCacheTable = {};
        this.CacheTableSize = 0;

        setInterval(() => this.removeExpiredCache(), 10000);
    }

    addBlobToCache(blobHash, binaryData){
        let success = false;

        if (blobHash && blobHash.length == 64 &&
            binaryData && binaryData.length > 0) {
                if (!(binaryData.length > this.CacheSizeLimit)){
                    let newCacheSize = this.CacheTableSize + binaryData.length;
    
                    if (newCacheSize > this.CacheSizeLimit){
                        this._popCacheItem(binaryData.length);
                    }

                    let timeNow = Math.floor(Date.now() / 1000);
                    let thisBlobCache = {
                        data:binaryData,
                        timestamp:timeNow
                    };

                    Logger.WriteInfoLog("Adding data (" + blobHash + ") to cache");
                    this.BlobCacheTable[blobHash] = thisBlobCache;
                    this.CacheTableSize += binaryData.length;

                    success = true;
                }
            }

        return success;
    }

    getBlobByHash(blobHash){
        let binaryData;

        if (blobHash && blobHash.length == 64){
            let thisBlobCache = this.BlobCacheTable[blobHash];

            if (thisBlobCache){
                binaryData = thisBlobCache.data;
                this._updateBlobCacheTimeStamp(blobHash);
            }
        }

        return binaryData;
    }

    removeBlobFromCache(blobHash){
        let success = false;

        if (blobHash && blobHash.length == 64){
            let thisBlobCache = this.BlobCacheTable[blobHash];

            if (thisBlobCache){
                let binaryDataSize = thisBlobCache.data.length;

                delete this.BlobCacheTable[blobHash];
                this.CacheTableSize -= binaryDataSize;

                success = true;
            } 
        }

        return success;
    }

    removeExpiredCache(){
        let blobHashArray = Object.keys(this.BlobCacheTable);
        let deletionBlobHashArray = [];
        let timeNow = Math.floor(Date.now() / 1000);

        blobHashArray.forEach(thisBlobHash => {
            let thisBlobCache = this.BlobCacheTable[thisBlobHash];

            if (thisBlobCache){
                let blobCacheTimeStamp = thisBlobCache.timestamp;

                if ((timeNow - blobCacheTimeStamp) >= this.CacheTTL){
                    deletionBlobHashArray.push(thisBlobHash);
                }
            }
        });

        deletionBlobHashArray.forEach(thisBlobHash => {
            this.removeBlobFromCache(thisBlobHash);
            Logger.WriteInfoLog("Removed data (" + thisBlobHash + ") from cache: Expired");
        });
    }

    _updateBlobCacheTimeStamp(blobHash){
        if (blobHash && blobHash.length == 64) {
            let thisBlobCache = this.BlobCacheTable[blobHash];
            let timeNow = Math.floor(Date.now() / 1000);

            if (thisBlobCache){
                thisBlobCache.timestamp = timeNow;
            }
        }
    }

    _popCacheItem(cacheItemSize){
        let poppedBlobCacheArray = [];
        let blobHashArray = Object.keys(this.BlobCacheTable);
        let sizeRemoved = 0;
        
        blobHashArray.every(thisBlobHash => {
            let thisBlobCache = this.BlobCacheTable[thisBlobHash];
            let thisBlobSize = thisBlobCache.data.length;

            sizeRemoved += thisBlobSize;
            poppedBlobCacheArray.push(thisBlobHash);

            return (sizeRemoved >= cacheItemSize);
        });

        poppedBlobCacheArray.forEach(thisBlobHash => {
            Logger.WriteInfoLog("Popping data (" + thisBlobHash + ") from cache: Clearing room");
            this.removeBlobFromCache(thisBlobHash);
        });
    }
}

module.exports = BlobCacheManager;