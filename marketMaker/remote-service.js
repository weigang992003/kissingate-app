var ripple = require('../src/js/ripple');

var servers = [{
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

function getRemoteOption() {
    return {
        // trace: true,
        trusted: true,
        local_signing: true,
        local_fee: true,
        fee_cushion: 1.5,
        max_fee: 1000,
        servers: [getServer()]
    };
}

function getServer() {
    return servers[(new Date().getTime()) % servers.length];
}

function getRemote() {
    return new ripple.Remote(getRemoteOption());
}

exports.getServer = getServer;
exports.getRemoteOption = getRemoteOption;
exports.getRemote = getRemote;