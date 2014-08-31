var Logger = require('./new-logger.js').Logger;
var wspm = new Logger('web-socket-polling-monitor');

var io = require('socket.io').listen(3003);
var wsio = io.of('/ws');

var math = require('mathjs');
var WebSocket = require('ws');
var _ = require('underscore');
var config = require('./config.js');
var aujs = require('./amount-util.js');
var ripple = require('../src/js/ripple');
var crypto = require('./crypto-util.js');
var rsjs = require('./remote-service.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
var theFuture = require('./the-future-manager.js');
var rippleInfo = require('./ripple-info-manager.js');

var Loop = require('./loop-util.js').Loop;
var OfferService = require('./offer-service.js').OfferService;
var queryBookByOrder = require('./query-book.js').queryBookByOrder;
var TrustLineService = require('./trust-line-service.js').TrustLineService;

var minAmount = aujs.minAmount;
var getIssuer = aujs.getIssuer;
var getCurrency = aujs.getCurrency;

var tls;
var osjs;

var ws = new WebSocket('ws://localhost:7890');
var wsConnected = false;
ws.on('open', function() {
    wsConnected = true;
});
ws.on('message', function(data, flags) {
    console.log("data received!");
    var books = JSON.parse(data);
    var orders = _.flatten(books);
    checkOrders(orders);
});
ws.on('close', function() {
    wsConnected = false;
    ws.close();
});

var Amount = ripple.Amount;
var remote = new ripple.Remote(rsjs.getRemoteOption());

var drops = config.drops;
var profit_rate = config.profitRate;

function checkOrders(orders) {
    var currency1 = currencies[cIndexSet[0]];
    var currency2 = currencies[cIndexSet[1]];
    var cur1_issuers = tls.getIssuers(currency1);
    var cur2_issuers = tls.getIssuers(currency2);

    var orders_type_1 = [];
    var orders_type_2 = [];
    _.each(orders, function(order) {
        var gets_currency = getCurrency(order.TakerGets);
        var gets_issuer = getIssuer(order.TakerGets);
        var pays_currency = getCurrency(order.TakerPays);
        var pays_issuer = getIssuer(order.TakerPays);

        if (gets_currency == currency1 && _.contains(cur1_issuers, gets_issuer) &&
            pays_currency == currency2 && _.contains(cur2_issuers, pays_issuer)) {
            order.quality = math.round(order.quality - 0, 15) + "";
            orders_type_1.push(order);
        }

        if (gets_currency == currency2 && _.contains(cur2_issuers, gets_issuer) &&
            pays_currency == currency1 && _.contains(cur1_issuers, pays_issuer)) {
            order.quality = math.round(order.quality - 0, 15) + "";
            orders_type_2.push(order);
        }
    });

    orders_type_1 = _.sortBy(orders_type_1, function(order) {
        return order.quality;
    });

    if (orders_type_1.length == 0) {
        console.log("orders_type_1 is empty!");
    }

    orders_type_2 = _.sortBy(orders_type_2, function(order) {
        return order.quality;
    });

    if (orders_type_2.length == 0) {
        console.log("orders_type_2 is empty!");
    }

    orders_type_1.every(function(order_type_1) {
        orders_type_2.every(function(order_type_2) {
            var profit = order_type_1.quality * order_type_2.quality;
            console.log(profit);
            if (profit < 1) {
                wsio.emit('po', order_type_1, order_type_2);

                // var createOffer = true;
                // queryBookByOrder(remote, order_type_1, function(nodiff) {
                //     if (!nodiff) createOffer = false;
                // });

                // queryBookByOrder(remote, order_type_2, function(nodiff) {
                //     if (createOffer && nodiff) {
                //         wspm.log(true, "Yes, we will create offer here!");
                //     }
                // });

                wspm.log(true, order_type_1.TakerPays, order_type_1.TakerGets,
                    order_type_2.TakerPays, order_type_2.TakerGets,
                    "profit:" + profit, "price1:" + order_type_1.quality, "price2:" + order_type_2.quality);
            }
            return profit < 1;
        });
    });

    cIndexSet = cLoop.next(cIndexSet, currencySize);
    goNext();
}

function remoteConnect() {
    console.log("step3:connect to remote!")
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

var cLoop = new Loop([1, 0]);
var cIndexSet = [1, 0];
var currencySize;
var currencies;

function goNext() {
    if (!currencySize) {
        return;
    }

    if (cLoop.isCycle()) {
        console.log("query done!");
        cLoop = new Loop([1, 0]);
        cIndexSet = [1, 0];
        console.log("next round would be start in 10 seconds!");
        setTimeout(goNext, 1000 * 30);
        return;
    }

    var currency1 = currencies[cIndexSet[0]];
    var currency2 = currencies[cIndexSet[1]];

    console.log(currency1 + ":" + currency2);

    if (wsConnected) {
        var req = {
            "src_currency": currency1,
            "dst_currency": currency2,
            "limit": 1
        }

        console.log(req);

        ws.send(JSON.stringify(req));
    } else {
        console.log("WebSocket is broken!");
    }
}

var account;
var secret;
console.log("step1:getAccount!")
theFuture.getAccount(config.marketMaker, function(result) {
    account = result.account;
    secret = result.secret;
    decrypt(secret);
});

function decrypt(encrypted) {
    console.log("step2:decrypt secret!")
    crypto.decrypt(encrypted, function(result) {
        secret = result;
        remoteConnect();
    });
}