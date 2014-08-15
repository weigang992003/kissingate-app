var jsbn = require('../src/js/jsbn/jsbn.js');
var ripple = require('../src/js/ripple');
var config = require('../marketMaker/config.js');

var _ = require('underscore');

var Remote = ripple.Remote;
var account = "account";
var secret = "secret";

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