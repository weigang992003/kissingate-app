var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var crypto = require('./crypto-util.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
var mongodbManager = require('./the-future-manager.js');

var emitter = new events.EventEmitter();
emitter.once('decrypt', decrypt);
emitter.once('remoteConnect', remoteConnect);

var Logger = require('./log-util.js').CLogger;
var OfferService = require('./offer-service.js').OfferService;
var WSBookUtil = require('./web-socket-book-util.js').WSBookUtil;

var osjs;
var wsbu = new WSBookUtil();
var logger = new Logger();

var same_currency_keep_balances = config.same_currency_keep_balances;

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
console.log("get account!!");
mongodbManager.getAccount(config.mother, function(result) {
    account = result.account;
    secret = result.secret;
    emitter.emit('decrypt', secret);
});

function decrypt(encrypted) {
    crypto.decrypt(encrypted, function(result) {
        secret = result;
        emitter.emit('remoteConnect');
    });
}

function remoteConnect() {
    remote.connect(function() {
        console.log("remote connected!!");
        osjs = new OfferService(remote, account, secret);
        osjs.getOffers(function() {
            remote.requestAccountLines(account, function(err, result) {
                if (err) console.log(err);
                console.log("get Lines!!!!");
                averageBalance(result.lines);
            });
        })
    });
}

function averageBalance(lines) {
    lines = _.filter(lines, function(line) {
        return line.limit != 0 && _.contains(same_currency_keep_balances, line.currency);
    });

    lines = _.groupBy(lines, function(line) {
        return line.currency;
    });

    var newLines = {};
    var currencies = _.keys(lines);
    console.log("currencies", currencies);
    _.each(currencies, function(currency) {
        if (lines[currency].length > 1) {
            lines[currency] = _.sortBy(lines[currency], function(line) {
                return line.limit - 0;
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

    currencies = _.keys(newLines);
    goNextCurrency(currencies, newLines, 0);
}

function goNextCurrency(currencies, lines, i) {
    if (currencies.length > i) {
        var currency = currencies[i];
        if (!_.contains(same_currency_keep_balances, currency)) {
            i = i + 1;
            goNextCurrency(currencies, lines, i);
            return;
        }

        var sameCurrencyLines = lines[currency];

        var total = 0;
        _.each(sameCurrencyLines, function(e) {
            total = total + math.round(parseFloat(e.balance), 6);
        });

        var balanceMap = {};
        balanceMap[currency] = total;
        var average = math.round((total / sameCurrencyLines.length), 6);
        average = average * 0.99;

        var payList = [];
        var getList = [];

        _.each(sameCurrencyLines, function(e) {
            if (e.balance < average) {
                getList.push(e);
            } else {
                payList.push(e);
            }
        });

        goNext(payList, getList, 0, 0, average, function() {
            i = i + 1;
            if (currencies.length > i) {
                console.log("go next currency", currencies[i]);
                goNextCurrency(currencies, lines, i);
            } else {
                throw new Error("keep balance done!!!");
            }
        });
    }
}

function goNext(payList, getList, i, j, average, callback) {
    if (i >= payList.length || j >= getList.length) {
        if (callback) {
            callback();
        }
        return;
    }

    var pay = payList[i];
    var get = getList[j];

    var paymost = pay.balance - average;
    var getmost = average - get.balance;
    if (paymost > getmost && getmost > get.balance) {
        var taker_gets = {
            'currency': pay.currency,
            'issuer': pay.account,
            'value': getmost
        };
        var taker_pays = {
            'currency': get.currency,
            'issuer': get.account,
            'value': getmost + ''
        };

        var req = buildCmd(taker_pays, taker_gets);
        wsbu.exeCmd(req, function(res) {
            console.log("quality:", res[0].quality);
            if (res[0].quality > 1) {
                taker_gets.value = (taker_pays.value / res[0].quality) * 1.00001 + "";
                console.log("taker_pays", taker_pays);
                console.log("taker_gets", taker_gets);
                osjs.createFirstOffer(taker_pays, taker_gets, true, req, null, function() {
                    get.balance = average;
                    pay.balance = pay.balance - taker_gets.value;
                    payList[i] = pay;

                    j = j + 1;
                    goNext(payList, getList, i, j, average, callback);
                });
            } else {
                console.log("the first order is profit offer.");
                j = j + 1;
                goNext(payList, getList, i, j, average, callback);
                return;
            }
        });
    } else {
        i = i + 1;
        goNext(payList, getList, i, j, average, callback);
    }
}

function buildCmd(taker_pays, taker_gets) {
    var req = {
        cmd: 'book',
        params: []
    }

    var param = {
        limit: 1,
        filter: 1,
        cache: 0,
    }

    param[taker_pays.currency] = [taker_pays.issuer];
    param[taker_gets.currency] = [taker_gets.issuer];
    param["pays_currency"] = [taker_pays.currency];
    param["gets_currency"] = [taker_gets.currency];

    if (taker_pays.currency == taker_gets.currency) {
        param["filter"] = 0;
        param["pays_issuer"] = [taker_pays.issuer];
        param["gets_issuer"] = [taker_gets.issuer];
        param[taker_pays.currency] = [taker_pays.issuer, taker_gets.issuer];
    }

    req.params.push(param);

    logger.logOffer(taker_gets, taker_pays);

    return req;
}

setTimeout(throwDisconnectError, 1000 * 60 * 10);

function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}