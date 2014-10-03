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
var rippleInfo = require('./ripple-info-manager.js');

var Loop = require('./loop-util.js').Loop;
var CLogger = require('./log-util.js').CLogger;
var AmountUtil = require('./amount-util.js').AmountUtil;
var OfferService = require('./offer-service.js').OfferService;
var WSBookUtil = require('./web-socket-book-util.js').WSBookUtil;
var queryBookByOrder = require('./query-book.js').queryBookByOrder;
var FirstOrderUtil = require('./first-order-util.js').FirstOrderUtil;
var AccountListener = require('./listen-account-util.js').AccountListener;
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




function makeTriCurrencyProfit(orders, profit) {
    profit = math.round(profit, 6);
    console.log("tri data arrived! profit:", profit);
    var taker_pays_amounts = [];
    var taker_gets_amounts = [];
    var taker_pays_balances = [];
    var taker_gets_capacities = [];
    var length = orders.length;

    //
    for (var i = 0; i < orders.length; i++) {
        var order = orders[i];
        cLogger.logOrder(order);
        var taker_pays_amount = Amount.from_json(order.TakerPays);
        var taker_gets_amount = Amount.from_json(order.TakerGets);
        // var taker_pays_balance = tls.getBalance(au.getIssuer(order.TakerPays), au.getCurrency(order.TakerPays));
        // var taker_gets_capacity = tls.getBalance(au.getIssuer(order.TakerGets), au.getCurrency(order.TakerGets));
        // if (au.isVolumnNotAllowed(taker_pays_amount) || au.isVolumnNotAllowed(taker_gets_amount) ||
        //     au.isVolumnNotAllowed(taker_pays_balances) || au.isVolumnNotAllowed(taker_gets_capacity)) {
        //     console.log("the volumn is too small to trade tri!!!");
        //     emitter.once('makeTriCurrencyProfit', makeTriCurrencyProfit);
        //     return;
        // }
        // var min_taker_pays = au.minAmount([taker_pays_amount, taker_pays_balance]);
        // var min_taker_gets = au.minAmount([taker_gets_amount, taker_gets_capacity]);

        // var times = min_taker_gets.ratio_human(taker_gets_amount).to_human().replace(',', '');
        // times = math.round(times - 0, 6);
        // if (min_taker_pays.compareTo(taker_pays_amount.product_human(times)) == 1) {
        //     taker_gets_amount = au.setValue(taker_gets_amount, min_taker_gets);
        //     taker_pays_amount = taker_pays_amount.product_human(times);
        // } else {
        //     times = min_taker_pays.ratio_human(taker_pays_amount).to_human().replace(',', '');
        //     times = math.round(times - 0, 6);
        //     taker_pays_amount = au.setValue(taker_pays_amount, min_taker_pays);
        //     taker_gets_amount = taker_gets_amount.product_human(times);
        // }

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
    for (var i = 0, j = 0; j < 2; j++) {
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
    _.each(_.range(length), function(i) {
        console.log(taker_pays_amounts[i].to_text_full());
        console.log(taker_gets_amounts[i].to_text_full());
    });

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
    //                         emitter.once('makeTriCurrencyProfit', makeTriCurrencyProfit);
    //                     })
    //                 }
    //             });

    //         });
    //     } else {
    //         emitter.once('makeTriCurrencyProfit', makeTriCurrencyProfit);
    //     }
    // });
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

var order1 = {
    TakerPays: {
        currency: 'CNY',
        value: '10',
        issuer: 'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y'
    },
    Account: 'rEepZ4ok2UWuvBedU54XjfjxeiePexxEsq',
    quality: '0.1',
    TakerGets: {
        currency: 'JPY',
        value: '100',
        issuer: 'rMAz5ZnK73nyNUL4foAvaxdreczCkG3vA6'
    }
}

var order2 = {
    TakerPays: {
        currency: 'USD',
        value: '0.1',
        issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'
    },
    Account: 'rajDteRmFXXs8ALEhfPpwMZy7QuW3o7MtE',
    quality: '0.05',
    TakerGets: {
        currency: 'CNY',
        value: '2',
        issuer: 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'
    }
}


var order3 = {
    TakerPays: {
        currency: 'JPY',
        value: '16',
        issuer: 'rMAz5ZnK73nyNUL4foAvaxdreczCkG3vA6'
    },
    Account: 'rDVMxgwAd1ofsSLAzcRZfeEUUw8dFRYZJ8',
    quality: '20',
    TakerGets: {
        currency: 'USD',
        value: '0.8',
        issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'
    }
}

var orderList = [{
    TakerPays: {
        currency: 'BTC',
        value: '0.0000377123234481304',
        issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'
    },
    Account: 'r3cPPejMEFKidfAwrFATCXfE2dbde4Axho',
    quality: '0.002185225824444',
    TakerGets: {
        currency: 'CAD',
        value: '0.0172578609616825',
        issuer: 'r3ADD8kXSUKHd6zTCKfnKT3zV9EZHjzp1S'
    }
}, {
    TakerPays: {
        currency: 'JPY',
        value: '7015.866572189205',
        issuer: 'rMAz5ZnK73nyNUL4foAvaxdreczCkG3vA6'
    },
    Account: 'rh9yCJdcakq7JMLiZtZjsq9qdDffszaJHo',
    quality: '40734.87165128349',
    TakerGets: {
        currency: 'BTC',
        value: '0.172232445759238',
        issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'
    }
}, {
    TakerPays: {
        currency: 'CAD',
        value: '0.000103425117931',
        issuer: 'r3ADD8kXSUKHd6zTCKfnKT3zV9EZHjzp1S'
    },
    Account: 'r3cPPejMEFKidfAwrFATCXfE2dbde4Axho',
    quality: '0.010879977002252',
    TakerGets: {
        currency: 'JPY',
        value: '0.009506005197387',
        issuer: 'rMAz5ZnK73nyNUL4foAvaxdreczCkG3vA6'
    }
}];
makeTriCurrencyProfit(orderList, 0.9684799940048182);