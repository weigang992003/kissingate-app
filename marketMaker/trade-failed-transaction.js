var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var crypto = require('./crypto-util.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
var mongoManager = require('./mongodb-manager.js');
var Logger = require('./the-future-logger.js').TFLogger;

var emitter = new events.EventEmitter();

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
var Amount = ripple.Amount;

var drops = config.drops;
var mother = config.motherAccount;

var account;
var secret;
emitter.once('decrypt', decrypt);
emitter.once('submit', submitTX);
emitter.once('remoteConnect', remoteConnect);

mongoManager.getAccount(1, function(result) {
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

var xrp = {
    "currency": "XRP",
    "issuer": "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
    "value": "1000000"
};

String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

var pathFindMap = [];
var transactionMap = {};
Logger.getNewLog('trade-failed-transaction');

function addAccountZero(s) {
    return s + "/rrrrrrrrrrrrrrrrrrrrrhoLvTp";
}

function removeAccountZero(s) {
    if (s.indexOf("/XRP/") > -1) {
        return s.replace("/rrrrrrrrrrrrrrrrrrrrrhoLvTp", "");
    }
    return s;
}

function justKeepNumberForXRP(s) {
    if (s.indexOf("/XRP/") > -1) {
        return math.round(s.replace("/XRP/rrrrrrrrrrrrrrrrrrrrrhoLvTp", "") * drops, 0);
    }
    return s;
}

function replaceMarketMaker(s) {
    return s.replace(mother, account);
}

function replaceMarketMakerBack(s) {
    return s.replace(account, mother);
}

function queryFindPath(pathFindMap, transactionMap) {
    var pathFinds = {};

    _.each(pathFindMap, function(pathFind) {
        var dest_amount = pathFind.dest_amount;
        if (pathFind.dest_currency == "XRP") {
            dest_amount = Amount.from_json(dest_amount.to_human().replace(",", ""));
        }

        var remo = new ripple.Remote(remote_options);
        remo.connect(function() {
            var pf = remo.pathFind(account, account, dest_amount, pathFind.src_currencies)
            pf.on("update", function(message) {
                console.log("hsjdhsjhds");
                var alternatives = message.alternatives;

                alternatives = _.each(alternatives, function(raw) {
                    var alt = {};
                    alt.dest_amount = dest_amount;
                    alt.source_amount = Amount.from_json(raw.source_amount);
                    alt.rate = alt.source_amount.ratio_human(dest_amount).to_human().replace(',', '');
                    alt.paths = raw.paths_computed ? raw.paths_computed : raw.paths_canonical;

                    var type = pathFind.dest_currency + ":" + (typeof raw.source_amount == "string" ? "XRP" : raw.source_amount.currency);

                    transactionMap[type] = _.filter(transactionMap[type], function(tx) {
                        return !tx.trade;
                    });

                    _.each(transactionMap[type], function(tx) {
                        if (!tx.trade && tx.rate >= alt.rate) {
                            tx.paths = alt.paths;
                            emitter.emit('submit', type, tx, alt.rate);
                        }
                    });
                });
            });
        });
    });
}

function submitTX(type, transaction, currentRate) {
    Logger.log(true, "we will submit a failed transaction here.",
        "type", type, "tx.rate", transaction.rate, "currentRate", currentRate,
        "send_max_rate", transaction.send_max_rate,
        "dest_amount", transaction.dest_amount,
        "source_amount", transaction.source_amount);

    var tx = remote.transaction();

    var dest_amount = Amount.from_json(justKeepNumberForXRP(transaction.dest_amount));
    var source_amount = Amount.from_json(justKeepNumberForXRP(transaction.source_amount));

    tx.paths(transaction.paths);
    tx.payment(account, account, dest_amount);
    tx.send_max(source_amount.product_human(transaction.send_max_rate == undefined ? "1.000001" : transaction.send_max_rate));

    if (secret) {
        tx.secret(secret);
    } else {
        return;
    }

    tx.on('success', function(res) {
        var record = {
            dest_amount: replaceMarketMakerBack(removeAccountZero(transaction.dest_amount)),
            source_amount: replaceMarketMakerBack(removeAccountZero(transaction.source_amount)),
            send_max_rate: transaction.send_max_rate == undefined ? null : transaction.send_max_rate
        };
        Logger.log(true, "record to remove", record);
        mongoManager.deleteFailedTransaction(record);
        transaction.trade = true;
        emitter.once('submit', submitTX);
    });

    tx.on('proposed', function(res) {
        Logger.log(true, res);
    });

    tx.on('error', function(res) {
        if (res.engine_result == "tecPATH_PARTIAL" || res.engine_result == "telINSUF_FEE_P") {} else {
            Logger.log(true, res);
        }
        transaction.trade = true;
        emitter.once('submit', submitTX);
    });

    tx.submit();
}

setTimeout(throwDisconnectError, 1000 * 60 * 10);

function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}

function remoteConnect() {
    remote.connect(function() {
        mongoManager.getAllFailedTransactions(function(docs) {
            var newDocs = _.map(docs, function(doc) {
                doc.dest_amount = replaceMarketMaker(doc.dest_amount);
                doc.source_amount = replaceMarketMaker(doc.source_amount);

                if (doc.dest_amount.endsWith("XRP")) {
                    doc.dest_amount = addAccountZero(doc.dest_amount);
                }

                if (doc.source_amount.endsWith("XRP")) {
                    doc.source_amount = addAccountZero(doc.source_amount);
                }

                var dest_amount = Amount.from_json(doc.dest_amount);
                var dest_amount_json = dest_amount.to_json();
                var source_amount = Amount.from_json(doc.source_amount);
                var source_amount_json = source_amount.to_json();
                var rate = source_amount.ratio_human(dest_amount).to_human().replace(',', '');

                var item = _.find(pathFindMap, function(pathFind) {
                    return pathFind.dest_currency == dest_amount_json.currency;
                })

                if (!item) {
                    item = {};
                    item['dest_currency'] = dest_amount_json.currency;
                    item['dest_amount'] = dest_amount;

                    var src_currencies = [];
                    src_currencies.push({
                        'currency': source_amount_json.currency,
                        'issuer': source_amount_json.issuer
                    });

                    item['src_currencies'] = src_currencies;
                    pathFindMap.push(item);
                } else {
                    var src_currencies = _.compact(item['src_currencies']);

                    var src_currency = _.find(src_currencies, function(src_currency) {
                        return src_currency.currency == source_amount_json.currency;
                    });
                    if (!src_currency) {
                        src_currencies.push({
                            'currency': source_amount_json.currency,
                            'issuer': source_amount_json.issuer
                        });
                    }

                    item['src_currencies'] = src_currencies;
                }

                return {
                    'dest_amount': doc.dest_amount,
                    'source_amount': doc.source_amount,
                    'send_max_rate': doc.send_max_rate,
                    'type': dest_amount_json.currency + ":" + source_amount_json.currency,
                    'rate': rate
                };
            });

            transactionMap = _.groupBy(newDocs, function(doc) {
                return doc.type;
            });

            queryFindPath(pathFindMap, transactionMap);
        });
    });
}