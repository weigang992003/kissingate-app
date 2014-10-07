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

var CmdUtil = require('./cmd-builder.js').CmdUtil;
var Loop = require('./loop-util.js').Loop;
var CLogger = require('./log-util.js').CLogger;
var AmountUtil = require('./amount-util.js').AmountUtil;
var OfferService = require('./offer-service.js').OfferService;
var WSBookUtil = require('./web-socket-book-util.js').WSBookUtil;
var queryBookByOrder = require('./query-book.js').queryBookByOrder;
var FirstOrderUtil = require('./first-order-util.js').FirstOrderUtil;
var AccountListener = require('./listen-account-util.js').AccountListener;
var TrustLineService = require('./trust-line-service.js').TrustLineService;

var cu = new CmdUtil();
var au = new AmountUtil();
var cLogger = new CLogger();
var wsbu = new WSBookUtil();
var fou = new FirstOrderUtil();
var tfm = new tfmjs.TheFutureManager();

var tls;
var osjs;
var Amount = ripple.Amount;

var drops = config.drops;
var transfer_rates = config.transfer_rates;
var first_order_allow_volumns = config.first_order_allow_volumns;
var solved_too_small_volumn_currencies = config.solved_too_small_volumn_currencies;

function MakeProfitService(tls, osjs) {
    this.tls = tls;
    this.osjs = osjs;
};

MakeProfitService.prototype.makeSameCurrencyProfit = function(order, cb) {
    var tls = this.tls;
    var osjs = this.osjs;

    var order_taker_pays = Amount.from_json(order.TakerPays);
    var order_taker_gets = Amount.from_json(order.TakerGets);

    order_taker_pays = order_taker_pays.product_human("1.0001");

    var order_pays_balance = tls.getBalance(au.getIssuer(order.TakerPays), au.getCurrency(order.TakerPays));
    var order_gets_capacity = tls.getCapacity(au.getIssuer(order.TakerGets), au.getCurrency(order.TakerGets));
    console.log("order_taker_pays for same currency:", order_taker_pays.to_text_full());
    console.log("order_gets_capacity for same currency:", order_gets_capacity.to_text_full());

    var min_taker_pays = au.minAmount([order_taker_pays, order_pays_balance]);
    var min_taker_gets = au.minAmount([order_taker_gets, order_gets_capacity]);

    if (au.isVolumnNotAllowed(min_taker_pays) || au.isVolumnNotAllowed(min_taker_gets)) {
        console.log("the volumn is too small to trade for same currency profit");
        callback(cb);
        return;
    }

    var cmd = buildCmd(order);

    osjs.createSCPOffer(order_taker_gets.to_json(), order_taker_pays.to_json(), cmd, null, function(status) {
        console.log("same currency tx:", status);
        callback(cb);
    });
}

MakeProfitService.prototype.makeCurrencyPairProfit = function(order1, order2, profit, cb) {
    console.log("new data arrived! profit:", profit);
    var order1_taker_pays_issuer = au.getIssuer(order1.TakerPays);
    var order1_taker_gets_issuer = au.getIssuer(order1.TakerGets);
    var order2_taker_pays_issuer = au.getIssuer(order2.TakerPays);
    var order2_taker_gets_issuer = au.getIssuer(order2.TakerGets);

    var order1_taker_pays_currency = au.getCurrency(order1.TakerPays);
    var order1_taker_gets_currency = au.getCurrency(order1.TakerGets);
    var order2_taker_pays_currency = au.getCurrency(order2.TakerPays);
    var order2_taker_gets_currency = au.getCurrency(order2.TakerGets);

    cLogger.logOrder(order1);
    cLogger.logOrder(order2);

    var order1_taker_pays = Amount.from_json(order1.TakerPays);
    var order1_taker_gets = Amount.from_json(order1.TakerGets);
    var order2_taker_pays = Amount.from_json(order2.TakerPays);
    var order2_taker_gets = Amount.from_json(order2.TakerGets);

    var order1_pays_balance = tls.getBalance(order1_taker_pays_issuer, order1_taker_pays_currency);
    var order1_gets_capacity = tls.getCapacity(order1_taker_gets_issuer, order1_taker_gets_currency);
    var order2_pays_balance = tls.getBalance(order2_taker_pays_issuer, order2_taker_pays_currency);
    var order2_gets_capacity = tls.getCapacity(order2_taker_gets_issuer, order2_taker_gets_currency);

    var min_taker_pays = au.minAmount([order1_taker_pays, order2_taker_gets, order2_gets_capacity, order1_pays_balance]);
    var min_taker_gets = au.minAmount([order1_taker_gets, order1_gets_capacity, order2_taker_pays, order2_pays_balance]);

    if (au.isVolumnNotAllowed(min_taker_pays) || au.isVolumnNotAllowed(min_taker_gets)) {
        console.log("the volumn is too small to trade!!!");
        callback(cb);
        return;
    }

    var times = min_taker_gets.ratio_human(order1_taker_gets).to_human().replace(',', '');
    times = math.round(times - 0, 6);
    if (min_taker_pays.compareTo(order1_taker_pays.product_human(times)) == 1) {
        order1_taker_gets = au.setValue(order1_taker_gets, min_taker_gets);
        order1_taker_pays = order1_taker_pays.product_human(times);

        times = min_taker_gets.ratio_human(order2_taker_pays).to_human().replace(',', '');
        times = math.round(times - 0, 6);
        order2_taker_pays = au.setValue(order2_taker_pays, min_taker_gets);
        order2_taker_gets = order2_taker_gets.product_human(times);
    } else {
        times = min_taker_pays.ratio_human(order1_taker_pays).to_human().replace(',', '');
        times = math.round(times - 0, 6);
        order1_taker_pays = au.setValue(order1_taker_pays, min_taker_pays);
        order1_taker_gets = order1_taker_gets.product_human(times);

        times = min_taker_pays.ratio_human(order2_taker_gets).to_human().replace(',', '');
        times = math.round(times - 0, 6);
        order2_taker_gets = au.setValue(order2_taker_gets, min_taker_pays);
        order2_taker_pays = order2_taker_pays.product_human(times);
    }

    order1_taker_pays = order1_taker_pays.product_human("1.0001");
    order2_taker_pays = order2_taker_pays.product_human("1.0001");

    var cmds = [];
    cmds.push(buildCmd(order1));
    cmds.push(buildCmd(order2));

    osjs.canCreateDCPOffers(cmds, 0, function(canCreate) {
        if (canCreate) {
            osjs.createOffer(order1_taker_gets.to_json(), order1_taker_pays.to_json(), wsoLogger, false, function(status) {
                console.log("tx1", status);
                wsoLogger.log(true, "tx1", status, order1_taker_gets.to_json(), order1_taker_pays.to_json());
            });
            osjs.createOffer(order2_taker_gets.to_json(), order2_taker_pays.to_json(), wsoLogger, false, function(status) {
                console.log("tx2", status);
                wsoLogger.log(true, "tx2", status, order2_taker_gets.to_json(), order2_taker_pays.to_json());

                tls.getLines(function() {
                    console.log("re-listen profit order!!!");
                    callback(cb);
                })
            });
        } else {
            callback(cb);
        }
    });
}

function makeTriCurrencyProfit(orders, profit, cb, callback) {
    var size = orders.length;
    profit = math.round(profit, 6);
    console.log("tri data arrived! profit:", profit);

    var taker_pays_amounts = [];
    var taker_gets_amounts = [];
    var taker_pays_balances = [];
    var taker_gets_capacities = [];

    for (var i = 0; i < size; i++) {
        var order = orders[i];
        cLogger.logOrder(order);

        var taker_pays_amount = Amount.from_json(order.TakerPays);
        var taker_gets_amount = Amount.from_json(order.TakerGets);
        var taker_pays_balance = tls.getBalance(au.getIssuer(order.TakerPays), au.getCurrency(order.TakerPays));
        var taker_gets_capacity = tls.getBalance(au.getIssuer(order.TakerGets), au.getCurrency(order.TakerGets));

        if (au.isVolumnNotAllowed(taker_pays_amount) || au.isVolumnNotAllowed(taker_gets_amount) ||
            au.isVolumnNotAllowed(taker_pays_balances) || au.isVolumnNotAllowed(taker_gets_capacity)) {
            console.log("the volumn is too small to trade tri!!!");
            callback(cb);
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
    for (var i = 0, j = 0; j < size; j++) {
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

    _.each(_.range(size), function(i) {
        console.log(taker_pays_amounts[i].to_text_full());
        console.log(taker_gets_amounts[i].to_text_full());
    });

    var cmds = [];
    _.each(orders, function(order) {
        cmds.push(buildCmd(order));
    });

    osjs.canCreateDCPOffers(cmds, 0, function(canCreate) {
        if (canCreate) {
            _.each(_.range(size), function(i) {
                var taker_pays_json = taker_pays_amounts[i].to_json();
                var taker_gets_json = taker_gets_amounts[i].to_json();
                osjs.createOffer(taker_gets_json, taker_pays_json, null, false, function(status) {
                    console.log("tx", status);
                    if (i == length - 1) {
                        tls.getLines(function() {
                            console.log("re-listen make profit!!!!");
                            callback(cb);
                        });
                    }
                });
            });
        } else {
            callback(cb);
        }
    });
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


function callback(cb) {
    if (cb) {
        cb();
    }
}

function buildCmd(order) {
    var pays_issuer = au.getIssuer(order.TakerPays);
    var pays_currency = au.getCurrency(order.TakerPays);
    var gets_issuer = au.getIssuer(order.TakerGets);
    var gets_currency = au.getCurrency(order.TakerGets);

    return cu.buildCmdByIssuerNCurrency(pays_issuer, pays_currency, gets_issuer, gets_currency);
}