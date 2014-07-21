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

var tx1Success = false;
var tx2Success = false;
var tx1error = false;
var tx2error = false;

var factorMap = {};

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
    currencies = _.pluck(lines, 'currency');

    currencies = _.uniq(currencies);

    _.each(currencies, function(currency1) {
        _.each(currencies, function(currency2) {
            emitter.on(currency1 + ":" + currency2, makeProfitIfCan);
        })
    });

    _.each(currencies, function(currency) {
        emitter.on("XRP" + ":" + currency, makeProfitIfCan);
        emitter.on(currency + ":" + "XRP", makeProfitIfCan);
    });

    currencies = _.map(currencies, function(currency) {
        if (currency.balance != '0') {
            return {
                "currency": currency,
                "issuer": account,
                "value": currency_unit[currency] ? currency_unit[currency] : '1'
            }
        }
    });


    currencies.push(xrp);
}

function queryFindPath(currencies) {
    var pathFinds = {};

    _.each(currencies, function(dest_amount) {
        if (dest_amount.currency == "XRP") {
            dest_amount = dest_amount.value;
        }

        var remo = new ripple.Remote(remote_options);
        remo.connect(function() {
            var pf = remo.pathFind(account, account, Amount.from_json(dest_amount), typeof dest_amount == "string" ? _.without(currencies, xrp) : currencies)
            pf.on("update", function(message) {
                var alternatives = message.alternatives;

                alternatives = _.each(alternatives, function(raw) {
                    var alt = {};
                    alt.dest_amount = Amount.from_json(dest_amount);
                    alt.source_amount = Amount.from_json(raw.source_amount);
                    alt.rate = alt.source_amount.ratio_human(dest_amount).to_human().replace(',', '');
                    // alt.send_max = alt.source_amount.product_human(Amount.from_json('1.005'));
                    alt.paths = raw.paths_computed ? raw.paths_computed : raw.paths_canonical;

                    var type = dest_amount.currency + ":" + (typeof raw.source_amount == "string" ? "XRP" : raw.source_amount.currency);

                    emitter.emit(type, alt, type);
                });
            });
        });
    });
}

setTimeout(throwDisconnectError, 1000 * 60 * 15);

remote.connect(function() {
    remote.requestAccountLines(account, function(err, result) {
        if (err) console.log(err);

        prepareCurrencies(result.lines);

        emitter.on('queryFindPath', queryFindPath);
        emitter.emit('queryFindPath', currencies);
    });
});


function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}