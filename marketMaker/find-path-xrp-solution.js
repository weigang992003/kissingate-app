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

emitter.once('payment', payment);
emitter.on('addPaymentBack', reAddPaymentListener);

function makeProfitIfCan(alt, type) {
    var alt1 = alt;

    alt1["time"] = new Date().getTime();;
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
            send_max_rate = math.round(math.sqrt(1 / profitRate), 6);

            Logger.log(true, "profitRate:" + profitRate, elements[0] + "/" + elements[1], "rate:" + rate1,
                elements[1] + "/" + elements[0], "rate:" + rate2, "send_max_rate", send_max_rate,
                "alt1_dest_amount", alt1.dest_amount.to_text_full(), "alt1_source_amount", alt1.source_amount.to_text_full(),
                "alt2_dest_amount", alt2.dest_amount.to_text_full(), "alt2_source_amount", alt2.source_amount.to_text_full());

            var factor = 1;
            if (profitRate >= 0.9) {
                factor = 0.5;
            }

            if (factor > 0) {
                emitter.emit('payment', alt1, alt2, factor, type, oppositeType);
            }
        }
    }
}

function payment(alt1, alt2, factor, type, oppositeType) {
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
        "tx2_source_amount", tx2_source_amount.to_text_full(), "factor", factor, "times", times);

    if (secret) {
        tx1.secret(secret);
        tx2.secret(secret);
    } else {
        return;
    }

    tx1Success = false;
    tx2Success = false;

    tx1.on('proposed', function(res) {
        Logger.log(true, res);
    });
    tx1.on('success', function(res) {
        tx1Success = true;
        emitter.emit('addPaymentBack');
    });
    tx1.on('error', function(res) {
        if (res.engine_result == "tecPATH_PARTIAL" && altMap[type].rate <= alt1.rate && altMap[type].time >= alt1.time) {
            handlePartialPathError(tx1_dest_amount, tx1_source_amount, altMap[type].paths, tx1Success);
        } else if (res.engine_result == "tecPATH_PARTIAL") {
            tx1Success = true;
            emitter.emit('addPaymentBack');
        } else {
            Logger.log(true, res);
        }
    });

    tx2.on('proposed', function(res) {
        Logger.log(true, res);
    });
    tx2.on('success', function(res) {
        tx2Success = true;
        emitter.emit('addPaymentBack');
    });
    tx2.on('error', function(res) {
        if (res.engine_result == "tecPATH_PARTIAL" && altMap[oppositeType].rate <= alt2.rate && altMap[oppositeType].time >= alt2.time) {
            handlePartialPathError(tx1_dest_amount, tx2_source_amount, altMap[oppositeType].paths, tx2Success);
        } else if (res.engine_result == "tecPATH_PARTIAL") {
            tx2Success = true;
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

function handlePartialPathError(dest_amount, source_amount, paths, txSuccess) {
    var tx = remote.transaction();
    dest_amount = dest_amount.product_human(0.5);
    source_amount = source_amount.product_human(0.5);

    tx.payment(account, account, dest_amount);
    tx.send_max(source_amount.product_human(1.01));
    tx.paths(paths);

    tx.on('success', function(res) {
        txSuccess = true;
        emitter.emit('addPaymentBack');
    });

    tx.submit();
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
}

function queryFindPath(currencies) {
    var pathFinds = {};

    var dest_amount_xrp = Amount.from_json(currency_unit["XRP"]);

    var xrpPF = remote.pathFind(account, account, dest_amount_xrp, currencies);
    xrpPF.on("update", function(message) {
        var alternatives = message.alternatives;

        alternatives = _.each(alternatives, function(raw) {
            var alt = {};
            alt.source_amount = Amount.from_json(raw.source_amount);
            alt.rate = alt.source_amount.ratio_human(dest_amount_xrp).to_human().replace(',', '');
            // alt.send_max = alt.source_amount.product_human(Amount.from_json('1.005'));
            alt.paths = raw.paths_computed ? raw.paths_computed : raw.paths_canonical;

            console.log("XRP:" + raw.source_amount.currency, alt.rate);
            console.log(raw.source_amount);

            // emitter.emit(type, alt, type);
        });
    });

    _.each(currencies, function(dest_amount) {
        var remo = new ripple.Remote(remote_options);
        remo.connect(function() {
            var pf = remo.pathFind(account, account, Amount.from_json(dest_amount), [xrp])
            pf.on("update", function(message) {
                var alternatives = message.alternatives;

                alternatives = _.each(alternatives, function(raw) {
                    var alt = {};
                    alt.dest_amount = Amount.from_json(dest_amount);
                    alt.source_amount = Amount.from_json(raw.source_amount);
                    alt.rate = alt.source_amount.ratio_human(dest_amount).to_human().replace(',', '');
                    // alt.send_max = alt.source_amount.product_human(Amount.from_json('1.005'));
                    alt.paths = raw.paths_computed ? raw.paths_computed : raw.paths_canonical;

                    var type = dest_amount.currency + ":XRP";

                    console.log(type, alt.rate);
                    console.log(raw.source_amount);
                    console.log(typeof raw.source_amount);

                    // emitter.emit(type, alt, type);
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