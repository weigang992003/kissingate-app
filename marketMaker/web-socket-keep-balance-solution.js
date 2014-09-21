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
emitter.on('goNext', goNext);
emitter.on('createOffer', createOffer);

var OfferService = require('./offer-service.js').OfferService;
var WSBookUtil = require('./web-socket-book-util.js').WSBookUtil;

var osjs;
var wsbu = new WSBookUtil();

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

    });

    emitter.emit('goNext');
}

function goNextCurrency(currencies, lines, i) {
    if (currencies.length > i) {
        var sameCurrencyLines = lines[currency];

        var total = 0;
        _.each(sameCurrencyLines, function(e) {
            total = total + math.round(parseFloat(e.balance), 6);
        });
        balanceMap[currency] = total;
        var average = math.round((total / sameCurrencyLines.length), 6);

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
            goNextCurrency(currencies, lines, i);
        });
    }
}

function goNext(payList, getList, i, j, average, callback) {
    if (payList.length > i || getList.length > j) {
        if (callback) {
            callback();
        }
        return;
    }

    var pay = payList[i];
    var get = getList[j];

    var paymost = pay.balance - average;
    var getmost = average - get.balance;
    if (paymost > getmost) {
        var taker_gets = {
            'currency': currency,
            'issuer': pay.account,
            'value': getmost
        };
        var taker_pays = {
            'currency': currency,
            'issuer': get.account,
            'value': getmost + ''
        };

        var req = buildCmd(taker_pays, taker_gets);
        wsbu.exeCmd(req, function(res) {
            if (res[0].quality > 1) {
                taker_gets.value = res.quality * 0.9999 + "";
            }

            osjs.createFirstOffer(taker_pays, taker_gets, true, req, null, function() {
                get.balance = average;
                pay.balance = pay.balance - taker_gets.value;
                payList[i] = pay;

                j = j + 1;
                goNext(payList, payList, getList, i, j, average);
            });
        });
    } else {
        i = i + 1;
        goNext(payList, payList, getList, i, j, average);
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
        param["pays_issuer"] = [taker_pays.issuer];
        param["gets_issuer"] = [taker_gets.issuer];
        param[taker_pays.currency] = [taker_pays.issuer, taker_gets.issuer];
    }

    req.params.push(param);

    return req;
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
        throw new Error('something wrong!!!!');
    })

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

setTimeout(throwDisconnectError, 1000 * 60 * 10);

function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}