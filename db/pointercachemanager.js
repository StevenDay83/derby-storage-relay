class PointerCacheManager {
    constructor(cacheSettings){
        this.CacheSettings = cacheSettings || {};
        let pointerCacheSettings = this.CacheSettings.pointerCache || {};

        this.CacheTTL = pointerCacheSettings.pointerCacheTTL != undefined ? pointerCacheSettings.pointerCacheTTL :
            (pointerCacheSettings.cacheTTL != undefined ? pointerCacheSettings.cacheTTL : 0);
        this.MaxPointers = pointerCacheSettings.maxPointers != undefined && pointerCacheSettings.maxPointers > 0 ?
            pointerCacheSettings.maxPointers : 10000;

        // Map preserves insertion order; the first key is the least recently
        // used, which makes LRU eviction O(1) per evicted entry.
        this.CacheTable = new Map();

        setInterval(() => this.removeOldCacheItems(), 10000);
    }

    getPointerById(pointerId) {
        let requestedPointer;

        if (pointerId && pointerId.length == 64 && this.CacheTable.has(pointerId)) {
            let cacheEntry = this.CacheTable.get(pointerId);
            requestedPointer = cacheEntry.pointer;
            this._updatePointerCacheTimestamp(pointerId);
        }

        return requestedPointer;
    }

    addPointerToCache(newPointer) {
        let success = false;

        if (newPointer && newPointer.id && newPointer.id.length == 64) {
            if (this.CacheTable.has(newPointer.id)) {
                this.CacheTable.delete(newPointer.id);
            }

            this.CacheTable.set(newPointer.id, {
                pointer: newPointer,
                timestamp: Math.floor(Date.now() / 1000)
            });

            // Evict least recently used entries once the cache is full.
            // The database is the source of truth, so eviction is lossless.
            while (this.CacheTable.size > this.MaxPointers) {
                let oldestKey = this.CacheTable.keys().next().value;
                this.CacheTable.delete(oldestKey);
            }

            success = true;
        }

        return success;
    }

    removePointerFromCache(deletePointerId) {
        let success = false;

        if (deletePointerId && deletePointerId.length == 64){
            success = this.CacheTable.delete(deletePointerId);
        }

        return success;
    }

    removeOldCacheItems() {
        // A TTL of 0 disables time-based eviction
        if (this.CacheTTL > 0){
            let timeNow = Math.floor(Date.now() / 1000);
            let deletionPointerIdArray = [];

            this.CacheTable.forEach((cacheEntry, pointerId) => {
                if (timeNow - cacheEntry.timestamp > this.CacheTTL){
                    deletionPointerIdArray.push(pointerId);
                }
            });

            deletionPointerIdArray.forEach(deletionPointerId => {
                this.removePointerFromCache(deletionPointerId);
            });
        }
    }

    _updatePointerCacheTimestamp(pointerId){
        let cacheEntry = this.CacheTable.get(pointerId);

        if (cacheEntry){
            cacheEntry.timestamp = Math.floor(Date.now() / 1000);

            // Refresh LRU position
            this.CacheTable.delete(pointerId);
            this.CacheTable.set(pointerId, cacheEntry);
        }
    }
}

module.exports = PointerCacheManager;
