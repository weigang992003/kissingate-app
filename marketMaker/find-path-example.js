var http = require('http');
var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var config = require('./config.js');
var crypto = require('./crypto-util.js');
var ripple = require('../src/js/ripple');
var PathFind = require('../src/js/ripple/pathfind.js').PathFind;
var jsbn = require('../src/js/jsbn/jsbn.js');
var mongodbManager = require('./mongodb-manager.js');
var Logger = require('./the-future-logger.js').TFLogger;
Logger.getNewLog('find-path-example');



var emitter = new events.EventEmitter();

var remote_options = remote_options = {
    // see the API Reference for available options
    // trace: true,
    trusted: true,
    local_signing: true,
    local_fee: true,
    fee_cushion: 1.5,
    max_fee: 100,
    servers: [{
        host: 's-west.ripple.com',
        port: 443,
        secure: true
    }]
};

var remote = new ripple.Remote(remote_options);
var Amount = ripple.Amount;


var account;
var secret;
mongodbManager.getAccount(config.mother, function(result) {
    account = result.account;
    crypto.decrypt(result.secret, function(result) {
        secret = result;
    });
})


function paymentInRipple(alt) {
    var tx = remote.transaction();

    tx.paths(alt.paths);
    tx.payment(account, account, alt.dest_amount);
    tx.send_max(alt.source_amount.product_human(1.01));

    Logger.log(true, "tx", alt.dest_amount.to_human_full() + "/" + alt.source_amount.to_human_full());

    if (secret) {
        tx.secret(secret);
    } else {
        return;
    }

    tx.on('proposed', function(res) {
        console.log("tx success!");
    });

    tx.on('error', function(res) {
        Logger.log(true, res);
    });

    tx.submit();
}

remote.connect(function() {
    var dest_amount = Amount.from_json("1000000");

    var pathFind = remote.pathFind(account, account, dest_amount, [{
        currency: 'CNY',
        issuer: account
    }]);

    trade = false;

    pathFind.on("update", function(message) {

        var alternatives = _.each(message.alternatives, function(raw) {
            var alt = {};
            alt.dest_amount = dest_amount;
            alt.source_amount = Amount.from_json(raw.source_amount);
            alt.paths = raw.paths_computed ? raw.paths_computed : raw.paths_canonical;

            if (!trade) {
                trade = true;
                paymentInRipple(alt);
            }
        });
    })

    pathFind.create();

    // var dest_amount_1 = {
    //     "currency": "ILS",
    //     "issuer": account,
    //     "value": "1"
    // };

    // remote.requestRipplePathFind(account, account, "1/ILS/" + account, [{
    //     "currency": "JPY",
    //     "issuer": account
    // }], function(res) {
    //     console.log(res.alternatives);
    //     var raw = res.alternatives[0];
    //     if (raw) {
    //         var rate = Amount.from_json(raw.source_amount).ratio_human(Amount.from_json(dest_amount_1)).to_human().replace(',', '');

    //         console.log(rate);
    //     }
    // });
    // pathFind1.on('update', function(res) {

    // });
    // pathFind1.create();
});



function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}