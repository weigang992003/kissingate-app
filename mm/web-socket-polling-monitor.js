var io = require('socket.io').listen(3003);
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
var tfm = new tfmjs.TheFutureManager();

var Loop = require('./loop-util.js').Loop;
var ProfitUtil = require('./profit-util.js').ProfitUtil;
var AmountUtil = require('./amount-util.js').AmountUtil;
var OfferService = require('./offer-service.js').OfferService;
var WSBookUtil = require('./web-socket-book-util.js').WSBookUtil;
var TrustLineService = require('./trust-line-service.js').TrustLineService;

var au = new AmountUtil();
var wsbu = new WSBookUtil();

var tls;
var osjs;
var pu = new ProfitUtil();

var drops = config.drops;
var profit_rate = config.profitRate;
var transfer_rates = config.transfer_rates;
var profit_min_volumns = config.profit_min_volumns;
var same_currency_profit = config.same_currency_profit;
var same_currency_issuers = config.same_currency_issuers;
var first_order_currencies = config.first_order_currencies;
var first_order_allow_issuers = config.first_order_allow_issuers;

var noAvailablePair = [];

var firstOrders;
tfm.getFirstOrders(function(fos) {
    firstOrders = fos;
});


function checkOrdersForSameCurrency(orders) {
    var currency = currencies[cIndexSet[0]];
    var same_currency_allow = _.keys(same_currency_issuers);

    if (!_.contains(same_currency_allow, currency)) {
        return;
    }

    _.each(orders, function(order) {
        var expect_profit = pu.getProfitRate(order, profit_rate);
        console.log(currency + " real_profit:" + order.quality, order.TakerPays.issuer, order.TakerGets.issuer);
        if (order.quality - 0 < expect_profit) {
            wsio.emit('scp', order);
        }
    });
}

function checkOrdersForDiffCurrency(orders) {
    var currency1 = currencies[cIndexSet[0]];
    var currency2 = currencies[cIndexSet[1]];

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

    if (orders_type_1.length == 0 || orders_type_2.length == 0) {
        noAvailablePair.push(currency1 + currency2);
        noAvailablePair.push(currency2 + currency1);
        return;
    }

    orders_type_1 = _.sortBy(orders_type_1, function(order) {
        return order.quality;
    });

    orders_type_2 = _.sortBy(orders_type_2, function(order) {
        return order.quality;
    });

    orders_type_1.every(function(order_type_1) {
        orders_type_2.every(function(order_type_2) {
            if (isSameIssuers(order_type_1, order_type_2)) {
                return true;
            }

            var real_profit = order_type_1.quality * order_type_2.quality;
            console.log("real profit rate:", real_profit);

            var expect_profit = pu.getMultiProfitRate([order_type_1, order_type_2], profit_rate);
            console.log("expect profit rate:" + expect_profit);

            wsio.emit('dcp', [order_type_1, order_type_2], real_profit);
            if (real_profit < expect_profit) {}

            return real_profit < 1;
        });
    });
}

function checkOrders(orders) {
    var currency1 = currencies[cIndexSet[0]];
    var currency2 = currencies[cIndexSet[1]];

    if (currency1 == currency2) {
        checkOrdersForSameCurrency(orders);
    } else {
        checkOrdersForDiffCurrency(orders);
    }

    cIndexSet = cLoop.next(cIndexSet, currencySize);
    goNext();
}

function isSameIssuers(order1, order2) {
    return order1.TakerPays.issuer == order2.TakerGets.issuer && order1.TakerGets.issuer == order2.TakerPays.issuer;
}

var wsConnected = false;
var ws;

function connectWS(uri) {
    ws = new WebSocket(uri);
    ws.on('open', function() {
        wsConnected = true;
    });
    ws.on('message', function(data, flags) {
        var books = JSON.parse(data);
        var orders = _.flatten(books);
        if (orders.length == 0 || orders.length == 1) {
            cIndexSet = cLoop.next(cIndexSet, currencySize);
            goNext();
            return;
        } else {
            checkOrders(orders);
        }
    });
    ws.on('close', function() {
        wsConnected = false;
        ws.close();
    });
}

var remote;

function remoteConnect(env) {
    rsjs.getRemote(env, function(r) {
        console.log("start to connect ws!!!");

        remote = r;
        console.log("step3:connect to remote!");
        if (!remote) {
            console.log("we don't get remote object!");
            return;
        }

        remote.connect(function() {
            osjs = new OfferService(remote, account, secret);
            osjs.getOffers();

            tls = new TrustLineService(remote, account);
            tls.getLines(function(lines) {
                console.log("step4:prepare currencies!")
                prepareCurrencies(lines);

                console.log("step5:query find path!");
                goNext();
            });

            remote.on('error', function(error) {
                throw new Error("remote error!");
            });

            remote.on('disconnect', function() {
                remote = new ripple.Remote(rsjs.getRemoteOption());
                remoteConnect();
            });
        });
    });
}

function prepareCurrencies(lines) {
    lines = _.filter(lines, function(line) {
        return line.limit != 0;
    })
    currencies = _.pluck(lines, 'currency');
    currencies = _.uniq(currencies);
    currencies.push("XRP");
    currencySize = currencies.length;
    return currencies;
}

var cLoop = new Loop([0, 0]);
cLoop.allowSameIndex(true);

var cIndexSet = [0, 0];
var currencySize;
var currencies;

function goNext() {
    if (!currencySize) {
        return;
    }

    if (cLoop.isCycle()) {
        console.log("query done!");
        cLoop = new Loop([0, 0]);
        cLoop.allowSameIndex(true);
        cIndexSet = [0, 0];
        console.log("next round would be start in 5 seconds!");
        setTimeout(goNext, 1000 * 5);
        return;
    }

    var currency1 = currencies[cIndexSet[0]];
    var currency2 = currencies[cIndexSet[1]];
    var cur1_issuers = tls.getIssuers(currency1);
    var cur2_issuers = tls.getIssuers(currency2);

    if (_.contains(noAvailablePair, currency1 + currency2)) {
        cIndexSet = cLoop.next(cIndexSet, currencySize);
        goNext();
        return;
    }

    if (wsConnected) {
        var req = {
            "cmd": "book",
            "params": [],

        }

        var param = {
            "limit": 1,
            "filter": 1,
            "cache": 0
        }

        if (currency1 == currency2) {
            param.filter = 0;
        }

        param[currency1] = cur1_issuers;
        param[currency2] = cur2_issuers;

        req.params.push(param);

        console.log(currency1, currency2);

        ws.send(JSON.stringify(req));
    } else {
        console.log("WebSocket is broken!");
    }
}

var account;
var secret;
console.log("step1:getAccount!")
tfm.getAccount(config.marketMaker, function(result) {
    account = result.account;
    secret = result.secret;
    decrypt(secret);
});

function decrypt(encrypted) {
    console.log("step2:decrypt secret!")
    crypto.decrypt(encrypted, function(result) {
        secret = result;
        tfm.getEnv(function(result) {
            connectWS(result.wspm);
            remoteConnect(result.env);
        })
    });
}