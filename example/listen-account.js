var _ = require('underscore');

require('../marketMaker/date-extend.js');
var ripple = require('../src/js/ripple');
var config = require('../marketMaker/config.js');
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
    console.log('remote connected!!!');
    remote.on('transaction_all', transactionListener);

    function transactionListener(transaction_data) {
        console.log(transaction_data.transaction);
        console.dir(transaction_data.meta.AffectedNodes);
    }
});




function close() {
    remote.disconnect(function() {
        console.log("disconnect");
        process.exit(1);
    })
}