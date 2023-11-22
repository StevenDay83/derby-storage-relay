# derby-storage-relay
Derby storage network server node

Derby storage node is a server that allows storage and retrieval of data using crytographically signed pointers.

Usage

`node index.js`

## Set up

There is no formalized set up yet.

This will be a quick guide to get a basic storage node set up for testing purposes.

**Do not use this for any meaningful data in production. Things WILL break**

### Settings

The storage node reads from a settings.json file in the current directory. 

You can copy the settings.template.json file and edit it.

Here's what it looks like:

```
{
   "server":{
        "host":"0.0.0.0",
        "port":8080,
        "sessionTimeout":30000
   },
   "storage":{
        "directory":"./BlobData",
        "fileSuffix": "blob",
        "dataBlockLimit": 512000
   },
   "pointer":{
        "timestampDelta":300
   },
   "database":{
    "host":"localhost",
    "port":3306,
    "username":"username",
    "password":"password",
    "pointerDatabase":"pointer_db"
   },
   "filter":{
     "filtergroupfile":"./filter.json",
     "filterkeysfile":"./filter_keys.json"
   }
}
```

**server**
* host - Host to listen to the server on
* port - TCP/IP port to listen on
* sessionTimeout - Idle timeout for connections

**storage**
* directory - Directory to save data blobs
* fileSuffix - file suffix to add to blobs. For labeling purposes mostly.
* dataBlockLimit - Maximum size of data blocks uploaded. In bytes.

**pointer**
* timestampDelta - Maximum amount of time off from the system time a pointer can be published, in seconds. 300 means that a pointer cannot be published more than 5 minutes in the future of past. 0 means any time can be used and is not recommended outside of personal testing.

**database**
The storage node uses Maria DB for its backend. Currently it uses TCP/IP and has no option for sockets.

* host - Maria DB host to connect to. Some systems require 127.0.0.1 if running on your own system. Others are ok with localhost.
* port - Maria DB TCP/IP port to connct to.
* username - Maria DB username to use for authentication to the database.
* password - Maria DB password to use for authentication to the database.
* pointerDatabase - Database to use that will have the `Pointer` table

**filter**
* filtergroupfile - File that has filter group definitions and attributes.
* filterkeysfile - File that holds public keys in specific groups.

### Filter Group File

A filter group file is necessary for preventing anyone with a key from uploading unlimited amounts of data. The storage node reads from this file every 30 seconds to get any definition updates.

A filter group file looks like this:

```
{
    "root_level":{
        "settings":{
            "canpublish":true,
            "canreplace":true,
            "candelete":true,
            "pointerexpiration":0,
            "maximumpointers":0,
            "maximumpointerhashsize":0
        },
        "label":"Root Level"
    },
    "block":{
        "settings":{
            "canpublish":false,
            "canreplace":false,
            "candelete":false
        },
        "label":"Blocked keys"
    },
    "registered":{
        "settings":{
            "canpublish":true,
            "canreplace":true,
            "candelete":true,
            "pointerexpiration":7884000,
            "maximumpointers":1000,
            "maximumpointerhashsize":1000000000
        },
        "label":"registered"
    },
    "restricted":{
        "settings":{
            "canpublish":true,
            "canreplace":false,
            "candelete":true,
            "pointerexpiration":7884000,
            "maximumpointers":0,
            "maximumpointerhashsize":0
        },
        "label":"restricted test"
    },
    "default":{
        "settings":{
            "canpublish":true,
            "canreplace":true,
            "candelete":true,
            "pointerexpiration":7884000,
            "maximumpointers":1000,
            "maximumpointerhashsize":50000000
        },
        "label":"default"
    }
}
```
The name is at the top level. There is a hardcoded default is nothing is present.

**Settings**
* canpublish - Establishes is a public key is allowed to publish a pointer. At a high level this allows or denies a storage node user from uploading new files.
* canreplace - Allow or deny a public key to update a pointer. This would allow a user to update a pointer to prevent their upload from expiring for example.
* candelete - Allow or deny a public key from deleting a pointer. This would determine if a user can remove their association with data at a high level.
* pointerexpiration - *Not enforced in code yet.* Sets an maximum time that a user can have their data or association with data on a server. In seconds.
* maximumpointers - Maximum amount of pointers (data blocks per pubkey) a user can have on the server
* maximumpointerhashsize - Maximum amount of storage a user can keep or associate itself with on the server. In bytes.

Label - Descriptive label for the group

### Filter group keys file

The Filter group keys file is where the list of public keys are maintained.

The file looks like this:

```
{
    "root_level":[
        "159755b018f19c55c01b1736fc05caaec21447a668aeba3a1de0f329aec58a12"
    ],
    "registered":[
        
    ],
    "block":[

    ],
    "restricted":[
        "3656bee87d4edcc676f94d4959d0af5351410348d0af3a6fd777d9ccabfcc689",
        "e11a3451876e95edb5d9446a6b19010f5a4251338eb610a73996414fe7e56cbc"
    ]
}
```

The top level references the filter group and the inside is an array of public keys. This file is also checked every 30 seconds for updates.

Any public key not applied to a group will go to the default group.

### Database setup

The Derby storage node users Maria DB as an SQL database backend.

A basic server setup with a username and password is required. A database needs to be created and added to the settings.json file.

The storage node will look for a `Pointers` table in the database and will create one if it doesn't exist. If you want to create one yourself, the SQL is below:

```
CREATE TABLE if not exists `Pointers`  (
  `id` varchar(64) DEFAULT NULL COMMENT 'Pointer ID',
  `pubkey` varchar(64) DEFAULT NULL COMMENT 'Pointer Public Key',
  `timestamp` int(10) unsigned DEFAULT NULL COMMENT 'Unix Time in Seconds',
  `pointerhash` varchar(64) DEFAULT NULL COMMENT 'Hash to Pointed Data',
  `size` int(10) unsigned DEFAULT NULL COMMENT 'Size of pointed data',
  `nonce` int(10) unsigned DEFAULT NULL COMMENT 'Nonce data',
  `signature` varchar(128) DEFAULT NULL COMMENT 'Schnorr signature'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

The table name is hardcoded currently.

## Running Derby Storage Node

### Last minute prerequsites

Before running this node on the open Internet is is recommended you do the following:
* Check storage directory
* Generate a public\private key pair for yourself to add to root_level
* Ensure default filter group is locked down
* Ensure timestampDelta is set to something other than 0. 300 is recommended
* dataBlockLimit is set to at least 512000. Anything smaller creates too many small files for basic media. 1000000 is also a good value

Running the storage node will generate the following output:

```
INFO: 11/22/2023, 1:15:05 PM - Loading log file from ./settings.json
INFO: 11/22/2023, 1:15:05 PM - Settings loaded
INFO: 11/22/2023, 1:15:05 PM - Initializing connection to database at localhost:3306
INFO: 11/22/2023, 1:15:05 PM - Connection to database pointer_db: OK
INFO: 11/22/2023, 1:15:05 PM - Database table for pointers present
INFO: 11/22/2023, 1:15:05 PM - Starting Server at host 0.0.0.0:8080
INFO: 11/22/2023, 1:15:05 PM - Server started, listening for connections
INFO: 11/22/2023, 1:15:13 PM - New connection from ::1
```

## In early development

This is in very early development. Things WILL break.

From any issues please submit on github or reach out to me on Nostr [npub1pwtrrydty95q5ces0tkm2r7hkqfe9jwxhmmee5xwke6g4lz70l7sd8pf5t](https://snort.social/nprofile1qqsqh933jx4jz6q2vvc84md4pltmqyuje8rtaauu6r8tvay2l308llgpzemhxue69uhk2er9dchxummnw3ezumrpdejz7qgewaehxw309amk2mrrdakk2tnwdaehgu3wwa5kuef0qyg8wumn8ghj7mn0wd68ytnddakj7wmd2x9)
