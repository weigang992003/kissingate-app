var http = require('http');
var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var config = require('./config.js');
var crypto = require('./crypto-util.js');
var ripple = require('../src/js/ripple');
var PathFind = require('../src/js/ripple/pathfind.js').PathFind;
var jsbn = require('../src/js/jsbn/jsbn.js');


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

var account = config.account;
var encryptedSecret = config.secret;
var secret;

function decrypt() {
    crypto.decrypt(encryptedSecret, function(result) {
        secret = result;
    });
}

decrypt();



remote.connect(function() {
    var xrp = {
        "currency": "XRP",
        "issuer": "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
        "value": "1000000"
    };
    var dest_amount = Amount.from_json("1000000");

    var pathFind = remote.pathFind(account, account, dest_amount, [{
        currency: 'CNY',
        issuer: account
    }]);

    trade = false;

    pathFind.on("update", function(message) {

        var alternatives = _.each(message.alternatives, function(raw) {
            var alt = {};
            alt.amount = Amount.from_json(raw.source_amount);
            alt.rate = alt.amount.ratio_human(dest_amount).to_human();
            alt.send_max = alt.amount.product_human(Amount.from_json('1.01'));
            alt.paths = raw.paths_computed ? raw.paths_computed : raw.paths_canonical;

            var tx = remote.transaction();

            tx.payment(account, account, dest_amount);
            tx.send_max(alt.send_max);
            tx.paths(alt.paths);
            // tx.setFlags([0x00020000]);

            if (secret) {
                tx.secret(secret);
            } else {
                return;
            }

            tx.on('proposed', function(res) {
                console.dir(res);
            });
            tx.on('success', function(res) {
                console.dir(res);
            });
            tx.on('error', function(res) {
                console.dir(res);
            });
            console.log("submit");
            if (!trade) {
                trade = true;
                tx.submit();
            }
        });
    })

    pathFind.create();
});



function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}