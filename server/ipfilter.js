const BlockList = require('net').BlockList;
const fs = require('fs');

class IPFilter {
    constructor(ipFilterFile) {
        this.IPFilterFile = ipFilterFile;
        this.IPBlockList = new BlockList();
        this.IPSafeList = new BlockList();
    }

    initializeIPFilter(){
        this._loadIPFilterLists();
        setInterval(() => this._loadIPFilterLists, 30000);
    }

    filterIPAddress(ipAddress) {
        // true means it's OK
        // false means reject

        if (ipAddress == '::1'){
            ipAddress = "127.0.0.1";
        } else if (ipAddress.startsWith("::ffff:")){
            ipAddress = ipAddress.split(":")[3];
        }

        let ipOnBlockList = this.IPBlockList.check(ipAddress);
        let ipOnSafeList = this.IPSafeList.check(ipAddress);

        let acceptIP = !ipOnBlockList && ipOnSafeList;

        return acceptIP;
    }

    _loadIPFilterLists(){
        try {
            let filterListJSON = JSON.parse(fs.readFileSync(this.IPFilterFile));

            if (filterListJSON){
                if (filterListJSON.block && filterListJSON.block.length > 0){
                    let blockListArray = filterListJSON.block;

                    let newBlockList = new BlockList();

                    blockListArray.forEach(blockListItem => {
                        let [ipAddress, cidr] = blockListItem.split("/");

                        if (ipAddress){
                            if (cidr){
                                newBlockList.addSubnet(ipAddress, Number.parseInt(cidr), "ipv4");
                            } else {
                                newBlockList.addAddress(ipAddress, "ipv4");
                            }
                        }
                    });

                    this.IPBlockList = newBlockList;
                }

                if (filterListJSON.safe && filterListJSON.safe.length > 0){
                    let safeListArray = filterListJSON.safe;

                    let newSafeList = new BlockList();

                    safeListArray.forEach(safeListItem => {
                        let [ipAddress, cidr] = safeListItem.split("/");

                        if (ipAddress){
                            if (cidr){
                                newSafeList.addSubnet(ipAddress, Number.parseInt(cidr), "ipv4");
                            } else {
                                newSafeList.addAddress(ipAddress, "ipv4");
                            }
                        }
                    });

                    this.IPSafeList = newSafeList;
                }
            }  
        } catch (e) {

        }
    }
}

module.exports = IPFilter;