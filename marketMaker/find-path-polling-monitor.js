var Logger = require('./new-logger.js').Logger;
var fpLogger = new Logger('find-path-polling-monitor');
var latLogger = new Logger('listen-account-tx');
var qbLogger = new Logger('query-book');

var io = require('socket.io').listen(3000);
var fpio = io.of('/fp');
var tfio = io.of('/tf');

var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var crypto = require('./crypto-util.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
var queryBook = require('./query-book.js').queryBook;
var mongodbManager = require('./the-future-manager.js');
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

            setTimeout(function() {
                goNext(elements[0], elements[1]);
            }, 2000);

            return;

        }
        altMap = {};

        goNext();
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
var currencySize;

function getNextIndex() {
    index2 = (index2 + 1) % currencySize;
    if (index2 == 0) {
        index1 = (index1 + 1) % currencySize;
        if (index1 == 0) {
            index2 = (index2 + 1) % currencySize;
        }
    }
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

function isNoPathPair(currency1, currency2) {
    return _.contains(noPathPair, (currency1 + ":" + currency2));
}

function resetNoPathPair() {
    noPathPair = [];
}

setInterval(resetNoPathPair, 1000 * 30 * 60);

function goNext(preferC1, preferC2) {
    if (!currencySize) {
        return;
    }

    if (index1 == index2) {
        getNextIndex();
    }

    var currency1 = currencies[index1];
    var currency2 = currencies[index2];

    if (preferC1 && preferC2) {
        currency1 = preferC1;
        currency2 = preferC2;
    }

    if (isNoPathPair(currency1, currency2)) {
        getNextIndex();
        goNext();
        return;
    }

    var dest_amount_1 = buildDestAmount(currency1);
    var src_currencies_1 = [buildSrcCurrencies(currency2)];

    var dest_amount_2 = buildDestAmount(currency2);
    var src_currencies_2 = [buildSrcCurrencies(currency1)];

    var noPathFound = false;

    var pathFind1 = new PathFind(remote, account, account, Amount.from_json(dest_amount_1), src_currencies_1);
    pathFind1.on('update', function(res) {
        var raw = res.alternatives[0];
        if (raw) {
            handleAlt(dest_amount_1, raw);
        } else {
            addNoPathPair(currency1, currency2);
            noPathFound = true;
        }
        pathFind1.close();
    });
    pathFind1.on('error', function(err) {
        fpLogger.error(true, err);
        noPathFound = true;
    })

    var pathFind2 = new PathFind(remote, account, account, Amount.from_json(dest_amount_2), src_currencies_2);
    pathFind2.on('update', function(res) {
        var raw = res.alternatives[0];
        if (noPathFound || !raw) {
            addNoPathPair(currency1, currency2);
            goNext();
            return;
        }
        handleAlt(dest_amount_2, raw);

        pathFind2.close();
    });
    pathFind2.on('error', function(err) {
        fpLogger.error(true, err);
        goNext();
        return;
    })
    pathFind1.create();
    pathFind2.create();

    getNextIndex();
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

        listenAccountTx();
    });
}

function listenAccountTx() {
    var a = remote.addAccount(account);

    a.on('transaction', function(tx) {
        var srcCurrency;
        var srcIssuer;
        var srcValue;
        var srcIssuers = [];

        var dstCurrency;
        var dstIssuer;
        var dstValue;
        var dstIssuers = [];

        var getAmount = tx.transaction.Amount;
        var hash = tx.transaction.hash;
        if (typeof getAmount == "string") {
            dstCurrency = "XRP";
            dstIssuer = "rrrrrrrrrrrrrrrrrrrrrhoLvTp";
            dstValue = getAmount;
        } else {
            dstCurrency = getAmount.currency;
            dstValue = getAmount.value;
        }

        var payAmount = tx.transaction.SendMax;
        if (typeof payAmount == "string") {
            srcCurrency = "XRP";
            srcIssuer = "rrrrrrrrrrrrrrrrrrrrrhoLvTp";
            srcValue = payAmount;
        } else {
            srcCurrency = payAmount.currency;
            srcValue = payAmount.value;
        }

        _.each(tx.meta.AffectedNodes, function(affectedNode) {
            var modifiedNode = affectedNode.ModifiedNode;
            if (!modifiedNode) {
                return;
            }
            if (modifiedNode.LedgerEntryType == "RippleState") {
                //here is the rule: finalFields and previsousField always relate LowLimit issuer;
                var finalFields = modifiedNode.FinalFields;
                if (finalFields && finalFields.HighLimit.issuer == account) {
                    if (srcCurrency == finalFields.LowLimit.currency) {
                        srcIssuer = finalFields.LowLimit.issuer;
                        if (!_.contains(srcIssuers, srcIssuer)) {
                            srcIssuers.push(srcIssuer);
                        }
                    };
                    if (dstCurrency == finalFields.LowLimit.currency) {
                        dstIssuer = finalFields.LowLimit.issuer;
                        if (!_.contains(dstIssuers, dstIssuer)) {
                            dstIssuers.push(dstIssuer);
                        }
                    }
                }

                if (finalFields && finalFields.LowLimit.issuer == account) {
                    if (srcCurrency == finalFields.HighLimit.currency) {
                        srcIssuer = finalFields.HighLimit.issuer;
                        if (!_.contains(srcIssuers, srcIssuer)) {
                            srcIssuers.push(srcIssuer);
                        }
                    };
                    if (dstCurrency == finalFields.HighLimit.currency) {
                        dstIssuer = finalFields.HighLimit.issuer;
                        if (!_.contains(dstIssuers, dstIssuer)) {
                            dstIssuers.push(dstIssuer);
                        }
                    }
                }
            }
        });


        if (dstIssuer && srcIssuer) {
            queryBook(remote, dstCurrency, dstIssuer, srcCurrency, srcIssuer, account, qbLogger);
        }


        latLogger.log(true, {
            srcCurrency: srcCurrency,
            srcIssuer: srcIssuer,
            srcValue: srcValue,
            dstCurrency: dstCurrency,
            dstIssuer: dstIssuer,
            dstValue: dstValue
        }, {
            "srcIssuers": srcIssuers,
            "dstIssuers": dstIssuers,
            "hash": hash
        });
    });
}
