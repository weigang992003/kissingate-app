var Logger = require('./the-future-logger.js').TFLogger;
Logger.getNewLog('find-path-monitor');

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
var mongodbManager = require('./the-future-manager.js');

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

var fpRemotes = {};

var remote = new ripple.Remote(getRemoteOption());
var Amount = ripple.Amount;

var account;
console.log("step1:getAccount!")
mongodbManager.getAccount(config.marketMaker, function(result) {
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
            Logger.log(true, "(" + type + ")" + "profitRate:" + profitRate + "(" + rate1 + ":" + rate2 + ")",
                "timeConsume:" + (alt2.time - alt1.time));

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

            _.omit(altMap, [type, oppositeType]);
        }
    }
}

function prepareCurrencies(lines) {
    currencies = _.pluck(lines, 'currency');
    currencies = _.uniq(currencies);
    currencies.push("XRP");
    return currencies;
}

function queryFindPath(currencies) {
    _.each(currencies, function(currency) {
        var remo = new ripple.Remote(getRemoteOption());
        createFindPath(remo, currency);
        fpRemotes[currency] = remo;
    });

    var currencies = _.keys(fpRemotes);
    _.each(currencies, function(currency) {
        fpRemotes[currency].on('disconnect', function() {
            var remo = new ripple.Remote(getRemoteOption());
            createFindPath(remo, currency);
            fpRemotes[currency] = remo;
        })
    });
}

function createFindPath(remo, currency) {
    var dest_amount = {
        "currency": currency,
        "issuer": currency == "XRP" ? "rrrrrrrrrrrrrrrrrrrrrhoLvTp" : account,
        "value": currency_unit[currency] ? currency_unit[currency] * ratio + "" : '1'
    }

    if (currency == "XRP") {
        dest_amount = dest_amount.value;
    }

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
                alt.time = new Date().getTime();
                var type = (typeof dest_amount == "string" ? "XRP" : dest_amount.currency) + ":" + (typeof raw.source_amount == "string" ? "XRP" : raw.source_amount.currency);

                tfio.emit('tf', type, alt.rate);

                checkIfHaveProfit(alt, type);
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

remote.on('disconnect', function() {
    remote = new ripple.Remote(getRemoteOption());
    remoteConnect();
});