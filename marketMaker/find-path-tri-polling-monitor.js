var Logger = require('./the-future-logger.js').TFLogger;
Logger.getNewLog('find-path-tri-polling-monitor');

var io = require('socket.io').listen(3001);
var fpio = io.of('/fp');
var tfio = io.of('/tf');

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
console.log("step1:getAccount!")
mongodbManager.getAccount(config.marketMaker, function(result) {
    account = result.account;
    remoteConnect();
});

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

    var elements = type.split(":");
    var currency1 = elements[0];
    var currency2 = elements[1];
    var currency3 = _.difference(currencyList, elements);

    if (_.indexOf(_.keys(altMap), currency2 + ":" + currency3) >= 0) {
        if (_.indexOf(_.keys(altMap), currency3 + ":" + currency1) >= 0) {
            var alt2 = altMap[currency2 + ":" + currency3];
            var alt3 = altMap[currency3 + ":" + currency1];
            var rate12 = alt1.rate;
            var rate23 = alt2.rate;
            var rate31 = alt3.rate;
            var profitRate = math.round(rate12 * rate23 * rate31, 3);
            if (profitRate < 1) {
                Logger.log(true, urrency1 + ":" + currency2 + ":" + currency3 + ": " + profitRate);
            }
        }
    }
}

function prepareCurrencies(lines) {
    lines = _.filter(lines, function(line) {
        return line.balance != 0 && line.limit != 0;
    });
    currencies = _.pluck(lines, 'currency');
    currencies = _.uniq(currencies);
    currencies.push("XRP");
    currencySize = currencies.length;
    return currencies;
}

var index1 = 0;
var index2 = 1;
var index3 = 2;
var currencySize;

var indexStack = [2, 1, 0];

function getNextIndex() {
    var index = _.first(indexStack);
    indexStack = _.rest(indexStack);
    index = (index + 1) % currencySize;
    if (index == 0 && indexStack.length > 0) {
        indexStack = getNextIndex();
    }

    while (_.contains(indexStack, index)) {
        indexStack.unshift(index);
        indexStack = getNextIndex();
        index = _.first(indexStack);
        indexStack = _.rest(indexStack);
    }

    indexStack.unshift(index);
    return indexStack;
}

var noPathPair = [];

function addNoPathPair(currency1, currency2) {
    if (_.contains(noPathPair, (currency1 + ":" + currency2))) {
        return;
    }
    noPathPair.push(currency1 + ":" + currency2);
    noPathPair.push(currency2 + ":" + currency1);
    console.log(noPathPair);
}

function isNoPathPair(currency1, currency2, currency3) {
    return _.contains(noPathPair, (currency1 + ":" + currency2)) || _.contains(noPathPair, (currency2 + ":" + currency3)) || _.contains(noPathPair, (currency1 + ":" + currency3));
}

function resetNoPathPair() {
    noPathPair = [];
}

setInterval(resetNoPathPair, 1000 * 30 * 60);

var currencyList = [];
var pathFindDone = false;

function goNext() {
    pathFindDone = false;

    if (!currencySize) {
        return;
    }

    getNextIndex();

    var currency1 = currencies[indexStack[0]];
    var currency2 = currencies[indexStack[1]];
    var currency3 = currencies[indexStack[2]];

    if (isNoPathPair(currency1, currency2, currency3)) {
        getNextIndex();
        goNext();
        return;
    }

    currencyList = [currency1, currency2, currency3];

    var dest_amount_1 = buildDestAmount(currency1);
    var src_currencies_1 = [buildSrcCurrencies(currency2), buildSrcCurrencies(currency3)];

    var dest_amount_2 = buildDestAmount(currency2);
    var src_currencies_2 = [buildSrcCurrencies(currency3), buildSrcCurrencies(currency1)];

    var dest_amount_3 = buildDestAmount(currency3);
    var src_currencies_3 = [buildSrcCurrencies(currency1), buildSrcCurrencies(currency2)];

    var noPathFound = false;

    var pathFind1 = new PathFind(remote, account, account, Amount.from_json(dest_amount_1), src_currencies_1);
    pathFind1.on('update', function(res) {
        if (!res.alternatives) {
            addNoPathPair(currency1, currency2);
            noPathFound = true;
        }
        _.each(res.alternatives, function(raw) {
            handleAlt(dest_amount_1, raw);
        });

        pathFind1.close();
    });


    var pathFind2 = new PathFind(remote, account, account, Amount.from_json(dest_amount_2), src_currencies_2);
    pathFind2.on('update', function(res) {
        if (!res.alternatives) {
            noPathFound = true;
            addNoPathPair(currency2, currency3);
        }
        _.each(res.alternatives, function(raw) {
            handleAlt(dest_amount_2, raw);
        });

        pathFind2.close();
    });


    var pathFind3 = new PathFind(remote, account, account, Amount.from_json(dest_amount_3), src_currencies_3);
    pathFind3.on('update', function(res) {
        pathFindDone = true;
        if (!res.alternatives) {
            addNoPathPair(currency3, currency1);
        }
        if (noPathFound) {
            pathFind3.close();
            goNext();
            return;
        }
        _.each(res.alternatives, function(raw) {
            handleAlt(dest_amount_3, raw);
        });
        pathFind3.close();

        goNext();
    });
    pathFind3.on('error', function(res) {
        goNext();
    });

    pathFind1.create();
    pathFind2.create();
    pathFind3.create();
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
        remote.requestAccountLines(account, function(err, result) {
            if (err) console.log(err);
            console.log("step4:prepare currencies!")
            prepareCurrencies(result.lines);

            console.log("step5:query find path!");
            goNext();
        });

        remote.on('error', function(error) {
            throw new Error("remote error!");
        });

        remote.on('disconnect', function() {
            remote = new ripple.Remote(getRemoteOption());
            remoteConnect();
        });
    });
}