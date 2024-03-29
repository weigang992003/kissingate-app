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
var mongodbManager = require('./the-future-manager.js');
var PathFind = require('../src/js/ripple/pathfind.js').PathFind;

var emitter = new events.EventEmitter();

var servers = [{
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
mongodbManager.getAccount(0, function(result) {
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

var preferCurrencyList = [];

function checkIfHaveProfit(alt, type) {
    altMap[type] = alt;

    var elements = type.split(":");
    var currency1 = elements[0];
    var currency2 = elements[1];
    var currency3 = _.difference(currencyList, elements)[0];

    var alt1 = altMap[currency1 + ":" + currency2];
    var alt2 = altMap[currency2 + ":" + currency3];
    var alt3 = altMap[currency3 + ":" + currency1];

    if (alt1 && alt2 && alt3) {
        var rate12 = alt1.rate;
        var rate23 = alt2.rate;
        var rate31 = alt3.rate;

        var profitRate = math.round(rate12 * rate23 * rate31, 3);
        var send_max_rate = math.round(math.eval(1 / profitRate + "^(1/3)"), 3);
        console.log(currency1 + ":" + currency2 + ":" + currency3 + ": " + profitRate);

        fpio.emit('fp', [currency1, currency2, currency3], [{
            'dest_amount': alt1.dest_amount.to_json(),
            'source_amount': alt1.source_amount.to_json(),
            'paths': alt1.paths,
            "rate": alt1.rate
        }, {
            'dest_amount': alt2.dest_amount.to_json(),
            'source_amount': alt2.source_amount.to_json(),
            'paths': alt2.paths,
            "rate": alt2.rate
        }, {
            'dest_amount': alt3.dest_amount.to_json(),
            'source_amount': alt3.source_amount.to_json(),
            'paths': alt3.paths,
            "rate": alt3.rate
        }], 1, send_max_rate);

        if (profitRate < 1) {
            preferCurrencyList.push(currency1, currency2, currency3);

            var send_max_rate = math.round(math.eval(1 / profitRate + "^(1/3)"), 3);

            fpio.emit('fp', [currency1, currency2, currency3], [{
                'dest_amount': alt1.dest_amount.to_json(),
                'source_amount': alt1.source_amount.to_json(),
                'paths': alt1.paths,
                "rate": alt1.rate
            }, {
                'dest_amount': alt2.dest_amount.to_json(),
                'source_amount': alt2.source_amount.to_json(),
                'paths': alt2.paths,
                "rate": alt2.rate
            }, {
                'dest_amount': alt3.dest_amount.to_json(),
                'source_amount': alt3.source_amount.to_json(),
                'paths': alt3.paths,
                "rate": alt3.rate
            }], 0.6, send_max_rate);

            Logger.log(true, currency1 + ":" + currency2 + ":" + currency3 + ": " + profitRate, "send_max_rate:" + send_max_rate);
        }

        altMap = {};
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

function goNext(prefer1, prefer2, prefer3) {
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

    if (prefer1 && prefer2 && prefer3) {
        currency1 = prefer1;
        currency2 = prefer2;
        currency3 = prefer3;
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
        pathFind1.close();

        if (!res.alternatives) {
            addNoPathPair(currency1, currency2);
            noPathFound = true;
        }

        _.each(res.alternatives, function(raw) {
            handleAlt(dest_amount_1, raw);
        });
    });
    pathFind1.on('error', function(res) {
        noPathFound = true;
    })


    var pathFind2 = new PathFind(remote, account, account, Amount.from_json(dest_amount_2), src_currencies_2);
    pathFind2.on('update', function(res) {
        pathFind2.close();

        if (!res.alternatives) {
            noPathFound = true;
            addNoPathPair(currency2, currency3);
        }

        _.each(res.alternatives, function(raw) {
            handleAlt(dest_amount_2, raw);
        });

    });
    pathFind2.on('error', function(res) {
        noPathFound = true;
    })


    var pathFind3 = new PathFind(remote, account, account, Amount.from_json(dest_amount_3), src_currencies_3);
    pathFind3.on('update', function(res) {
        pathFind3.close();

        if (!res.alternatives) {
            noPathFound = true;
            addNoPathPair(currency3, currency1);
        }

        if (noPathFound) {
            altMap = {};
            goNext();
            return;
        }

        _.each(res.alternatives, function(raw) {
            handleAlt(dest_amount_3, raw);
        });

        if (preferCurrencyList.length > 0) {
            altMap = {};
            preferCurrencyList = [];
            setTimeout(doCurrentSearch, 2000);
            return;
        }

        altMap = {};
        goNext();
    });
    pathFind3.on('error', function(res) {
        altMap = {};
        goNext();
    });

    pathFind1.create();
    pathFind2.create();

    setTimeout(function() {
        pathFind3.create();
    }, 200);
}

function doCurrentSearch() {
    goNext(currencyList[0], currencyList[1], currencyList[2]);
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
        // console.log("step4:prepare currencies!")
        // currencies = ["XRP", "CNY", "JPY", "USD", "EUR", "FMM", "BTC", "STR"];
        // currencySize = currencies.length;
        // console.log("step5:query find path!");
        // goNext();
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