var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var crypto = require('./crypto-util.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
var tfm = require('./the-future-manager.js');
var rsjs = require('./remote-service.js');

var emitter = new events.EventEmitter();
emitter.once('decrypt', decrypt);
emitter.once('remoteConnect', remoteConnect);
emitter.on('createOffer', createOffer);


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
            remote.requestAccountOffers(account, function() {
                offers = arguments[1].offers;
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
    _.each(currencies, function(currency) {
        if (lowLimits[currency].length > 0) {
            _.each(lowLimits[currency], function(low) {
                var list = highLimits[currency];
                if (list) {
                    _.each(list, function(high) {
                        var taker_pays = {
                            'currency': currency,
                            'issuer': high.account,
                            'value': low.balance
                        };

                        var taker_gets = {
                            'currency': currency,
                            'issuer': low.account,
                            'value': low.balance,
                        };
                        if (!ifOfferExist(offers, taker_pays, taker_gets)) {
                            offersCreate.push({
                                'taker_pays': taker_pays,
                                'taker_gets': taker_gets
                            })
                        }
                    });
                }
            });
        }
    });

    goNext();
}

var next = 0;
var offersCreate = [];

function goNext() {
    if (offersCreate.length > next) {
        emitter.emit('createOffer', offersCreate[next].taker_pays, offersCreate[next].taker_gets);
    } else {
        throw new Error('we are done!!!!');
    }
}

function createOffer(taker_pays, taker_gets) {
    var tx = remote.transaction();
    if (secret) {
        tx.secret(secret);
    } else {
        return;
    }

    console.log(true, "we are create offer here", "taker_pays", taker_pays, "taker_gets", taker_gets);

    tx.offerCreate(account, taker_pays, taker_gets);
    tx.on("success", function(res) {
        console.log("create offer success");
        next++;
        goNext();
    });
    tx.on("error", function(res) {
        console.log(res);
        throw new Error('something wrong!!!!');
    });

    tx.submit();
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

setTimeout(throwDisconnectError, 1000 * 60 * 3);

function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}