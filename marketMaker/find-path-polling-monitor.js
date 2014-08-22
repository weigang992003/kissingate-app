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
var theFuture = require('./the-future-manager.js');
var rippleInfo = require('./ripple-info-manager.js');
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
theFuture.getAccount(config.marketMaker, function(result) {
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

var books = [];

function listenAccountTx() {
    var a = remote.addAccount(account);

    a.on('transaction', function(tx) {
        if (tx.transaction.TransactionType != 'Payment') {
            return;
        }

        var src_currency;
        var src_issuer;
        var src_value;
        var src_issuers = [];

        var dst_currency;
        var dst_issuer;
        var dst_value;
        var dst_issuers = [];

        var getAmount = tx.transaction.Amount;
        var hash = tx.transaction.hash;
        if (typeof getAmount == "string") {
            dst_currency = "XRP";
            dst_issuer = "rrrrrrrrrrrrrrrrrrrrrhoLvTp";
            dst_value = getAmount;
        } else {
            dst_currency = getAmount.currency;
            dst_value = getAmount.value;
        }

        var payAmount = tx.transaction.SendMax;
        if (typeof payAmount == "string") {
            src_currency = "XRP";
            src_issuer = "rrrrrrrrrrrrrrrrrrrrrhoLvTp";
            src_value = payAmount;
        } else {
            src_currency = payAmount.currency;
            src_value = payAmount.value;
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
                    if (src_currency == finalFields.LowLimit.currency) {
                        src_issuer = finalFields.LowLimit.issuer;
                        if (!_.contains(src_issuers, src_issuer)) {
                            src_issuers.push(src_issuer);
                        }
                    };
                    if (dst_currency == finalFields.LowLimit.currency) {
                        dst_issuer = finalFields.LowLimit.issuer;
                        if (!_.contains(dst_issuers, dst_issuer)) {
                            dst_issuers.push(dst_issuer);
                        }
                    }
                }

                if (finalFields && finalFields.LowLimit.issuer == account) {
                    if (src_currency == finalFields.HighLimit.currency) {
                        src_issuer = finalFields.HighLimit.issuer;
                        if (!_.contains(src_issuers, src_issuer)) {
                            src_issuers.push(src_issuer);
                        }
                    };
                    if (dst_currency == finalFields.HighLimit.currency) {
                        dst_issuer = finalFields.HighLimit.issuer;
                        if (!_.contains(dst_issuers, dst_issuer)) {
                            dst_issuers.push(dst_issuer);
                        }
                    }
                }
            }
        });

        books.push({
            dst_currency: dst_currency,
            dst_issuer: dst_issuer,
            src_currency: src_currency,
            src_issuer: src_issuer,
        });

        if (books.length % 2 == 0 && books.length > 1) {
            checkProfit();
        }

        latLogger.log(true, {
            src_currency: src_currency,
            src_issuer: src_issuer,
            src_value: src_value,
            dst_currency: dst_currency,
            dst_issuer: dst_issuer,
            dst_value: dst_value
        }, {
            "src_issuers": src_issuers,
            "dst_issuers": dst_issuers,
            "hash": hash
        });
    });
}

function checkProfit() {
    var b1 = books[0];
    var b2 = books[1];

    books = _.rest(books, 2);

    if (!b1.src_issuer || !b1.dst_issuer || !b2.src_issuer || !b2.dst_issuer) {
        return;
    }

    var bi1;
    var bi2;

    queryBook(remote, b1.dst_currency, b1.dst_issuer, b1.src_currency, b1.src_issuer, account, qbLogger, function(bi) {
        bi1 = bi;
        if (bi1 && bi2) {
            createOffer(b1, bi1, b2, bi2);
        }
    });
    queryBook(remote, b2.dst_currency, b2.dst_issuer, b2.src_currency, b2.src_issuer, account, qbLogger, function(bi) {
        bi2 = bi;
        if (bi1 && bi2) {
            createOffer(b1, bi1, b2, bi2);
        }
    });
}

function createOffer(b1, bi1, b2, bi2) {
    if (bi1.price * bi2.price < 1) {
        rippleInfo.save({
            books: [b1, b2]
        });
        qbLogger.log(true, "profit:" + bi1.price * bi2.price, bi1, bi2);
    }
}