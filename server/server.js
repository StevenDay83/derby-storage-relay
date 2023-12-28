const ws = require('ws');
const ErrorManager = require('./error');
const PROTOCOL_MESSAGE = require('./protocol.js');
const Logger = require('../logging/log.js');
const IPFilter = require('./ipfilter.js');

module.exports = class StorageRelayServer {
    constructor(serverSettings, pointerManager){
        this.ServerSettings = serverSettings;
        this.PointerManager = pointerManager;
        this.SessionManager = new SessionManager(serverSettings);
        this.WSServer;
        this.IPFilter = new IPFilter(serverSettings.filter && serverSettings.serverSettings.filteripfile ? 
            serverSettings.serverSettings.filteripfile : "ipfilter.json");
        this.IPFilter.initializeIPFilter();
    }

    startServer(callback){
        try {
            this.WSServer = new ws.Server({
                host:this.ServerSettings.host || '0.0.0.0',
                port:this.ServerSettings.port,
                backlog:20
            });
    
            this.WSServer.on('connection', (socket, req) => {
                let remoteAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
                Logger.WriteInfoLog("New connection from " + remoteAddress);
                let remoteInfo = {
                    address:remoteAddress,
                    port:req.socket.remotePort
                };

                if (this.IPFilter.filterIPAddress(remoteAddress)){
                    // Todo, add socket req infomation
                    this.SessionManager.addNewSession(socket, remoteInfo);
        
                    socket.on('message', newMessage => {
                        this.SessionManager.updateSessionTime(socket);
                        // Handle Message
                        this.handleMessage(socket, newMessage);
                    });
    
                    socket.on('close', (a,b) => {
                        // console.log("Socket closed");
                        let socketSession = this.SessionManager.getSession(socket);
                        let remoteAddress = socketSession && socketSession.remoteInfo ? socketSession.remoteInfo.address : "unknown";
                        Logger.WriteInfoLog("Connection closed for " + remoteAddress);
                        // TODO: Use Session Manager to get Socket info
                        this.SessionManager.removeSession(socket);
                    });
                } else {
                    Logger.WriteErrorLog("Rejected IP Address " + remoteAddress);
                    socket.terminate();
                }

    
            });
            callback(undefined);
        } catch (e) {
            callback(e);
        }
    }

    handleMessage(socket, newMessage){
        let newMessageJSON;
        try {
            newMessageJSON = JSON.parse(newMessage);
            // console.log(JSON.stringify(newMessageJSON));

            if (newMessageJSON.length > 0){
                // Looking for a [VALUE1,VALUE2,...,VALUEN] input for the protocol

                let commandPrefix = newMessageJSON[0].toUpperCase(); // TODO Check for String input

                if (commandPrefix.length > 0){
                    switch (commandPrefix){
                        case PROTOCOL_MESSAGE.Commands.POINTER: {
                            // console.log("POINTER COMMAND RECEIVED");
                            // POINTER command - Can be used to add, update, or delete a pointer
                            // POINTER add ["POINTER", ${POINTER_JSON}, "PUBLISH", "DATA"]

                            // Check for DELETE OR PUBLISH

                            if (newMessageJSON.length >= 3) {
                                let pointerSubCommand = newMessageJSON[2];

                                if (pointerSubCommand.toUpperCase() == PROTOCOL_MESSAGE.Commands.POINTER_PUBLISH){
                                    try {
                                        // Pull in pointer object and send it to pointer manager
                                        let submittedPointer = newMessageJSON[1];
                                        let base64Payload;

                                        if (newMessageJSON.length == 4){
                                            base64Payload = newMessageJSON[3];
                                        }

                                        this.PointerManager.publishNewPointer(submittedPointer,base64Payload,(err, pointerId, pointerhash) => {
                                            try {
                                                if (!err){
                                                    let pointerPublishResponse = [
                                                        "OK",
                                                        pointerId,
                                                        pointerhash
                                                    ];

                                                    // console.log(JSON.stringify(pointerPublishResponse));
                                                    socket.send(JSON.stringify(pointerPublishResponse));
                                                } else {
                                                    throw err;
                                                }
                                            } catch (e) {
                                                // console.error(e);
                                                // let pointerPublishErrorResponse = [
                                                //     "ERROR",
                                                //     999,
                                                //     "Error publishing pointer: TBD"
                                                // ];

                                                // socket.send(JSON.stringify(pointerPublishErrorResponse));

                                                if (!this._sendErrorMessage(socket, e)){
                                                    console.error(e);
                                                } else {
                                                    Logger.WriteErrorLog("Error publishing pointer: " + e.message);
                                                }
                                            }
                                        });

                                    } catch (e) {
                                        // Invalid JSON
                                        throw e;
                                    }
                                } else if (pointerSubCommand.toUpperCase() == PROTOCOL_MESSAGE.Commands.POINTER_DELETE){
                                   try {
                                       // Pull in pointer object and send it to pointer manager for deletion of pointer
                                    let deletionPointer = newMessageJSON[1];

                                    this.PointerManager.deletePointer(deletionPointer, (err, deletedPointerId) => {
                                        if (!err){
                                            let responseJSON = [
                                                "OK",
                                                deletionPointer.id,
                                                deletedPointerId,
                                            ];

                                            socket.send(JSON.stringify(responseJSON));
                                        } else {
                                            // let errorJSON = [
                                            //     "ERROR",
                                            //     999,
                                            //     err.message
                                            // ];

                                            // socket.send(JSON.stringify(errorJSON));

                                            if (!this._sendErrorMessage(socket, err)){
                                                console.error(err);
                                            }
                                        }
                                    });
                                   } catch (e) {
                                        // Invalid JSON
                                        throw e;
                                   }
                                }
                            } else { // Invalid input, not enough parameters
                                // new Error(0);
                                throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_COMMAND,"","Invalid input");

                            }
                            break;
                        } // POINTER CASE
                        case PROTOCOL_MESSAGE.Commands.REQUEST_DATA: {
                            if (newMessageJSON.length == 2){
                                let thisPointerID = newMessageJSON[1];

                                this.PointerManager.getBinaryByPointerId(thisPointerID, (err, pointerHash, base64Data) => {
                                    if (!err){
                                        if (base64Data && base64Data.length > 0){
                                            let responseJSON = [
                                                "DATAOK",
                                                thisPointerID,
                                                pointerHash,
                                                base64Data
                                            ];
                                            
                                            // console.log("Sending Binary Data");
                                            socket.send(JSON.stringify(responseJSON));
                                        }
                                    } else {
                                        // let errorJSON = [
                                        //     "ERROR",
                                        //     999,
                                        //     err.message
                                        // ];

                                        // socket.send(JSON.stringify(errorJSON));

                                        if (!this._sendErrorMessage(socket, err)){
                                            console.error(err);
                                        }
                                    }
                                });
                            }
                            break;
                        } // REQDATA CASE
                        case PROTOCOL_MESSAGE.Commands.REQUEST_POINTER: {
                            if (newMessageJSON.length == 3){
                                try {
                                    let requestId = newMessageJSON[1];
                                    let requestCriteria = newMessageJSON[2];

                                    if (!requestCriteria.limit || requestCriteria.limit >= 1000){
                                        requestCriteria.limit = 1000;
                                    }
                                    this.PointerManager.getPointerByCriteria(requestCriteria, (err, results) => {
                                        if (!err){
                                            let responseJSON = [
                                                PROTOCOL_MESSAGE.Responses.POINTER_RESPONSE,
                                                requestId,
                                                results
                                            ];

                                            socket.send(JSON.stringify(responseJSON));
                                            socket.send(JSON.stringify(["REQEND",requestId]));
                                        } else {
                                            throw err;
                                        }
                                    }, requestId);

                                } catch (e) {
                                    // console.error(e);
                                    // throw new Error(0);
                                    throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_COMMAND,"","Invalid input");

                                }
                            } else {
                                // throw new Error(0);
                                throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_COMMAND,"","Invalid input");

                            }
                            break;
                        } // REQPOINTER CASE
                        default: {
                                let invalidCommandError = ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_COMMAND,
                                    "","Not found");

                                this._sendErrorMessage(socket, invalidCommandError);
                                break;
                        }
                    }
                } else {
                    // throw new Error(0);
                    throw ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_COMMAND,"","Invalid input");
                }
            }
        } catch (e) {
            // console.error(e);
            // let errorTest = ["ERROR", 0, "Invalid Input"];
            // socket.send(JSON.stringify(errorTest));
            if (!this._sendErrorMessage(socket, e)){
                let malformJSONError = ErrorManager.getProtocolError(ErrorManager.ERROR_CODES.INVALID_INPUT, "","");
                this._sendErrorMessage(socket, malformJSONError);
                // console.error(e);
            }
        }
    }

    _sendErrorMessage(socket, protocolError){
        let isProtocolError = false;

        try {
            if (protocolError.name == 'protocol'){
                let jsonError = JSON.parse(protocolError.message);

                let errorMessage = [
                    "ERROR",
                    jsonError.code,
                    jsonError.contextId,
                    jsonError.message
                ];

                socket.send(JSON.stringify(errorMessage));

                isProtocolError = true;
            }
        } catch (e) {

        }

        return isProtocolError;
    }
}

class SessionManager {
    constructor(serverSettings) {
        this.ServerSettings = serverSettings;
        this.CurrentSessions = {};

        setInterval(() => this.removeIdleSessions(), 10000);
    }

    addNewSession(socket, remoteInfo = {address: undefined, port: undefined}) {
        this.CurrentSessions[socket] = {
            socket:socket,
            timeout:Math.floor(Date.now() / 1000),
            remoteInfo: {
                address: remoteInfo.address,
                port: remoteInfo.port
            }
        };
    }

    removeSession(socket){
        if (socket && this.CurrentSessions[socket]){
            let thisSocket = this.CurrentSessions[socket].socket;
            // thisSocket.terminate();
            thisSocket.terminate();
            delete this.CurrentSessions[socket];
        }
    }

    updateSessionTime(socket){
        if (socket && this.CurrentSessions[socket]){
            this.CurrentSessions[socket].timeout = Math.floor(Date.now() / 1000);
        }
    }

    getSession(socket){
        if (socket && this.CurrentSessions[socket]){
            return this.CurrentSessions[socket];
        }
    }

    removeIdleSessions(){
        // console.log("In removeIdleSessions()");
        if (Object.keys(this.CurrentSessions)){
            Object.keys(this.CurrentSessions).forEach(thisSocket => {
                let lastUpdatedTime = this.CurrentSessions[thisSocket].timeout;
                // let idleTime = Math.floor((Date.now() - lastUpdatedTime)) * 1000;
                let idleTime = Math.floor((Date.now() / 1000) - lastUpdatedTime);
                if (idleTime > this.ServerSettings.sessionTimeout){
                    let remoteAddr = this.CurrentSessions[thisSocket].remoteInfo.address;
                    let remotePort = this.CurrentSessions[thisSocket].remoteInfo.port;
                    Logger.WriteInfoLog("Disconnecting idle session from " + remoteAddr + ':' + remotePort);
                    this.removeSession(thisSocket);
                }
            });
        }
    }

    test(){
        console.log("Hihi");
    }
}