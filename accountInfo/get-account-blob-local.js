var LocalBlobBackend = {
    name: "Local browser",

    get: function(key, callback) {
        console.log('local get', 'ripple_blob_' + key);
        var blob = store.get('ripple_blob_' + key);
        // We use a timeout to simulate this function being asynchronous
        callback(null, blob);
    },

    set: function(key, value, callback) {
        if (!store.disabled) {
            store.set('ripple_blob_' + key, value);
        }
        callback();
    }
};


var sjcl = require('../build/sjcl.js');
var https = require('https');

var normalizeUsername = function(username) {
    username = "" + username;
    username = username.trim();
    return username;
};

var normalizePassword = function(password) {
    password = "" + password;
    password = password.trim();
    return password;
};

var getBlob = function(username, password, callback) {
    var self = this;

    username = normalizeUsername(username);
    password = normalizePassword(password);

    var blobObj = new BlobObj();

    blobObj.get(username.toLowerCase(), password, function(err, data) {
        if (err) {
            callback(err);
            return;
        }

        var blob = blobObj.decrypt(username.toLowerCase(), password, data);
        if (!blob) {
            // Unable to decrypt blob
            var msg = 'Unable to decrypt blob (Username / Password is wrong)';
            callback(new Error(msg));
            return;
        } else if (blob.old && !self.allowOldBlob) {
            var oldBlobErr = new Error('Old blob format detected');
            oldBlobErr.name = "OldBlobError";
            callback(oldBlobErr);
            return;
        }

        console.dir(blob.data);
    });
};

var BlobObj = function() {
    this.data = {};
    this.meta = {};
};

BlobObj.prototype.decrypt = function(user, pass, data) {
    function decrypt(priv, ciphertext) {
        var blob = new BlobObj();
        blob.data = JSON.parse(sjcl.decrypt(priv, ciphertext));
        // TODO unescape is deprecated
        blob.meta = JSON.parse(unescape(JSON.parse(ciphertext).adata));
        return blob;
    }

    var key;
    try {
        // Try new-style key
        key = "" + user.length + '|' + user + pass;
        return decrypt(key, atob(data));
    } catch (e1) {
        console.log("Blob decryption failed with new-style key:", e1.toString());
        try {
            // Try old style key
            key = user + pass;
            var blob = decrypt(key, atob(data));
            blob.old = true;
            return blob;
        } catch (e2) {
            console.log("Blob decryption failed with old-style key:", e2.toString());
            return false;
        }
    }
};


BlobObj.prototype.get = function(user, pass, callback) {
    var backend = LocalBlobBackend;
    var key = sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(user + pass));

    try {
        LocalBlobBackend.get(key, function(err, data) {
            if (err) {
                handleError(err, backend);
                return;
            }

            if (data) {
                callback(null, data);
            } else {
                handleError('Wallet not found (Username / Password is wrong)', backend);
            }
        });
    } catch (err) {
        handleError(err, backend);
    }

    function handleError(err, backend) {
        console.log("Backend failed:", backend.name, err.toString());
    }
};

var Options = {
    blobvault: 'https://blobvault.payward.com',
};