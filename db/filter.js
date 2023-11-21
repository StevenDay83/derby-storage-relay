// "canpublish":true,
// "canreplace":true,
// "candelete":true,
// "pointerexpiration":7884000,
// "maximumpointers":1000,
// "maximumpointerhashsize":50000000

const CAN_PUBLISH = "canpublish";
const CAN_REPLACE = "canreplace";
const CAN_DELETE = "candelete";
const POINTER_EXPIRATION = "pointerexpiration";
const MAX_POINTERS = "maximumpointers";
const MAX_POINTERHASH_SIZE = "maximumpointerhashsize";

const POINTER_PUBLISH_DENY = 0;
const POINTER_REPLACE_DENY = 1;
const POINTER_DELETE_DENY = 2;
const POINTER_COUNT_QUOTA = 3;
const POINTER_SIZE_QUOTA = 4;
const POINTER_ACCEPTED = 0xa;

const DEFAULT_FILTER_GROUP = {
    "default": {
        "settings": {
            "canpublish": true,
            "canreplace": true,
            "candelete": true,
            "pointerexpiration": 0,
            "maximumpointers": 1000,
            "maximumpointerhashsize": 50000000
        }
    }
};

const fs = require('fs');

class KeysFilterManager {
    constructor(GlobalSettings, pointerIndexer){
        this.FilterGroupFile = GlobalSettings.filter.filtergroupfile;
        this.FilterKeysFiles = GlobalSettings.filter.filterkeysfile;
        this.FilterGroup = DEFAULT_FILTER_GROUP;
        this.PublicKeysFilter;
        this.PointerIndexer = pointerIndexer;
    }

    loadFilterGroups(){
        let success = false;
    
        try {
            let filterGroupFileDataJSON = JSON.parse(fs.readFileSync(this.FilterGroupFile));

            if (filterGroupFileDataJSON && 
                Object.keys(filterGroupFileDataJSON).length > 0 && filterGroupFileDataJSON.default){
                    this.FilterGroup = filterGroupFileDataJSON;

                    Object.keys(this.FilterGroup).every(thisGroup => {
                        this.FilterGroup[thisGroup].settings[CAN_PUBLISH] = this.FilterGroup[thisGroup].settings[CAN_PUBLISH] ? true : false;
                        this.FilterGroup[thisGroup].settings[CAN_REPLACE] = this.FilterGroup[thisGroup].settings[CAN_REPLACE] ? true : false;
                        this.FilterGroup[thisGroup].settings[CAN_DELETE] = this.FilterGroup[thisGroup].settings[CAN_DELETE] ? true : false;

                        this.FilterGroup[thisGroup].settings[POINTER_EXPIRATION] = this.FilterGroup[thisGroup].settings[POINTER_EXPIRATION] != undefined && 
                        Number(this.FilterGroup[thisGroup].settings[POINTER_EXPIRATION]) >= 0 ?
                        this.FilterGroup[thisGroup].settings[POINTER_EXPIRATION] : 0;

                        this.FilterGroup[thisGroup].settings[MAX_POINTERS] = this.FilterGroup[thisGroup].settings[MAX_POINTERS] != undefined && 
                        Number(this.FilterGroup[thisGroup].settings[MAX_POINTERS]) >= 0 ? 
                        this.FilterGroup[thisGroup].settings[MAX_POINTERS] : 0;

                        this.FilterGroup[thisGroup].settings[MAX_POINTERHASH_SIZE] = this.FilterGroup[thisGroup].settings[MAX_POINTERHASH_SIZE] != undefined  && 
                        Number(this.FilterGroup[thisGroup].settings[MAX_POINTERHASH_SIZE]) >= 0 ? 
                        this.FilterGroup[thisGroup].settings[MAX_POINTERHASH_SIZE] : 0;
                        success = true;
                    });
                } else {
                    this.FilterGroup = DEFAULT_FILTER_GROUP;
                }
        } catch (e) {
            throw e;
        }

        return success;
    }

    loadFilterKeys(){
        let success = false;

        try {
            let filterKeys = JSON.parse(fs.readFileSync(this.FilterKeysFiles));

            if (filterKeys && Object.keys(filterKeys).length > 0){
                this.PublicKeysFilter = filterKeys;
            } 
        } catch (e) {
            throw e;
        }

        return success;
    }

    getFilterGroupByPubkey(publicKey) {
        let thisFilterGroup = this.FilterGroup.default;

        // First group a key is found in is selected.

        Object.keys(this.PublicKeysFilter).every(thisGroup => {
            if (this.FilterGroup[thisGroup]){
                let thisKeyArray = this.PublicKeysFilter[thisGroup];

                if (thisKeyArray.indexOf(publicKey) != -1) {
                    thisFilterGroup = this.FilterGroup[thisGroup];
                    return false;
                }
            } else {
                return true;
            }
        });

        return thisFilterGroup;
    }

    filterPointerByAction(pointer, action){
        let deny;

        try {
            if (pointer && action) {
                let thisPubkey = pointer.pubkey;
                let filterGroup = this.getFilterGroupByPubkey(thisPubkey);

                switch(action.toLowerCase()) {
                    case "publish":{
                        if (filterGroup.settings[CAN_PUBLISH]){
                            deny = POINTER_ACCEPTED;
                            let pubkeyIndexInfo = this.PointerIndexer[thisPubkey];
                            let pubKeyPointerCount = pubkeyIndexInfo ? pubkeyIndexInfo.pointerCount + 1: 1;
                            let pubKeyHashSum = pubkeyIndexInfo ? pubkeyIndexInfo.pointerHashSum + pointer.size : pointer.size;

                            if (filterGroup.settings[MAX_POINTERS] != 0){
                                if (pubKeyPointerCount > filterGroup.settings[MAX_POINTERS]) {
                                    deny = POINTER_COUNT_QUOTA;
                                }
                            }

                            if (filterGroup.settings[MAX_POINTERHASH_SIZE != 0]){
                                if (pubKeyHashSum > filterGroup[MAX_POINTERHASH_SIZE]){
                                    deny = POINTER_SIZE_QUOTA;
                                }
                            }
                        } else {
                            deny = POINTER_PUBLISH_DENY;
                        }
                        break;
                    }
                    case "replace":{
                        if (filterGroup.settings[CAN_REPLACE]){
                            deny = POINTER_ACCEPTED;
                        } else {
                            deny = POINTER_REPLACE_DENY;
                        }
                        break;
                    }
                    case "delete":{
                        if (filterGroup.settings[CAN_DELETE]){
                            deny = POINTER_ACCEPTED;
                        } else {
                            deny = POINTER_DELETE_DENY;
                        }
                        break;
                    }
                }
            }

        } catch (e) {
            console.error(e);
        }

        return deny;
    }
}

module.exports.KeysFilterManager = KeysFilterManager;
module.exports.CAN_DELETE = CAN_DELETE;
module.exports.CAN_PUBLISH = CAN_PUBLISH;
module.exports.CAN_REPLACE = CAN_REPLACE;
module.exports.POINTER_EXPIRATION = POINTER_EXPIRATION;
module.exports.MAX_POINTERHASH_SIZE = MAX_POINTERHASH_SIZE;
module.exports.MAX_POINTERS = MAX_POINTERS;
module.exports.POINTER_PUBLISH_DENY = POINTER_PUBLISH_DENY;
module.exports.POINTER_REPLACE_DENY = POINTER_REPLACE_DENY;
module.exports.POINTER_DELETE_DENY = POINTER_DELETE_DENY;
module.exports.POINTER_COUNT_QUOTA = POINTER_COUNT_QUOTA;
module.exports.POINTER_SIZE_QUOTA = POINTER_SIZE_QUOTA;
module.exports.POINTER_ACCEPTED = POINTER_ACCEPTED;


// const POINTER_EXPIRATION = "pointerexpiration";
// const MAX_POINTERS = "maximumpointers";
// const MAX_POINTERHASH_SIZE = "maximumpointerhashsize";

// const POINTER_PUBLISH_DENY = 0;
// const POINTER_REPLACE_DENY = 1;
// const POINTER_DELETE_DENY = 2;
// const POINTER_COUNT_QUOTA = 3;
// const POINTER_SIZE_QUOTA = 4;
// const POINTER_ACCEPTED = 0xa;