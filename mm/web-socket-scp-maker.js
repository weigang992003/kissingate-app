var math = require('mathjs');
var _ = require('underscore');

var ripple = require('../src/js/ripple');
var crypto = require('./crypto-util.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
var rsjs = require('./remote-service.js');
var TheFutureManager = require('./the-future-manager.js').TheFutureManager;
var tfm = new TheFutureManager();

var events = require('events');
var emitter = new events.EventEmitter();
emitter.once('decrypt', decrypt);
emitter.once('remoteConnect', remoteConnect);

var Logger = require('./log-util.js').CLogger;
var logger = new Logger();

var OfferService = require('./offer-service.js').OfferService;
var osjs = new OfferService();

var WSBookUtil = require('./web-socket-book-util.js').WSBookUtil;
var wsbu = new WSBookUtil();

var config = require('./config.js');
var transfer_rates = config.transfer_rates;
var same_currency_profit_maker = config.same_currency_profit_maker;

var Loop = require('./new-loop-util.js').Loop;

var CmdUtil = require('./cmd-builder.js').CmdUtil;
var cmdU = new CmdUtil();

var AmountUtil = require('./amount-util.js').AmountUtil;
var au = new AmountUtil();

var remote_options = remote_options = {
    // see the API Reference for available options
    // trace: true,
    trusted: true,
    local_signing: true,
    local_fee: true,
    fee_cushion: 1.5,
    max_fee: 15000,
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
tfm.getAccount(config.mother, function(result) {
    account = result.account;
    secret = result.secret;
    emitter.emit('decrypt', secret);
});

function decrypt(encrypted) {
    crypto.decrypt(encrypted, function(result) {
        secret = result;
        tfm.getEnv(function(result) {
            remoteConnect(result.env);
        })
    });
}

function remoteConnect(env) {
    console.log("step3:connect to remote!")
    rsjs.getRemote(env, function(r) {
        remote = r;

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
    });
}

function averageBalance(lines) {
    lines = _.filter(lines, function(line) {
        return line.limit != 0 && _.contains(same_currency_profit_maker, line.currency);
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
        if (!_.contains(same_currency_profit_maker, currency)) {
            i = i + 1;
            goNextCurrency(currencies, lines, i);
            return;
        }

        var scLines = lines[currency];

        var payList = scLines;
        var getList = scLines;

        goNext(payList, getList, new Loop([0, 1], scLines.length, false), function() {
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

function goNext(payList, getList, loop, callback) {
    if (loop.isCycle()) {
        if (callback) {
            callback();
        }
        return;
    }

    var curIndexSet = loop.curIndexSet();
    var i = curIndexSet[0];
    var j = curIndexSet[1];

    var pay = payList[i];
    var get = getList[j];

    var taker_gets = {
        'currency': pay.currency,
        'issuer': pay.account,
        'value': pay.balance
    };

    var taker_pays = {
        'currency': get.currency,
        'issuer': get.account,
        'value': pay.balance + ''
    };

    if (au.isVolumnNotAllowed(taker_gets)) {
        loop.next();
        goNext(payList, getList, loop, callback);
        return;
    };

    var transfer_rate = transfer_rates[taker_gets.issuer];
    if (!transfer_rate) {
        transfer_rate = 0;
    }

    var req = cmdU.buildCmd(taker_pays, taker_gets);
    wsbu.exeCmd(req, function(res) {
        console.log("quality:", res[0].quality);
        if (res[0].quality > 1.0005 + transfer_rate) {
            taker_pays.value = (taker_gets.value * res[0].quality) * 0.99999 + "";
            console.log("taker_pays", taker_pays);
            console.log("taker_gets", taker_gets);

            osjs.createFirstOffer(taker_pays, taker_gets, true, req, null, function() {
                loop.next();
                goNext(payList, getList, loop, callback);
            });
        } else {
            console.log("the first order is profit offer.");
            loop.next();
            goNext(payList, getList, loop, callback);
        }
    });
}

setTimeout(throwDisconnectError, 1000 * 60 * 10);

function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}