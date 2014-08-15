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
    remote.requestAccountLines(account, function(err, result) {
        if (err) console.log(err);
        lines = result.lines;
        getNext();
    });
});

function close() {
    remote.disconnect(function() {
        console.log("disconnect");
        process.exit(1);
    })
}

var next = 0;
var lines;

function getNext() {
    if (lines.length > next) {
        var line = lines[next];
        next = next + 1;
        if (line.limit != 0) {
            var amount = '0/' + line.currency + '/' + line.account;
            cancel(amount);
        } else {
            getNext();
            return;
        }
    } else {
        close();
    }
}

function cancel(amount) {
    var tx = remote.transaction();

    tx.rippleLineSet(account, amount);
    tx.setFlags('NoRipple');
    tx.on('success', function(res) {
        console.log('success');
        getNext();
        return;
    });
    tx.on('error', function(res) {
        Logger.log(true, res);
    });

    if (secret) {
        tx.secret(secret);
    } else {
        return;
    }
    tx.submit();
}