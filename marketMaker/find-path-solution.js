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
emitter.once('decrypt', decrypt);
emitter.once('remoteConnect', remoteConnect);
emitter.once('payment', payment);
emitter.on('addPaymentBack', reAddPaymentListener);

var remote_options = {
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

var account;
var secret;
console.log("step1:getAccount!")
mongodbManager.getAccount(config.marketMaker, function(result) {
    account = result.account;
    secret = result.secret;
    emitter.emit('decrypt', secret);
});

function decrypt(encrypted) {
    console.log("step2:decrypt secret!")
    crypto.decrypt(encrypted, function(result) {
        secret = result;
        emitter.emit('remoteConnect');
    });
}

var weight = config.factorWeight;
var profit_rate = config.profitRate;
var currency_unit = config.currency_unit;
var delay_time = config.delayWhenFailure;
var ratio = config.ratio;

var altMap = {};
var factorMap = {};

var tx1Success = false;
var tx2Success = false;

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

            Logger.log(true, "(" + type + ")" + "profitRate:" + profitRate);

            var factor = 1;
            if (profitRate >= 0.95) {
                factor = 0.6;
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

    var times;
    var tx2_dest_amount;
    var tx2_source_amount;
    if (tx1_source_amount.is_native()) {
        times = alt1.dest_amount.ratio_human(alt2.source_amount).to_human().replace(',', '');
        tx2_dest_amount = alt2.dest_amount.product_human(math.round((times * factor), 6));
        tx2_source_amount = tx1_dest_amount;
    } else {
        times = alt1.source_amount.ratio_human(alt2.dest_amount).to_human().replace(',', '');
        tx2_dest_amount = tx1_source_amount;
        tx2_source_amount = alt2.source_amount.product_human(math.round((times * factor), 6));
    }

    var tx2 = remote.transaction();
    tx2.paths(alt2.paths);
    tx2.payment(account, account, tx2_dest_amount);
    tx2.send_max(tx2_source_amount.product_human(send_max_rate));

    Logger.log(true, "make a payment(" + type + ")!",
        "tx1", tx1_dest_amount.to_human_full() + "/" + tx1_source_amount.to_human_full(),
        "tx2", tx2_dest_amount.to_human_full() + "/" + tx2_source_amount.to_human_full());

    if (secret) {
        tx1.secret(secret);
        tx2.secret(secret);
    } else {
        return;
    }

    tx1Success = false;
    tx2Success = false;

    tx1.on('proposed', function(res) {
        tx1Success = true;
        emitter.emit('addPaymentBack');
        Logger.log(true, "(" + type + ")" + " tx1 is success!");
    });

    tx1.on('error', function(res) {
        alt1.time = new Date().getTime() + delay_time;
        alt2.time = new Date().getTime() + delay_time;
        if (res.engine_result == "tecPATH_PARTIAL") {
            handlePartialPathError(tx1_dest_amount, tx1_source_amount, send_max_rate);
            tx1Success = true;
            emitter.emit('addPaymentBack');
        } else {
            Logger.log(true, res);
        }
    });

    tx2.on('proposed', function(res) {
        tx2Success = true;
        emitter.emit('addPaymentBack');
        Logger.log(true, "(" + type + ")" + " tx2 is success!");
    });

    tx2.on('error', function(res) {
        alt1.time = new Date().getTime() + delay_time;
        alt2.time = new Date().getTime() + delay_time;
        if (res.engine_result == "tecPATH_PARTIAL") {
            handlePartialPathError(tx2_dest_amount, tx2_source_amount, send_max_rate);
            tx2Success = true;
            emitter.emit('addPaymentBack');
        } else {
            Logger.log(true, res);
        }
    });

    tx1.submit();
    tx2.submit();
}

function handlePartialPathError(dest_amount, source_amount, send_max_rate) {
    mongodbManager.saveFailedTransaction({
        "dest_amount": dest_amount.to_text_full(),
        "source_amount": source_amount.to_text_full(),
        "send_max_rate": send_max_rate
    });
}

function reAddPaymentListener() {
    if (tx1Success && tx2Success) {
        emitter.once('payment', payment);
    }
}

function prepareCurrencies(lines) {
    currencies = _.pluck(lines, 'currency');

    currencies = _.uniq(currencies);

    currencies.push("XRP");
    _.each(currencies, function(currency1) {
        _.each(currencies, function(currency2) {
            if (currency1 != currency2) {
                emitter.on(currency1 + ":" + currency2, makeProfitIfCan);
            }
        })
    });

    currencies = _.map(currencies, function(currency) {
        return {
            "currency": currency,
            "issuer": currency == "XRP" ? "rrrrrrrrrrrrrrrrrrrrrhoLvTp" : account,
            "value": currency_unit[currency] ? currency_unit[currency] * ratio + "" : '1'
        }
    });

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
            var pf = remo.pathFind(account, account, Amount.from_json(dest_amount));
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

function remoteConnect() {
    console.log("step3:connect to remote!")

    remote.connect(function() {
        remote.requestAccountLines(account, function(err, result) {
            if (err) console.log(err);
            console.log("step4:prepare currencies!")

            var currencies = prepareCurrencies(result.lines);

            console.log("step5:query find path!")
            queryFindPath(currencies);
        });
    });
}

setTimeout(prepareRestart, 1000 * 60 * 30);

function prepareRestart() {
    emitter.removeAllListeners('payment');
    setTimeout(throwDisconnectError, 1000 * 60);
}


function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}