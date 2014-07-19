var http = require('http');
var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
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
        host: 's-west.ripple.com',
        port: 443,
        secure: true
    }]
};

var remote = new ripple.Remote(remote_options);
var Amount = ripple.Amount;

var account = config.account;

var currency_unit = config.currency_unit;


remote.connect(function() {
    var altMap = {};
    var xrp = {
        "currency": "XRP",
        "issuer": "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
        "value": "1000000"
    };
    var currencies = [];

    function makeProfitIfCan(alternative, type) {
        altMap[type] = alternative;

        var rate1 = alternative.rate;
        var rate2;

        var currencies = type.split(":");
        var oppositeType = currencies[1] + ":" + currencies[0];

        if (_.indexOf(_.keys(altMap), oppositeType) >= 0) {
            rate2 = altMap[oppositeType].rate;
            var profitRate = math.round(rate1 * rate2, 3);
            Logger.log(true, alternative.source_amount.to_human(), "rate:" + rate1,
                alternative.dest_amount.to_human(), "rate:" + rate2, "profitRate:" + profitRate);

            if (profitRate < 1) {
                var factor = math.round(((1 / (rate1 * rate2)) - 1), 3) * 1000;
                if (factor > 0) {
                    payment(altMap(type));
                    payment(altMap(oppositeType))
                }

            }

        }
    }

    function payment(alt, factor) {
        var tx = remote.transaction();

        tx.payment(account, account, alt.dest_amount.product_human(factor));
        tx.send_max(alt.send_max.product_human(factor));
        tx.paths(alt.paths);

        if (secret) {
            tx.secret(secret);
        } else {
            return;
        }

        tx.on('proposed', function(res) {
            console.dir(res);
        });
        tx.on('success', function(res) {
            console.dir(res);
        });
        tx.on('error', function(res) {
            console.dir(res);
        });

        Logger.log(true, "we make a payment here", "send_max", alt.send_max().to_human(),
            "dest_amount", alt.dest_amount().to_human());

        tx.submit();
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
                    "value": currency_unit[currency] != undefined ? currency_unit[currency] : '1'
                }
            }
        });


        currencies.push(xrp);
    }

    function queryFindPath(currencies) {
        _.each(currencies, function(dest_amount) {
            if (dest_amount.currency == "XRP") {
                dest_amount = dest_amount.value;
            }

            remote.requestPathFindCreate(account, account, dest_amount,
                typeof dest_amount == "string" ? _.without(currencies, xrp) : currencies, function(err, result) {
                    var alternatives = result.alternatives;

                    alternatives = _.each(alternatives, function(raw) {
                        var alt = {};
                        // alt.source_amount = raw.source_amount;
                        alt.dest_amount = Amount.from_json(dest_amount);
                        alt.source_amount = Amount.from_json(raw.source_amount);
                        alt.rate = alt.source_amount.ratio_human(dest_amount).to_human().replace(',', '');
                        alt.send_max = alt.source_amount.product_human(Amount.from_json('1.001'));
                        alt.paths = raw.paths_computed ? raw.paths_computed : raw.paths_canonical;

                        emitter.emit(dest_amount.currency + ":" + (typeof raw.source_amount == "string" ? "XRP" : raw.source_amount.currency),
                            alt, dest_amount.currency + ":" + (typeof raw.source_amount == "string" ? "XRP" : raw.source_amount.currency));
                    });
                });
        });
    }

    remote.requestAccountLines(account, function(err, result) {
        if (err) console.log(err);

        prepareCurrencies(result.lines);

        timer = setInterval(function() {
            queryFindPath(currencies);
        }, 10000);
    });


});

function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}