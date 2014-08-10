var _ = require('underscore');

var crypto = require('./crypto-util.js');
var ripple = require('../src/js/ripple');
var jsbn = require('../src/js/jsbn/jsbn.js');
var config = require('../marketMarker/config.js');
var mongodbManager = require('./the-future-manager.js');

var Remote = ripple.Remote;

var account;
var secret;
mongodbManager.getAccount(config.mother, function(result) {
    account = result.account;
    crypto.decrypt(result.secret, function(result) {
        secret = result;
    });
});

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
    if (!secret) {
        console.log("secret not ready!");
        return;
    }
    remote.requestAccountOffers(account, function() {
        var offers = arguments[1].offers; //the second parameters are offers info
        _.each(offers, function(offer) {
            remote.transaction().offerCancel(account, offer.seq).secret(secret).on('success', function() {
                console.log('offerCancel');
            }).submit();

        })
    });
});




function close() {
    remote.disconnect(function() {
        console.log("disconnect");
        process.exit(1);
    })
}