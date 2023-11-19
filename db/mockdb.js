const { json } = require('express/lib/response');
const fs = require('fs');

module.exports = class database {
    constructor(dbfile) {
        this.dbfile = dbfile;
        this.dbRecords = {};
    }

    loadDatabaseRecords(){
        let rawData;

        try {
            if (this.dbfile){
                rawData = fs.readFileSync(this.dbfile);

                this.dbRecords = JSON.parse(rawData);
                // console.log(this.dbRecords);
            } else {
                throw new Error("Invalid Database File");
            }
        } catch (e) {
            throw e;
        }
    }

    getRecordById(id){
        let record = this.dbRecords[id];

        if (!record){
            record = {};
        }

        return record;
    }

    addUpdateRecord(id, jsonObject){
        try {
            if (id && jsonObject){
                this.dbRecords[id] = jsonObject;
            } else {
                throw new Error ("Error adding record");
            }
        } catch (e) {
            throw e;
        }

        return id;
    }

    deleteRecordById(id){
        try {
            if (id){
                let thisRecord = this.getRecordById(id);

                if (thisRecord){
                    delete this.dbRecords[id];
                }
            } else {
                throw new Error("Invalid Id of " + id);
            }
        } catch (e) {
            throw e;
        }

        return id;
    }

    commitChanges(callback){
        try {
            fs.writeFile(this.dbfile, JSON.stringify(this.dbRecords), err => {
                callback(err);
            });
        } catch (e) {
            throw e;
        }
    }

    getRecordBy() {}
}