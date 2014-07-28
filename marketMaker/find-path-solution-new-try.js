var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var crypto = require('./crypto-util.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
var mongodbManager = require('./mongodb-manager.js');
var Logger = require('./the-future-logger.js').TFLogger;
var getAllEvents = require('./event-index-manager.js').getAllEvents;
var getEventIndex = require('./event-index-manager.js').getEventIndex;
var getOppsiteType = require('./event-index-manager.js').getOppsiteType;

Logger.getNewLog('find-path-solution-new-try');

var emitter = new events.EventEmitter();
emitter.once('decrypt', decrypt);
emitter.once('remoteConnect', remoteConnect);
emitter.on('addPaymentListener', addPaymentListener);

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

var account;
var secret;
mongodbManager.getAccount(config.marketMaker, function(result) {
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

var weight = config.factorWeight;
var profit_rate = config.profitRate;
var currency_unit = config.currency_unit;
var delay_time = config.delayWhenFailure;

var altMap = {};
var xrp = {
    "currency": "XRP",
    "issuer": "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
    "value": "20000000"
};

function makeProfitIfCan(alt1, type) {
    altMap[type] = alt1;

    var oppositeType = getOppsiteType(type);
    if (_.indexOf(_.keys(altMap), oppositeType) >= 0) {
        var alt2 = altMap[oppositeType];
        var profitRate = math.round(alt1.rate * alt2.rate, 3);
        if (profitRate > 1.2) {
            emitter.removeAllListeners(type);
            emitter.removeAllListeners(oppositeType);
        }

        if (profitRate < profit_rate) {
            var send_max_rate = math.round(math.sqrt(1 / profitRate), 6);

            Logger.log(true, "profitRate:" + profitRate, "type:" + type + "(" + getEventIndex(type) + ")");

            var factor = 1;
            if (profitRate >= 0.95) {
                factor = 0.6;
            }

            emitter.emit(getEventIndex(type), alt1, alt2, factor, send_max_rate);
        }
    }
}

function clearTypeListener(type, oppositeType) {
    emitter.removeListener(type, makeProfitIfCan);
    emitter.removeListener(oppositeType, makeProfitIfCan);
    setTimeout(function() {
        addTypeListenser(type, oppositeType);
    }, 30 * 1000);
}

function addTypeListenser(type, oppositeType) {
    emitter.removeAllListeners(type);
    emitter.removeAllListeners(oppositeType);
    emitter.on(type, makeProfitIfCan);
    emitter.on(oppositeType, makeProfitIfCan);

    emitter.removeAllListeners(getEventIndex(type));
    emitter.once(getEventIndex(type), payment);
    emitter.once(getEventIndex(type), payment);
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

    Logger.log(true, "make a payment(" + getEventIndex(type) + ")!",
        "tx1", tx1_dest_amount.to_human_full() + "/" + tx1_source_amount.to_human_full(),
        "tx2", tx2_dest_amount.to_human_full() + "/" + tx2_source_amount.to_human_full());

    if (secret) {
        tx1.secret(secret);
        tx2.secret(secret);
    } else {
        return;
    }

    tx1.on('proposed', function(res) {
        if (res.engine_result == "tesSUCCESS") {
            emitter.emit('addPaymentListener', type);
        }
    });
    tx1.on('success', function(res) {
        Logger.log(true, type + "(" + getEventIndex(type) + ")" + " tx1 is success!");
    });
    tx1.on('error', function(res) {
        clearTypeListener(type, oppositeType);
        handlePartialPathError(tx1_dest_amount, tx1_source_amount, send_max_rate);
        if (res.engine_result != "tecPATH_PARTIAL") {
            Logger.log(true, res.engine_result + ":" + res.result_message);
        }
    });

    tx2.on('proposed', function(res) {
        if (res.engine_result == "tesSUCCESS") {
            emitter.emit('addPaymentListener', type);
        }
    });
    tx2.on('success', function(res) {
        Logger.log(true, type + "(" + getEventIndex(type) + ")" + " tx2 is success!");
    });
    tx2.on('error', function(res) {
        clearTypeListener(type, oppositeType);
        handlePartialPathError(tx2_dest_amount, tx2_source_amount, send_max_rate);
        if (res.engine_result != "tecPATH_PARTIAL") {
            Logger.log(true, res.engine_result + ":" + res.result_message);
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

function addPaymentListener(type) {
    if (emitter.listeners(getEventIndex(type)).length < 8) {
        emitter.once(getEventIndex(type), payment);
    }
}

function prepareCurrencies(lines) {
    lines = _.filter(lines, function(line) {
        return line.balance != 0;
    });

    currencies = _.pluck(lines, 'currency');

    currencies = _.uniq(currencies);

    currencies.push("XRP");
    _.each(currencies, function(currency1) {
        _.each(currencies, function(currency2) {
            if (currency1 != currency2) {
                var type = currency1 + ":" + currency2;
                emitter.on(type, makeProfitIfCan);

                emitter.once(getEventIndex(type), payment);
            }

        });
    });

    issuerCurrencies = _.map(currencies, function(currency) {
        if (currency != "XRP") {
            return {
                "currency": currency,
                "issuer": account,
                "value": currency_unit[currency] ? currency_unit[currency] : '1'
            }
        }
    });


    issuerCurrencies.push(xrp);

    return _.compact(issuerCurrencies);
}

function queryFindPath(currencies) {
    _.each(currencies, function(dest_amount) {
        var currency = dest_amount.currency;
        if (dest_amount.currency == "XRP") {
            dest_amount = dest_amount.value;
        }

        var remo = new ripple.Remote(remote_options);
        remo.connect(function() {
            var pf = remo.pathFind(account, account, Amount.from_json(dest_amount), typeof dest_amount == "string" ? _.without(currencies, xrp) : currencies)
            pf.on("update", function(res) {
                var alternatives = res.alternatives;

                alternatives = _.each(alternatives, function(raw) {
                    var alt = {};
                    alt.dest_amount = Amount.from_json(dest_amount);
                    alt.source_amount = Amount.from_json(raw.source_amount);
                    alt.rate = alt.source_amount.ratio_human(dest_amount).to_human().replace(',', '');
                    alt.paths = raw.paths_computed ? raw.paths_computed : raw.paths_canonical;

                    var type = (typeof dest_amount == "string" ? "XRP" : dest_amount.currency) + ":" + (typeof raw.source_amount == "string" ? "XRP" : raw.source_amount.currency);
                    alt.type = type;

                    emitter.emit(type, alt, type);
                });
            });
        });
    });
}

function remoteConnect() {
    remote.connect(function() {
        remote.requestAccountLines(account, function(err, result) {
            if (err) console.log(err);

            var issuerCurrencies = prepareCurrencies(result.lines);
            queryFindPath(issuerCurrencies);
        });
    });
}

setTimeout(prepareRestart, 1000 * 60 * 60);

function prepareRestart() {
    var eventList = getAllEvents();
    _.each(eventList, function(e) {
        emitter.removeAllListeners(e);
    });
    setTimeout(throwDisconnectError, 1000 * 60);
}


function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}