var io = require('socket.io').listen(3006);
var wsio = io.of('/ws');

var math = require('mathjs');
var WebSocket = require('ws');
var _ = require('underscore');
var config = require('./config.js');
var ripple = require('../src/js/ripple');
var crypto = require('./crypto-util.js');
var rsjs = require('./remote-service.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
var tfmjs = require('./the-future-manager.js');
var rippleInfo = require('./ripple-info-manager.js');

var tfm = new tfmjs.TheFutureManager();
var firstOrders;
tfm.getFirstOrders(function(fos) {
    firstOrders = fos;
});

var Loop = require('./loop-util.js').Loop;
var ProfitUtil = require('./profit-util.js').ProfitUtil;
var AmountUtil = require('./amount-util.js').AmountUtil;
var OfferService = require('./offer-service.js').OfferService;
var WSBookUtil = require('./web-socket-book-util.js').WSBookUtil;
var queryBookByOrder = require('./query-book.js').queryBookByOrder;
var TrustLineService = require('./trust-line-service.js').TrustLineService;

var au = new AmountUtil();
var wsbu = new WSBookUtil();
var tls;
var osjs;
var pu = new ProfitUtil();

var drops = config.drops;
var profit_rate = config.profitRate;
var currencies_no = config.currencies_no;
var transfer_rates = config.transfer_rates;
var profit_min_volumns = config.profit_min_volumns;
var same_currency_profit = config.same_currency_profit;
var same_currency_issuers = config.same_currency_issuers;
var first_order_currencies = config.first_order_currencies;
var first_order_allow_issuers = config.first_order_allow_issuers;

function checkOrdersForDiffCurrency(orders) {
    console.log("get orders number:", orders.length);

    var currency1 = "XRP";
    var currency2 = first_order_currencies[cIndexSet[1]];

    var orders_type_1 = [];
    var orders_type_2 = [];
    _.each(orders, function(order) {
        var gets_currency = au.getCurrency(order.TakerGets);
        var gets_issuer = au.getIssuer(order.TakerGets);
        var pays_currency = au.getCurrency(order.TakerPays);
        var pays_issuer = au.getIssuer(order.TakerPays);

        if (gets_currency == currency1 && pays_currency == currency2) {
            order.quality = au.getPrice(order, pays_currency, gets_currency);
            orders_type_1.push(order);
        }

        if (gets_currency == currency2 && pays_currency == currency1) {
            order.quality = au.getPrice(order, pays_currency, gets_currency);
            orders_type_2.push(order);
        }
    });

    orders_type_1 = _.sortBy(orders_type_1, function(order) {
        return order.quality;
    });

    orders_type_2 = _.sortBy(orders_type_2, function(order) {
        return order.quality;
    });


    var firstOrders = buildFirstOrders(orders_type_1, orders_type_2, 0, 0);

    firstOrders = _.filter(firstOrders, function(o) {
        return o.Account != account;
    });

    if (firstOrders.length > 0) {
        var key = currencies_no[currency1] * currencies_no[currency2];
        console.log("first order number:", firstOrders.length, " key:", key);
        wsio.emit('fos', firstOrders, key);
    }
}

function buildFirstOrders(orders_type_1, orders_type_2, i, j) {
    var order_type_1;
    var order_type_2;

    if (i >= orders_type_1.length && j >= orders_type_2.length) {
        return [];
    }

    order_type_1 = orders_type_1[i % orders_type_1.length];
    order_type_2 = orders_type_2[j % orders_type_2.length];

    var real_gap = order_type_1.quality * order_type_2.quality;
    console.log("real profit gap:", real_gap);

    var expect_gap = pu.getMultiGap([order_type_1, order_type_2], 1.0005);
    console.log("expect min profit gap:" + expect_gap);

    if (real_gap - expect_gap > 0) {
        return _.union(_.rest(orders_type_1, i), _.rest(orders_type_2, j));
    } else {
        j = j + 1;
        if (j % orders_type_2.length == 0) {
            i = i + 1;
        }
        buildFirstOrders(orders_type_1, orders_type_2, i, j);
    }
}

function checkOrders(orders) {
    var currency1 = "XRP";
    var currency2 = first_order_currencies[cIndexSet[1]];

    if (currency1 != currency2) {
        checkOrdersForDiffCurrency(orders);
    }

    cIndexSet = cLoop.next(cIndexSet, first_offer_currency_size);
    goNext();
}


var cLoop = new Loop([0, 1]);
cLoop.allowSameIndex(false);

var cIndexSet = [0, 1];
var first_offer_currency_size = first_order_currencies.length;

function goNext() {
    if (!first_offer_currency_size) {
        return;
    }

    if (cLoop.isCycle()) {
        cLoop = new Loop([0, 1]);
        cLoop.allowSameIndex(false);
        cIndexSet = [0, 1];
        console.log("query done!!next round would be start in 5 seconds!");
        setTimeout(goNext, 1000 * 15);
        return;
    }

    var currency1 = "XRP";
    var currency2 = first_order_currencies[cIndexSet[1]];
    var cur1_issuers = first_order_allow_issuers[currency1];
    var cur2_issuers = first_order_allow_issuers[currency2];

    var req = {
        "cmd": "book",
        "params": {},
        "limit": 1,
        "filter": 1,
        "cache": 1
    }

    if (currency1 == currency2) {
        req.filter = 0;
    }

    req.params[currency1] = cur1_issuers;
    req.params[currency2] = cur2_issuers;

    console.log(currency1, currency2);

    wsbu.exeCmd(req, function(orders) {
        if (orders.length == 0 || orders.length == 1) {
            cIndexSet = cLoop.next(cIndexSet, first_offer_currency_size);
            goNext();
            return;
        } else {
            checkOrders(orders);
        }
    })
}

var account;
console.log("step1:getAccount!")
tfm.getAccount(config.marketMaker, function(result) {
    account = result.account;
    goNext();
});