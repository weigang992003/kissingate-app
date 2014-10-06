var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var crypto = require('./crypto-util.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
var tfm = require('./the-future-manager.js');
var rsjs = require('./remote-service.js');

var WSBookUtil = require('./web-socket-book-util.js').WSBookUtil;
var OfferService = require('./offer-service.js').OfferService;
var CmdUtil = require('./cmd-builder.js').CmdUtil;

var osjs;
var cu = new CmdUtil();
var wsbu = new WSBookUtil();

var emitter = new events.EventEmitter();
emitter.once('decrypt', decrypt);
emitter.once('remoteConnect', remoteConnect);

var remote;
var account;
var secret;
tfm.getAccount(config.mother, function(result) {
    account = result.account;
    secret = result.secret;
    emitter.emit('decrypt', secret);
});

var offers;
var orders = [];

function decrypt(encrypted) {
    crypto.decrypt(encrypted, function(result) {
        secret = result;
        tfm.getEnv(function(result) {
            remoteConnect(result.env);
        })
    });
}

function remoteConnect(env) {
    console.log("connect to remote!")
    rsjs.getRemote(env, function(r) {
        remote = r;

        remote.connect(function() {
            console.log('remote connected');
            osjs = new OfferService(remote, account, secret);
            osjs.getOffers(function() {
                offers = osjs.currentOffers();
                remote.requestAccountLines(account, function(err, result) {
                    if (err) console.log(err);
                    averageBalance(result.lines);
                });
            });
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
    var highLimits = {};
    var lowLimits = {};
    var currencies = _.keys(lines);
    _.each(currencies, function(currency) {
        if (lines[currency].length > 1) {
            lines[currency] = _.sortBy(lines[currency], function(line) {
                return parseInt(line.limit);
            });

            var limit = _.last(lines[currency]).limit;

            highLimits[currency] = _.filter(lines[currency], function(line) {
                return line.limit == limit;
            });

            lowLimits[currency] = _.filter(lines[currency], function(line) {
                return line.limit != limit && line.balance / line.limit >= 0.95;
            });
        }
    });

    console.log("highLimits:");
    console.log(highLimits);
    console.log("lowLimits:");
    console.log(lowLimits);

    currencies = _.keys(lowLimits);

    goNextCurrency(currencies, lowLimits, highLimits, 0);

}

function goNextOrder(lowList, highList, low_i, high_i, callback) {
    if (lowList.length > low_i) {
        var low = lowList[low_i];
        var high = highList[high_i];

        var taker_pays = {
            'currency': low.currency,
            'issuer': high.account,
            'value': low.balance
        };

        var taker_gets = {
            'currency': low.currency,
            'issuer': low.account,
            'value': low.balance
        };

        var req = cu.buildCmd(taker_pays, taker_gets);
        wsbu.exeCmd(req, function(res) {
            console.log("quality:", res[0].quality);
            if (res[0].quality > 1) {
                taker_gets.value = (taker_pays.value / res[0].quality) * 1.00001 + "";
                console.log("taker_pays", taker_pays);
                console.log("taker_gets", taker_gets);
                osjs.createFirstOffer(taker_pays, taker_gets, true, req, null, function(status) {
                    console.log(status);
                    high_i = (high_i + 1) % highList.length;
                    if (high_i == 0) {
                        low_i = low_i + 1;
                    }
                    goNextOrder(lowList, highList, low_i, high_i, callback);
                });
            } else {
                console.log("the first order is profit offer. goNext");
                high_i = (high_i + 1) % highList.length;
                if (high_i == 0) {
                    low_i = low_i + 1;
                }
                goNextOrder(lowList, highList, low_i, high_i, callback);
            }
        });
    } else {
        if (callback) {
            callback();
        }
    }
}

function goNextCurrency(currencies, lowLimits, highLimits, currency_i) {
    var currency = currencies[currency_i];

    if (currencies.length > currency_i) {
        var lowList = lowLimits[currency];
        var highList = highLimits[currency];
        if (lowList.length > 0 && highList.length > 0) {
            goNextOrder(lowList, highList, 0, 0, function() {
                currency_i = currency_i + 1;
                goNextCurrency(currencies, lowLimits, highLimits, currency_i);
            })
        } else {
            currency_i = currency_i + 1;
            goNextCurrency(currencies, lowLimits, highLimits, currency_i);
        }
    } else {
        throw new Error("low to high keep balance done!");
    }
}

setTimeout(throwDisconnectError, 1000 * 60 * 3);

function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}