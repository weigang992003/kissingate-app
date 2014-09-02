var Logger = require('./new-logger.js').Logger;
var wspmLogger = new Logger('web-socket-polling-monitor');

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
var tfm = require('./the-future-manager.js');
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

var Amount = ripple.Amount;

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
            order.quality = getPrice(order, pays_currency, gets_currency);
            orders_type_1.push(order);
        }

        if (gets_currency == currency2 && _.contains(cur2_issuers, gets_issuer) &&
            pays_currency == currency1 && _.contains(cur1_issuers, pays_issuer)) {
            order.quality = getPrice(order, pays_currency, gets_currency);
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
            if (isSameIssuers(order_type_1, order_type_2)) {
                return;
            }

            var profit = order_type_1.quality * order_type_2.quality;
            console.log(profit);
            if (profit < profit_rate) {
                wsio.emit('po', order_type_1, order_type_2);
                wsio.emit('pc', currency1, currency2);

                wspmLogger.log(true, order_type_1.TakerPays, order_type_1.TakerGets,
                    order_type_2.TakerPays, order_type_2.TakerGets,
                    "profit:" + profit, "price1:" + order_type_1.quality, "price2:" + order_type_2.quality);
            }
            return profit < 1;
        });
    });

    cIndexSet = cLoop.next(cIndexSet, currencySize);
    goNext();
}

function isSameIssuers(order1, order2) {
    return order1.TakerPays.issuer == order2.TakerGets.issuer && order1.TakerGets.issuer == order2.TakerPays.issuer;
}

function getPrice(order, pays_currency, gets_currency) {
    if (gets_currency == "XRP") {
        return math.round(order.quality * drops, 15) + "";
    } else if (pays_currency == "XRP") {
        return math.round(order.quality / drops, 15) + "";
    } else {
        return math.round(order.quality - 0, 15) + "";
    }
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
        console.log("next round would be start in 20 seconds!");
        setTimeout(goNext, 1000 * 20);
        return;
    }

    var currency1 = currencies[cIndexSet[0]];
    var currency2 = currencies[cIndexSet[1]];

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

setTimeout(throwDisconnectError, 1000 * 60 * 60);

function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}