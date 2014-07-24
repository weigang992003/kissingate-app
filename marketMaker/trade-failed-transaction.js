var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var crypto = require('./crypto-util.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
var mongoManager = require('./mongodb-manager.js');

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

var account = config.account;
var weight = config.factorWeight;
var profit_rate = config.profitRate;
var encryptedSecret = config.secret;
var currency_unit = config.currency_unit;
var send_max_rate = config.sendMaxRate;

var altMap = {};
var factorMap = {};
var xrp = {
    "currency": "XRP",
    "issuer": "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
    "value": "1000000"
};

var tx1Success = false;
var tx2Success = false;

var secret;
crypto.decrypt(encryptedSecret, function(result) {
    secret = result;
});

emitter.once('submit', submitTX);

String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

var pathFindMap = [];
var transactionMap = {};

mongoManager.getAllFailedTransactions(function(docs) {
    var newDocs = _.map(docs, function(doc) {
        if (doc.dest_amount.endsWith("XRP")) {
            doc.dest_amount = doc.dest_amount + "/rrrrrrrrrrrrrrrrrrrrrhoLvTp";
        }

        if (doc.source_amount.endsWith("XRP")) {
            doc.source_amount = doc.source_amount + "/rrrrrrrrrrrrrrrrrrrrrhoLvTp";
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
                var alternatives = message.alternatives;

                alternatives = _.each(alternatives, function(raw) {
                    var alt = {};
                    alt.dest_amount = dest_amount;
                    alt.source_amount = Amount.from_json(raw.source_amount);
                    alt.rate = alt.source_amount.ratio_human(dest_amount).to_human().replace(',', '');
                    alt.paths = raw.paths_computed ? raw.paths_computed : raw.paths_canonical;

                    var type = pathFind.dest_currency + ":" + (typeof raw.source_amount == "string" ? "XRP" : raw.source_amount.currency);

                    txs = _.filter(transactionMap[type], function(tx) {
                        if (!tx['trade'] && tx.rate >= alt.rate) {
                            tx['paths'] = alt.paths;
                            emitter.emit('submit', type, tx);
                        }
                    });
                });
            });
        });
    });
}

function submitTX(type, transaction) {
    var tx = remote.transaction();

    var dest_amount = Amount.from_json(transaction.dest_amount);
    var source_amount = Amount.from_json(transaction.source_amount);

    tx.paths(transaction.paths);
    tx.payment(account, account, dest_amount);
    tx.send_max(source_amount.product_human(transaction.send_max_rate));

    tx.on('success', function(res) {
        mongoManager.deleteFailedTransaction({
            dest_amount: transaction.dest_amount,
            source_amount: transaction.source_amount,
            send_max_rate: transaction.send_max_rate
        })
        transaction['trade'] = true;
        emitter.once('submit', submitTX);
    });

    tx.on('proposed', function(res) {
        emitter.once('submit', submitTX);
    });

    tx.on('error', function(res) {
        emitter.once('submit', submitTX);
    });

}