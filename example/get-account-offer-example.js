var _ = require('underscore');

var ripple = require('../src/js/ripple');
var config = require('../future/config.js');
var jsbn = require('../src/js/jsbn/jsbn.js');


var Remote = ripple.Remote;
var account = config.account;
var secret = config.secret;

var remote = new Remote({
    // see the API Reference for available options
    // trace: true,
    trusted: true,
    local_signing: true,
    local_fee: true,
    fee_cushion: 1.5,
    max_fee: 100,
    servers: [{
        host: 's1.ripple.com',
        port: 443,
        secure: true
    }]
});

remote.connect(function() {
    remote.requestAccountOffers(account, function() {
        console.log(false, "right now the offers this account have:", arguments[1].offers);
    });
});




function close() {
    remote.disconnect(function() {
        console.log("disconnect");
        process.exit(1);
    })
}