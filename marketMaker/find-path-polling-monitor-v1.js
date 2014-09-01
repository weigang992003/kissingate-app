var Logger = require('./new-logger.js').Logger;
var fpLogger = new Logger('find-path-polling-monitor');
var latLogger = new Logger('listen-account-tx');
var qbLogger = new Logger('query-book');

var io = require('socket.io').listen(3000);
var fpio = io.of('/fp');

var ioc = require('socket.io-client');
var wsio = ioc.connect('http://localhost:3003/ws');

var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var crypto = require('./crypto-util.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
var queryBook = require('./query-book.js').queryBook;
var theFuture = require('./the-future-manager.js');
var rippleInfo = require('./ripple-info-manager.js');
var PathFind = require('../src/js/ripple/pathfind.js').PathFind;

var OfferService = require('./offer-service.js').OfferService;
var osjs;

var TrustLineService = require('./trust-line-service.js').TrustLineService;
var tls;

var minAmount = require('./amount-util.js').minAmount;

var emitter = new events.EventEmitter();

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

var fpRemotes = [];

var remote = new ripple.Remote(getRemoteOption());
var Amount = ripple.Amount;

var account;
var secret;
console.log("step1:getAccount!")
theFuture.getAccount(config.marketMaker, function(result) {
    account = result.account;
    secret = result.secret;
    decrypt(secret);
});

function decrypt(encrypted) {
    console.log("step2:decrypt secret!")
    crypto.decrypt(encrypted, function(result) {
        secret = result;
        remoteConnect();
    });
}

var profit_rate = config.profitRate;
var currency_unit = config.currency_unit;
var ratio = config.ratio;

var altMap = {};

function getRemoteOption() {
    return {
        // trace: true,
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

function checkIfHaveProfit(alt, type) {
    var alt1 = alt;

    altMap[type] = alt1;

    var rate1 = alt1.rate;
    var rate2;

    var elements = type.split(":");
    var oppositeType = elements[1] + ":" + elements[0];

    if (_.indexOf(_.keys(altMap), oppositeType) >= 0) {
        var alt2 = altMap[oppositeType];
        rate2 = alt2.rate;

        var profitRate = math.round(rate1 * rate2, 3);

        if (profitRate < profit_rate) {
            fpLogger.log(true, "(" + type + ")" + "profitRate:" + profitRate + "(" + rate1 + ":" + rate2 + ")",
                "timeConsume:" + (alt1.time - alt2.time));

            var send_max_rate = math.round(math.sqrt(1 / profitRate), 6);

            var factor = 1;
            if (profitRate >= 0.95) {
                factor = 0.6;
            }

            fpio.emit('fp', type, {
                'dest_amount': alt1.dest_amount.to_json(),
                'source_amount': alt1.source_amount.to_json(),
                'paths': alt1.paths,
                "rate": alt1.rate
            }, {
                'dest_amount': alt2.dest_amount.to_json(),
                'source_amount': alt2.source_amount.to_json(),
                'paths': alt2.paths,
                "rate": alt2.rate
            }, factor, send_max_rate);

            altMap = {};

            return;

        }
        altMap = {};
    }
}

function goNext(currency1, currency2) {
    var dest_amount_1 = buildDestAmount(currency1);
    var src_currencies_1 = [buildSrcCurrencies(currency2)];

    var dest_amount_2 = buildDestAmount(currency2);
    var src_currencies_2 = [buildSrcCurrencies(currency1)];

    var pathFind1 = new PathFind(remote, account, account, Amount.from_json(dest_amount_1), src_currencies_1);
    pathFind1.on('update', function(res) {
        var raw = res.alternatives[0];
        if (raw) {
            handleAlt(dest_amount_1, raw);
        } else {
            pathFind1.close();
        }
    });

    var pathFind2 = new PathFind(remote, account, account, Amount.from_json(dest_amount_2), src_currencies_2);
    pathFind2.on('update', function(res) {
        var raw = res.alternatives[0];
        if (raw) {
            handleAlt(dest_amount_2, raw);
        } else {
            pathFind2.close();
        }
    });
    pathFind1.create();
    pathFind2.create();
}


function buildDestAmount(currency) {
    return currency == "XRP" ? currency_unit[currency] * ratio + "" : {
        "currency": currency,
        "issuer": currency == "XRP" ? "rrrrrrrrrrrrrrrrrrrrrhoLvTp" : account,
        "value": currency_unit[currency] ? currency_unit[currency] * ratio + "" : '1'
    }
}

function buildSrcCurrencies(currency) {
    var issuer = currency == "XRP" ? 'rrrrrrrrrrrrrrrrrrrrrhoLvTp' : account;
    return {
        "currency": currency,
        "issuer": issuer
    }
}

function getType(dest_amount, source_amount) {
    return (typeof dest_amount == "string" ? "XRP" : dest_amount.currency) +
        ":" + (typeof source_amount == "string" ? "XRP" : source_amount.currency);
}

function handleAlt(dest_amount, raw) {
    var alt = {};
    alt.dest_amount = Amount.from_json(dest_amount);
    alt.source_amount = Amount.from_json(raw.source_amount);
    alt.rate = alt.source_amount.ratio_human(dest_amount).to_human().replace(',', '');
    alt.paths = raw.paths_computed ? raw.paths_computed : raw.paths_canonical;
    alt.time = new Date().getTime();
    var type = getType(dest_amount, raw.source_amount);

    tfio.emit('tf', type, alt.rate);

    checkIfHaveProfit(alt, type);
}

function remoteConnect() {
    console.log("step3:connect to remote!")
    remote.connect(function() {
        if (!account || !secret) {
            console.log("no account!!!");
            process.exit(1);
        }

        remote.on('error', function(error) {
            throw new Error("remote error!");
        });

        remote.on('disconnect', function() {
            remote = new ripple.Remote(getRemoteOption());
            remoteConnect();
        });
    });
}

function listenProfitCurrencyPair() {
    console.log("step5:listen to profit socket!");
    wsio.on('po', function(currency1, currency2) {
        console.log("new data arrived!");
        goNext(currency1, currency2);
    });
}