var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var crypto = require('./crypto-util.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
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
var account = config.account;
var encryptedSecret = config.secret;
var currency_unit = config.currency_unit;
var weight = config.factorWeight;

var secret;
decrypt();

var altMap = {};
var xrp = {
    "currency": "XRP",
    "issuer": "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
    "value": "1000000"
};


var currencies;
var issuerMap;


var tx1Success = false;
var tx2Success = false;
var tx1error = false;
var tx2error = false;

var factorMap = {};

var issuerMap = {};

emitter.once('payment', payment);
emitter.on('addPaymentBack', reAddPaymentListener);


function decrypt() {
    crypto.decrypt(encryptedSecret, function(result) {
        secret = result;
    });
}

function makeProfitIfCan(alt, type) {
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

        if (profitRate < 0.995) {
            Logger.log(true, "profitRate:" + profitRate, elements[0] + "/" + elements[1], "rate:" + rate1,
                elements[1] + "/" + elements[0], "rate:" + rate2,
                "alt1_dest_amount", alt1.dest_amount.to_text_full(), "alt1_source_amount", alt1.source_amount.to_text_full(),
                "alt2_dest_amount", alt2.dest_amount.to_text_full(), "alt2_source_amount", alt2.source_amount.to_text_full());
            var factor = math.round(((1 / (rate1 * rate2)) - 1), 3) * 1000;

            if (factor > 0) {
                emitter.emit('payment', alt1, alt2, factor, type, oppositeType);
            }
        }
    }
}

function payment(alt1, alt2, factor, type, oppositeType) {
    if (factorMap[type]) {
        factor = factorMap[type] + factor;
        factorMap[type] = factorMap[type] + weight;
        factorMap[type] = _.min([20, factorMap[type]]);
    } else if (factorMap[oppositeType]) {
        factor = factorMap[oppositeType] + factor;
        factorMap[oppositeType] = factorMap[oppositeType] + weight;
        factorMap[oppositeType] = _.min([20, factorMap[oppositeType]]);
    } else {
        factorMap = {};
        factorMap[type] = weight;
        factorMap[oppositeType] = weight;
    }

    factor = math.round(_.min([factor, 20]), 0);
    if (factor == 0) {
        factor = 1;
    }

    var tx1 = remote.transaction();
    var tx1_dest_amount = alt1.dest_amount.product_human(factor);
    var tx1_source_amount = alt1.source_amount.product_human(factor);

    tx1.payment(account, account, tx1_dest_amount);
    tx1.send_max(tx1_source_amount.product_human(1.01));
    tx1.paths(alt1.paths);

    var tx2 = remote.transaction();
    var times = alt1.source_amount.ratio_human(alt2.dest_amount).to_human().replace(',', '');
    var tx2_dest_amount = tx1_source_amount;
    var tx2_source_amount = alt2.source_amount.product_human(math.round((times * factor), 6));

    tx2.payment(account, account, tx2_dest_amount);
    tx2.send_max(tx2_source_amount.product_human(1.01));
    tx2.paths(alt2.paths);

    Logger.log(true, "we make a payment here", "tx1_dest_amount", tx1_dest_amount.to_text_full(),
        "tx1_source_amount", tx1_source_amount.to_text_full(),
        "tx2_dest_amount", tx2_dest_amount.to_text_full(),
        "tx2_source_amount", tx2_source_amount.to_text_full(), "factor", factor, "times", times);

    if (secret) {
        tx1.secret(secret);
        tx2.secret(secret);
    } else {
        return;
    }

    tx1error = false;
    tx2error = false;
    tx1Success = false;
    tx2Success = false;

    tx1.on('proposed', function(res) {
        Logger.log(true, res);
    });
    tx1.on('success', function(res) {
        tx1Success = true;
        emitter.emit('addPaymentBack');
        // Logger.log(true, res);
    });
    tx1.on('error', function(res) {
        tx1error = true;
        Logger.log(true, res);
    });

    tx2.on('proposed', function(res) {
        Logger.log(true, res);
    });
    tx2.on('success', function(res) {
        tx2Success = true;
        emitter.emit('addPaymentBack');
        // Logger.log(true, res);
    });
    tx2.on('error', function(res) {
        tx2error = true;
        Logger.log(true, res);
    });

    tx1.submit();
    tx2.submit();
}

function reAddPaymentListener() {
    if (tx1Success && tx2Success) {
        emitter.once('payment', payment);
    }
}

function prepareCurrencies(lines) {
    lines = _.filter(lines, function(line) {
        return line.balance != 0;
    });

    currencies = _.map(lines, function(line) {
        if (line.balance != 0) {
            return {
                issuer: line.account,
                currency: line.currency,
                value: line.balance
            }
        }
    })

    var allIssuers = {};
    _.each(currencies, function(item) {
        if (!allIssuers[item.currency]) {
            allIssuers[item.currency] = [];
        }

        allIssuers[item.currency].push(item.issuer);
    });

    _.each(_.keys(allIssuers), function(currency) {
        if (allIssuers[currency].length > 1) {
            issuerMap[currency] = allIssuers[currency];
        }
    })
}

function checkOrderBook() {
    var keys = _.keys(issuerMap);
    _.each(keys, function(currency) {
        var issuers = issuerMap[currency];
        _.each(issuers, function(issuer1) {
            _.each(issuers, function(issuer2) {
                if (issuer1 == issuer2) {
                    continue;
                }
                var book1 = remote.book(currency, issuer1, currency, issuer2);
                var book2 = remote.book(currency, issuer2, currency, issuer1);

            })
        })


        this.exchangeCurrency1.offers(function(offers) {
            self.emit('model-change', offers, "asks", marketEvent.buy);
        });

        this.exchangeCurrency2.offers(function(offers) {
            self.emit('model-change', offers, "bids", marketEvent.sell);
        });

        this.exchangeCurrency1.on('model', handleAsks);
        this.exchangeCurrency2.on('model', handleBids);
    });
}


setTimeout(throwDisconnectError, 1000 * 60 * 15);

remote.connect(function() {
    remote.requestAccountLines(account, function(err, result) {
        if (err) console.log(err);

        prepareCurrencies(result.lines);

    });
});


function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}