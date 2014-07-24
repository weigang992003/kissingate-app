var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var crypto = require('./crypto-util.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
var mongodbManager = require('./mongodb-manager.js');
var Logger = require('./the-future-logger.js').TFLogger;

Logger.getNewLog('find-path-solution');

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
var currency_unit = config.currency_unit;
var delay_time = config.delayWhenFailure;

var secret;
crypto.decrypt(config.secret, function(result) {
    secret = result;
});

var altMap = {};
var factorMap = {};
var xrp = {
    "currency": "XRP",
    "issuer": "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
    "value": "20000000"
};

var tx1Error = false;
var tx2Error = false;
var tx1Success = false;
var tx2Success = false;

emitter.setMaxListeners(1000);
emitter.once('payment', payment);
emitter.on('addPaymentBack', reAddPaymentListener);

function makeProfitIfCan(alt, type) {
    var alt1 = alt;

    alt1["type"] = type;
    alt1["time"] = new Date().getTime();
    if (altMap[type] && altMap[type].time > alt1.time) {
        return;
    }

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
            var send_max_rate = math.round(math.sqrt(1 / profitRate), 6);

            Logger.log(true, "profitRate:" + profitRate, elements[0] + "/" + elements[1], "rate:" + rate1,
                elements[1] + "/" + elements[0], "rate:" + rate2, "send_max_rate", send_max_rate,
                "alt1_dest_amount", alt1.dest_amount.to_text_full(), "alt1_source_amount", alt1.source_amount.to_text_full(),
                "alt2_dest_amount", alt2.dest_amount.to_text_full(), "alt2_source_amount", alt2.source_amount.to_text_full());

            var factor = 1;
            if (profitRate >= 0.9) {
                factor = 0.5;
            }

            if (factor > 0) {
                emitter.emit('payment', alt1, alt2, factor, send_max_rate);
            }
        }
    }
}

function payment(alt1, alt2, factor, send_max_rate) {
    var type = alt1.type;
    var oppositeType = alt2.type;

    var tx1 = remote.transaction();
    var tx1_dest_amount = alt1.dest_amount.product_human(factor);
    var tx1_source_amount = alt1.source_amount.product_human(factor);

    tx1.paths(alt1.paths);
    tx1.payment(account, account, tx1_dest_amount);
    tx1.send_max(tx1_source_amount.product_human(send_max_rate));

    var times = alt1.source_amount.ratio_human(alt2.dest_amount).to_human().replace(',', '');

    var tx2 = remote.transaction();
    var tx2_dest_amount = tx1_source_amount;
    var tx2_source_amount = alt2.source_amount.product_human(math.round((times * factor), 6));

    tx2.paths(alt2.paths);
    tx2.payment(account, account, tx2_dest_amount);
    tx2.send_max(tx2_source_amount.product_human(send_max_rate));

    Logger.log(true, "we make a payment here", "tx1_dest_amount", tx1_dest_amount.to_text_full(),
        "tx1_source_amount", tx1_source_amount.to_text_full(),
        "tx2_dest_amount", tx2_dest_amount.to_text_full(),
        "tx2_source_amount", tx2_source_amount.to_text_full(),
        "factor", factor, "times", times, "send_max_rate", send_max_rate);

    if (secret) {
        tx1.secret(secret);
        tx2.secret(secret);
    } else {
        return;
    }

    tx1Error = false;
    tx2Error = false;
    tx1Success = false;
    tx2Success = false;

    tx1.on('proposed', function(res) {
        tx1Error = true;
        Logger.log(true, res);
    });
    tx1.on('success', function(res) {
        tx1Success = true;
        emitter.emit('addPaymentBack');
    });
    tx1.on('error', function(res) {
        tx1Error = true;
        alt1.time = new Date().getTime() + delay_time;
        alt2.time = new Date().getTime() + delay_time;
        if (res.engine_result == "tecPATH_PARTIAL") {
            handlePartialPathError(tx1_dest_amount, tx1_source_amount, send_max_rate);
            emitter.emit('addPaymentBack');
        } else {
            Logger.log(true, res);
        }
    });

    tx2.on('proposed', function(res) {
        tx2Error = true;
        Logger.log(true, res);
    });
    tx2.on('success', function(res) {
        tx2Success = true;
        emitter.emit('addPaymentBack');
    });
    tx2.on('error', function(res) {
        tx2Error = true;
        alt1.time = new Date().getTime() + delay_time;
        alt2.time = new Date().getTime() + delay_time;
        if (res.engine_result == "tecPATH_PARTIAL") {
            handlePartialPathError(tx2_dest_amount, tx2_source_amount, send_max_rate);
            emitter.emit('addPaymentBack');
        } else {
            Logger.log(true, res);
        }
    });

    if (altMap[type].rate > alt1.rate && altMap[type].time > alt1.time) {
        Logger.log(true, "alt1 rate updated from " + alt1.rate + "to " + altMap[type].rate);
        emitter.once('payment', payment);
        return;
    }
    if (altMap[oppositeType].rate > alt2.rate && altMap[oppositeType].time > alt2.time) {
        Logger.log(true, "alt2 rate updated from " + alt2.rate + "to " + altMap[oppositeType].rate);
        emitter.once('payment', payment);
        return;
    }

    tx1.submit();
    tx2.submit();
}

var failedPayments = [];

function handlePartialPathError(dest_amount, source_amount, send_max_rate) {
    failedPayments.push({
        "dest_amount": dest_amount.to_text_full(),
        "source_amount": source_amount.to_text_full(),
        "send_max_rate": send_max_rate
    });
}

function reAddPaymentListener() {
    if (tx1Success && tx2Success) {
        emitter.once('payment', payment);
        return;
    }

    if ((tx1Error && tx2Success) || (tx2Error && tx1Success)) {
        mongodbManager.saveFailedTransaction(failedPayments[0]);
        failedPayments = [];
        emitter.once('payment', payment);
        return;
    }

    if (tx1Error && tx2Error) {
        failedPayments = [];
        emitter.once('payment', payment);
        return;
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

    return currencies;
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
                    alt.paths = raw.paths_computed ? raw.paths_computed : raw.paths_canonical;

                    var type = (typeof dest_amount == "string" ? "XRP" : dest_amount.currency) + ":" + (typeof raw.source_amount == "string" ? "XRP" : raw.source_amount.currency);

                    emitter.emit(type, alt, type);
                });
            });
        });
    });
}

setTimeout(throwDisconnectError, 1000 * 60 * 30);

remote.connect(function() {
    remote.requestAccountLines(account, function(err, result) {
        if (err) console.log(err);

        var currencies = prepareCurrencies(result.lines);
        queryFindPath(currencies);
    });
});


function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}