let Logger = {
    WriteInfoLog: (message) => {
        if (message && message.length > 0){
            let timeStamp = new Date();
            let timeStampString = timeStamp.toLocaleString();
    
            let logString = "INFO: " + timeStampString + ' - ' + message.toString();
    
            console.info(logString);
        }
    },
    WriteErrorLog: (message) => {
        if (message && message.length > 0){
            let timeStamp = new Date();
            let timeStampString = timeStamp.toLocaleString();
    
            let logString = "ERROR: " + timeStampString + ' - ' + message.toString();
    
            console.info(logString);
        }
    }
}

module.exports = Logger;