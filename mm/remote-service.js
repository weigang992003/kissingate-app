var ripple = require('../src/js/ripple');
var tfm = require('./the-future-manager.js');

var servers;

var remotes = [{
    host: 's-east.ripple.com',
    port: 443,
    secure: true
}, {
    host: 's-west.ripple.com',
    port: 443,
    secure: true
}, {
    host: 's1.ripple.com',
    port: 443,
    secure: true
}];

var locals = [{
    host: 'localhost',
    port: 6006,
    secure: false
}]

function getRemoteOption() {
    return {
        // trace: true,
        trusted: true,
        local_signing: true,
        local_fee: true,
        fee_cushion: 1.5,
        max_fee: 15000,
        servers: [getServer()]
    };
}

function getServer() {
    return servers[(new Date().getTime()) % servers.length];
}

function getRemote(env, callback) {
    if (env == 0) {
        console.log("server list:", locals);
        servers = locals;
        if (callback) {
            callback(new ripple.Remote(getRemoteOption()));
        }
        return;
    }
    if (env == 1) {
        console.log("server list:", remotes);
        servers = remotes;
        if (callback) {
            callback(new ripple.Remote(getRemoteOption()));
        }
        return;
    }
}

exports.getRemote = getRemote;
exports.getServer = getServer;
exports.getRemoteOption = getRemoteOption;