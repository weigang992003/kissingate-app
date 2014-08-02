var Logger = require('./the-future-logger.js').TFLogger;
Logger.getNewLog('find-path-payment');

var socketIO = require('socket.io-client');
var fpio = new socketIO('http://localhost:3000/fp');

var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var crypto = require('./crypto-util.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
var mongodbManager = require('./mongodb-manager.js');
var PathFind = require('../src/js/ripple/pathfind.js').PathFind;


var emitter = new events.EventEmitter();
emitter.on('addPaymentBack', reAddPaymentListener);

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
var serverIndex = 0;

var remote = new ripple.Remote(getRemoteOption());
var Amount = ripple.Amount;

var account;
var secret;
console.log("step1:getAccount!")
mongodbManager.getAccount(config.marketMaker, function(result) {
    account = result.account;
    secret = result.secret;
    emitter.emit('decrypt', secret);
});

emitter.once('decrypt', decrypt);

function decrypt(encrypted) {
    console.log("step2:decrypt secret!")
    crypto.decrypt(encrypted, function(result) {
        secret = result;
        remoteConnect();
    });
}

function checkIfRateUpdated(type, alt1, alt2, factor, send_max_rate) {
    var src_1_currencies = [];
    if (typeof alt1.source_amount == "string") {
        src_1_currencies.push({
            currency: 'XRP',
            issuer: 'rrrrrrrrrrrrrrrrrrrrrhoLvTp'
        })
    } else {
        src_1_currencies.push(alt1.source_amount);
    }

    var src_2_currencies = [];
    if (typeof alt2.source_amount == "string") {
        src_2_currencies.push({
            currency: 'XRP',
            issuer: 'rrrrrrrrrrrrrrrrrrrrrhoLvTp'
        })
    } else {
        src_2_currencies.push(alt2.source_amount);
    }

    var lastestPath1 = false;
    var lastestPath2 = false;

    var pathFind1 = new PathFind(remote, account, account, Amount.from_json(alt1.dest_amount), src_1_currencies);
    pathFind1.on('update', function(res) {
        var raw = res.alternatives[0];
        if (raw) {
            var rate = Amount.from_json(raw.source_amount).ratio_human(Amount.from_json(alt1.dest_amount)).to_human().replace(',', '');
            var currentRate = parseFloat(rate);
            var rate1 = parseFloat(alt1.rate);
            if (currentRate <= rate1) {
                lastestPath1 = true;
                emitter.once('goPay', goPay);
                emitter.emit('goPay', type, alt1, alt2, factor, send_max_rate, lastestPath1, lastestPath2)
            }
            console.log("currentRate:" + rate + "rate1:" + alt1.rate);
        }
    });

    var pathFind2 = new PathFind(remote, account, account, Amount.from_json(alt2.dest_amount), src_2_currencies);
    pathFind1.on('update', function(res) {
        var raw = res.alternatives[0];
        if (raw) {
            var rate = Amount.from_json(raw.source_amount).ratio_human(Amount.from_json(alt2.dest_amount)).to_human().replace(',', '');
            var currentRate = parseFloat(rate);
            var rate2 = parseFloat(alt2.rate);
            if (currentRate <= rate2) {
                lastestPath2 = true;
                emitter.once('goPay', goPay);
                emitter.emit('goPay', type, alt1, alt2, factor, send_max_rate, lastestPath1, lastestPath2)
            }
            console.log("currentRate:" + rate + "rate2:" + alt2.rate);
        }
    });

    pathFind1.create();
    pathFind2.create();
}

function goPay(type, alt1, alt2, factor, send_max_rate, lastestPath1, lastestPath2) {
    if (lastestPath1 && lastestPath2) {
        payment(type, alt1, al2, factor, send_max_rate);
    }
}


function payment(type, alt1, alt2, factor, send_max_rate) {
    console.log("we will make payment here!!! yeah!!!");

    alt1.dest_amount = Amount.from_json(alt1.dest_amount);
    alt1.source_amount = Amount.from_json(alt1.source_amount);

    alt2.dest_amount = Amount.from_json(alt2.dest_amount);
    alt2.source_amount = Amount.from_json(alt2.source_amount);

    var tx1 = remote.transaction();
    var tx1_dest_amount = alt1.dest_amount.product_human(factor);
    var tx1_source_amount = alt1.source_amount.product_human(factor);

    tx1.paths(alt1.paths);
    tx1.payment(account, account, tx1_dest_amount);
    tx1.send_max(tx1_source_amount.product_human(send_max_rate));

    var times;
    var tx2_dest_amount;
    var tx2_source_amount;
    if (tx1_source_amount.is_native()) {
        times = alt1.dest_amount.ratio_human(alt2.source_amount).to_human().replace(',', '');
        tx2_dest_amount = alt2.dest_amount.product_human(math.round((times * factor), 6));
        tx2_source_amount = tx1_dest_amount;
    } else {
        times = alt1.source_amount.ratio_human(alt2.dest_amount).to_human().replace(',', '');
        tx2_dest_amount = tx1_source_amount;
        tx2_source_amount = alt2.source_amount.product_human(math.round((times * factor), 6));
    }

    var tx2 = remote.transaction();
    tx2.paths(alt2.paths);
    tx2.payment(account, account, tx2_dest_amount);
    tx2.send_max(tx2_source_amount.product_human(send_max_rate));

    Logger.log(true, "make a payment(" + type + ")!",
        "tx1", tx1_dest_amount.to_human_full() + "/" + tx1_source_amount.to_human_full(),
        "tx2", tx2_dest_amount.to_human_full() + "/" + tx2_source_amount.to_human_full());

    if (secret) {
        tx1.secret(secret);
        tx2.secret(secret);
    } else {
        return;
    }

    var tx1Complete = false;
    var tx2Complete = false;

    tx1.on('proposed', function(res) {
        tx1Complete = true;
        emitter.emit('addPaymentBack', tx1Complete, tx2Complete, type);
        Logger.log(true, "(" + type + ")" + " tx1 is success!");
    });

    tx1.on('error', function(res) {
        handlePartialPathError(tx1_dest_amount, tx1_source_amount, send_max_rate, alt1.rate);
        tx1Complete = true;
        emitter.emit('addPaymentBack', tx1Complete, tx2Complete, type);
        if (res.engine_result != "tecPATH_PARTIAL") {
            Logger.log(true, res);
        }
    });

    tx2.on('proposed', function(res) {
        tx2Complete = true;
        emitter.emit('addPaymentBack', tx1Complete, tx2Complete, type);
        Logger.log(true, "(" + type + ")" + " tx2 is success!");
    });

    tx2.on('error', function(res) {
        handlePartialPathError(tx2_dest_amount, tx2_source_amount, send_max_rate, alt2.rate);
        tx2Complete = true;
        emitter.emit('addPaymentBack', tx1Complete, tx2Complete, type);
        if (res.engine_result != "tecPATH_PARTIAL") {
            Logger.log(true, res);
        }
    });

    tx1.submit();
    tx2.submit();
}

function handlePartialPathError(dest_amount, source_amount, send_max_rate, rate) {
    mongodbManager.saveFailedTransaction({
        "dest_amount": dest_amount.to_text_full(),
        "source_amount": source_amount.to_text_full(),
        "send_max_rate": send_max_rate,
        "rate": rate
    });
}

function reAddPaymentListener(tx1Complete, tx2Complete, type) {
    if (tx1Complete && tx2Complete) {
        var currencyPair = type.split(":");
        currencies = _.union(currencies, currencyPair);
    }
}

function getRemoteOption() {
    return {
        trusted: true,
        local_signing: true,
        local_fee: true,
        fee_cushion: 1.5,
        max_fee: 100,
        servers: [getServer()]
    };
}

function getServer() {
    return servers[(serverIndex++) % servers.length];
}

var currencies = [];

function prepareCurrencies(lines) {
    currencies = _.pluck(lines, 'currency');
    currencies = _.uniq(currencies);
    currencies.push("XRP");
    return currencies;
}

var connected = false;

function remoteConnect() {
    console.log("step3:connect to remote!")

    remote.connect(function() {
        connected = true;
        remote.requestAccountLines(account, function(err, result) {
            if (err) console.log(err);
            console.log("step4:prepare currencies!");
            prepareCurrencies(result.lines);
        });
    });
}

console.log("step5:listen to profit socket!");
fpio.on('connect', function() {
    fpio.on('fp', function(type, alt1, alt2, factor, send_max_rate) {
        if (connected) {
            emitter.once('payment', checkIfRateUpdated);
            emitter.emit('payment', type, alt1, alt2, factor, send_max_rate);
        }

        var currencyPair = type.split(":");
        if (_.contains(currencies, currencyPair[0]) && _.contains(currencies, currencyPair[1])) {
            currencies = _.without(currencies, currencyPair[0], currencyPair[1]);

        }
    })
});

remote.on('disconnect', function() {
    console.log("the remote was disconnect! we will reconnect it!");
    remote = new ripple.Remote(getRemoteOption());
    remoteConnect();
});