var crypto = require('crypto');
var tfmjs = require('./the-future-manager.js');
var tfm = new tfmjs.TheFutureManager();

function crypt(text, callback) {
    tfm.getCryptoOption(function(result) {
        var hasher = crypto.createHash(result.hash);
        hasher.update(result.key);
        var hash = hasher.digest(result.outputEncoding);

        var cipher = crypto.createCipher(result.algorithm, hash);
        var crypted = cipher.update(text, result.inputEncoding, result.outputEncoding);
        crypted += cipher.final(result.outputEncoding);
        callback(crypted);
    });
}

function decrypt(text, callback) {
    tfm.getCryptoOption(function(result) {
        var hasher = crypto.createHash(result.hash);
        hasher.update(result.key);
        var hash = hasher.digest(result.outputEncoding);

        var decipher = crypto.createDecipher(result.algorithm, hash)
        var decrypted = decipher.update(text, result.outputEncoding, result.inputEncoding);
        decrypted += decipher.final(result.inputEncoding);
        callback(decrypted);
    });
}

exports.crypt = crypt;
exports.decrypt = decrypt;