var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var crypto = require('./crypto-util.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
var mongodbManager = require('./mongodb-manager.js');
var Logger = require('./the-future-logger.js').TFLogger;
Logger.getNewLog("keep-currency-balance-solution");

var emitter = new events.EventEmitter();
emitter.once('decrypt', decrypt);
emitter.once('remoteConnect', remoteConnect);
emitter.on('goNext', goNext);
emitter.on('createOffer', createOffer);

var remote_options = remote_options = {
    // see the API Reference for available options
    // trace: true,
    trusted: true,
    local_signing: true,
    local_fee: true,
    fee_cushion: 1.5,
    max_fee: 100,
    servers: [{
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
    }]
};

var remote = new ripple.Remote(remote_options);

var account;
var secret;
mongodbManager.getAccount(config.mother, function(result) {
    account = result.account;
    secret = result.secret;
    emitter.emit('decrypt', secret);
});

var offers;
var orders = [];

function decrypt(encrypted) {
    crypto.decrypt(encrypted, function(result) {
        secret = result;
        emitter.emit('remoteConnect');
    });
}

function remoteConnect() {
    remote.connect(function() {
        remote.requestAccountLines(account, function(err, result) {
            if (err) console.log(err);
            averageBalance(result.lines);
        });
        remote.requestAccountOffers(account, function() {
            offers = arguments[1].offers;
        });
    });
}

function averageBalance(lines) {
    lines = _.filter(lines, function(line) {
        return line.limit != 0;
    });

    lines = _.groupBy(lines, function(line) {
        return line.currency;
    })

    var newLines = {};
    var currencies = _.keys(lines);
    _.each(currencies, function(currency) {
        if (lines[currency].length > 1) {
            lines[currency] = _.sortBy(lines[currency], function(line) {
                return line.limit;
            });

            var limit = _.last(lines[currency]).limit;

            lines[currency] = _.filter(lines[currency], function(line) {
                return line.limit == limit;
            });

            if (lines[currency].length > 1) {
                newLines[currency] = lines[currency];
            }
        }
    });

    var balanceMap = {};
    currencies = _.keys(newLines);
    _.each(currencies, function(currency) {
        var list = newLines[currency];

        var total = 0;
        _.each(list, function(e) {
            total = total + math.round(parseFloat(e.balance), 6);
        });
        console.log(currency + ":" + total);
        balanceMap[currency] = total;
        var average = math.round((total / list.length), 6);

        var payList = [];
        var getList = [];

        _.each(list, function(e) {
            if (e.balance < average) {
                getList.push(e);
            } else {
                payList.push(e);
            }
        });

        _.each(payList, function(pay) {
            _.each(getList, function(get) {
                var paymost = pay.balance - average;
                var getmost = average - get.balance;
                if (paymost > getmost) {
                    var taker_gets = {
                        'currency': currency,
                        'issuer': pay.account,
                        'value': math.round(getmost * 0.999, 6) + ''
                    };
                    var taker_pays = {
                        'currency': currency,
                        'issuer': get.account,
                        'value': getmost + ''
                    };
                    if (ifOfferExist(offers, taker_pays, taker_gets)) {
                        return;
                    }

                    get.balance = average;
                    pay.balance = pay.balance - math.round(getmost * 0.999, 6);

                    orders.push({
                        "taker_pays": taker_pays,
                        "taker_gets": taker_gets
                    })
                } else {
                    var taker_gets = {
                        'currency': currency,
                        'issuer': pay.account,
                        'value': paymost + ''
                    };
                    var taker_pays = {
                        'currency': currency,
                        'issuer': get.account,
                        'value': math.round(paymost * 1.001, 6) + ''
                    };

                    if (ifOfferExist(offers, taker_pays, taker_gets)) {
                        return;
                    }

                    get.balance = (get.balance + math.round(paymost * 1.001, 6));
                    pay.balance = average;

                    orders.push({
                        "taker_pays": taker_pays,
                        "taker_gets": taker_gets
                    })
                }
            })
        });

        emitter.emit('goNext');

    })
}

var next = 0;

function goNext() {
    console.log(orders);
    if (orders.length > next) {
        emitter.emit('createOffer', orders[next].taker_pays, orders[next].taker_gets);
    }
}


function createOffer(taker_pays, taker_gets) {
    var tx = remote.transaction();
    if (secret) {
        tx.secret(secret);
    } else {
        return;
    }

    Logger.log(true, "we are create offer here", "taker_pays", taker_pays, "taker_gets", taker_gets);

    tx.offerCreate(account, taker_pays, taker_gets);
    tx.on("success", function(res) {
        next++;
        emitter.emit('goNext');
    })
    tx.on("error", function(res) {
        console.log(res);
    })

    tx.emit('success');
    // tx.submit();
}

function ifOfferExist(offers, pays, gets) {
    var self = this;

    var result = _.filter(offers, function(offer) {
        return offer.taker_pays.currency == pays.currency && offer.taker_pays.issuer == pays.issuer && offer.taker_gets.currency == gets.currency && offer.taker_gets.issuer == gets.issuer;
    });

    if (result.length > 0) {
        return true;
    }

    return false;
}

setTimeout(throwDisconnectError, 1000 * 60 * 10);

function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}