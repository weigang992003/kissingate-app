var Logger = require('./new-logger.js').Logger;
var wsdoLogger = new Logger("web-socket-dcp-offer");

var io = require('socket.io-client');
var pows = io.connect('http://localhost:3003/ws');
var fows = io.connect('http://localhost:3006/ws');
var tows = io.connect('http://localhost:3007/ws');

var math = require('mathjs');
var WebSocket = require('ws');
var _ = require('underscore');
var events = require('events');
var config = require('./config.js');
var ripple = require('../src/js/ripple');
var crypto = require('./crypto-util.js');
var rsjs = require('./remote-service.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
var tfmjs = require('./the-future-manager.js');

var CmdUtil = require('./cmd-builder.js').CmdUtil;
var Loop = require('./loop-util.js').Loop;
var CLogger = require('./log-util.js').CLogger;
var AmountUtil = require('./amount-util.js').AmountUtil;
var OfferService = require('./offer-service.js').OfferService;
var WSBookUtil = require('./web-socket-book-util.js').WSBookUtil;
var FirstOrderUtil = require('./first-order-util.js').FirstOrderUtil;
var TrustLineService = require('./trust-line-service.js').TrustLineService;

var au = new AmountUtil();
var cLogger = new CLogger();
var wsbu = new WSBookUtil();
var fou = new FirstOrderUtil();
var tfm = new tfmjs.TheFutureManager();

var tls;
var osjs;
var Amount = ripple.Amount;
var remote = rsjs.getRemote();

var drops = config.drops;
var transfer_rates = config.transfer_rates;
var first_order_allow_volumns = config.first_order_allow_volumns;
var solved_too_small_volumn_currencies = config.solved_too_small_volumn_currencies;

var emitter = new events.EventEmitter();

function buildCmd(order) {
    var pays_issuer = au.getIssuer(order.TakerPays);
    var pays_currency = au.getCurrency(order.TakerPays);
    var gets_issuer = au.getIssuer(order.TakerGets);
    var gets_currency = au.getCurrency(order.TakerGets);

    return buildCmdByIssuerNCurrency(pays_issuer, pays_currency, gets_issuer, gets_currency);
}

function buildCmdByIssuerNCurrency(pays_issuer, pays_currency, gets_issuer, gets_currency) {
    var cmd = {
        "cmd": "book",
        "params": {
            "pays_currency": [pays_currency],
            "gets_currency": [gets_currency]
        },
        "limit": 1,
        "filter": 1,
        "cache": 0
    }

    if (pays_currency == gets_currency) {
        cmd.filter = 0;
        cmd.params[pays_currency] = [pays_issuer, gets_issuer];
        cmd.params["pays_issuer"] = [pays_issuer];
        cmd.params["gets_issuer"] = [gets_issuer];
    } else {
        cmd.params[pays_currency] = [pays_issuer];
        cmd.params[gets_currency] = [gets_issuer];
    }

    console.log(cmd);

    return cmd;
}

function listenProfitOrder() {
    console.log("step5:listen to profit socket!");
    pows.on('dcp', function(orders, profit) {
        emitter.emit('makeMultiCurrencyProfit', orders, profit);
    });
    tows.on('top', function(orders, profit) {
        emitter.emit('makeMultiCurrencyProfit', orders, profit);
    })
}

emitter.once('makeMultiCurrencyProfit', makeMultiCurrencyProfit);

function makeMultiCurrencyProfit(orders, profit) {
    profit = math.round(profit, 6);
    console.log("tri data arrived! profit:", profit);
    var taker_pays_amounts = [];
    var taker_gets_amounts = [];
    var taker_pays_balances = [];
    var taker_gets_capacities = [];
    var length = orders.length;

    for (var i = 0; i < orders.length; i++) {
        var order = orders[i];
        cLogger.logOrder(order);
        var taker_pays_amount = Amount.from_json(order.TakerPays);
        var taker_gets_amount = Amount.from_json(order.TakerGets);
        var taker_pays_balance = tls.getBalance(au.getIssuer(order.TakerPays), au.getCurrency(order.TakerPays));
        var taker_gets_capacity = tls.getCapacity(au.getIssuer(order.TakerGets), au.getCurrency(order.TakerGets));
        if (au.isVolumnNotAllowed(taker_pays_amount) || au.isVolumnNotAllowed(taker_gets_amount) ||
            au.isVolumnNotAllowed(taker_pays_balance) || au.isVolumnNotAllowed(taker_gets_capacity)) {
            console.log("the volumn is too small to trade for multi!!!");
            emitter.once('makeMultiCurrencyProfit', makeMultiCurrencyProfit);
            return;
        }
        var min_taker_pays = au.minAmount([taker_pays_amount, taker_pays_balance]);
        var min_taker_gets = au.minAmount([taker_gets_amount, taker_gets_capacity]);

        var times = min_taker_gets.ratio_human(taker_gets_amount).to_human().replace(',', '');
        times = math.round(times - 0, 6);
        if (min_taker_pays.compareTo(taker_pays_amount.product_human(times)) == 1) {
            taker_gets_amount = au.setValue(taker_gets_amount, min_taker_gets);
            taker_pays_amount = taker_pays_amount.product_human(times);
        } else {
            times = min_taker_pays.ratio_human(taker_pays_amount).to_human().replace(',', '');
            times = math.round(times - 0, 6);
            taker_pays_amount = au.setValue(taker_pays_amount, min_taker_pays);
            taker_gets_amount = taker_gets_amount.product_human(times);
        }

        taker_pays_amounts.push(taker_pays_amount);
        taker_gets_amounts.push(taker_gets_amount);
    };


    //we pick one currency we want to make profit.
    //it means that we invest the money as much as taker_pays_amount.
    //final_taker_gets_amount means how much money we can get back if we put taker_pays_amount into market.
    //taker_gets_amount means that how much money the market has.
    //if final_taker_gets_amount bigger than taker_gets_amount. we need to reduce our invest.
    //we cal how much moneny we need to invest, that's the start_taker_pays_amount means.
    var taker_pays_amount = taker_pays_amounts[0];
    var times = math.round(1 / profit, 6);
    var final_taker_gets_amount = taker_pays_amount.product_human(times);
    var where = findTakerGetsWhere(taker_gets_amounts, taker_pays_amount);
    var taker_gets_amount = taker_gets_amounts[where];
    if (final_taker_gets_amount.compareTo(taker_gets_amount) == 1) {
        var start_taker_pays_amount = taker_gets_amount.product_human(profit);
        times = start_taker_pays_amount.ratio_human(taker_pays_amount).to_human().replace(',', '');
        times = math.round(times - 0, 6);
        taker_pays_amounts[0] = au.setValue(taker_pays_amount, start_taker_pays_amount);
        taker_gets_amounts[0] = taker_gets_amounts[0].product_human(times);
    }

    //we build the order based on start_taker_pays_amount. cal the result for each stop to final profit
    for (var i = 0, j = 0; j < length - 1; j++) {
        var pre_taker_gets_amount = taker_gets_amounts[i];

        var next_i = findTakerPaysWhere(taker_pays_amounts, pre_taker_gets_amount);
        var next_taker_pays_amount = taker_pays_amounts[next_i];
        var next_taker_gets_amount = taker_gets_amounts[next_i];

        var times = pre_taker_gets_amount.ratio_human(next_taker_pays_amount).to_human().replace(',', '');
        times = math.round(times - 0, 6);
        taker_pays_amounts[next_i] = au.setValue(next_taker_pays_amount, pre_taker_gets_amount);
        taker_gets_amounts[next_i] = next_taker_gets_amount.product_human(times);
        i = next_i;
    };

    var cmds = [];
    var exchanges = {};
    _.each(_.range(length), function(i) {
        exchanges[i + ""] = taker_pays_amounts[i].to_text_full() + "->" + taker_gets_amounts[i].to_text_full();
        console.log(taker_pays_amounts[i].to_text_full(), "->", taker_gets_amounts[i].to_text_full());
    });

    wsdoLogger.log(true, exchanges);

    // osjs.canCreateDCPOffers(cmds, 0, function(canCreate) {
    //     if (canCreate) {
    //         _.each(_.range(length), function(i) {
    //             var taker_pays_json = taker_pays_amounts[i].to_json();
    //             var taker_gets_json = taker_pays_amounts[i].to_json();
    //             osjs.createOffer(taker_gets_json, taker_pays_json, wsoLogger, false, function(status) {
    //                 console.log("tx", status);
    //                 if (i == length - 1) {
    //                     tls.getLines(function() {
    //                         console.log("re-listen tri profit order!!!");
    //                         emitter.once('makeMultiCurrencyProfit', makeMultiCurrencyProfit);
    //                     })
    //                 }
    //             });

    //         });
    //     } else {
    //         emitter.once('makeMultiCurrencyProfit', makeMultiCurrencyProfit);
    //     }
    // });

    emitter.once('makeMultiCurrencyProfit', makeMultiCurrencyProfit);
}

function findTakerPaysWhere(taker_pays_amounts, taker_gets_amount) {
    for (var i = 0; i < taker_pays_amounts.length; i++) {
        if (taker_pays_amounts[i].currency().to_json() == taker_gets_amount.currency().to_json()) {
            return i;
        }
    };
}

function findTakerGetsWhere(taker_gets_amounts, taker_pays_amount) {
    for (var i = 0; i < taker_gets_amounts.length; i++) {
        if (taker_gets_amounts[i].currency().to_json() == taker_pays_amount.currency().to_json()) {
            return i;
        }
    };
}


var account;
var secret;
console.log("step1:getAccount!")
tfmjs.getAccount(config.marketMaker, function(result) {
    account = result.account;
    secret = result.secret;
    decrypt(secret);
});

function decrypt(encrypted) {
    console.log("step2:decrypt secret!")
    crypto.decrypt(encrypted, function(result) {
        secret = result;
        tfmjs.getEnv(function(result) {
            remoteConnect(result.env);
        })
    });
}

function remoteConnect(env) {
    console.log("step3:connect to remote!")
    rsjs.getRemote(env, function(r) {
        remote = r;

        remote.connect(function() {
            osjs = new OfferService(remote, account, secret);
            osjs.getOffers();

            tls = new TrustLineService(remote, account);
            tls.getLines(function() {
                listenProfitOrder();
            });

            remote.on('error', function(error) {
                throw new Error("remote error!");
            });

            remote.on('disconnect', function() {
                remoteConnect(env);
            });
        });
    });
}