var Logger = require('./new-logger.js').Logger;
var fpLogger = new Logger('find-path-polling-monitor');
var latLogger = new Logger('listen-account-tx');
var qbLogger = new Logger('query-book');

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
var queryBook = require('./query-book.js').queryBook;
var theFuture = require('./the-future-manager.js');
var rippleInfo = require('./ripple-info-manager.js');
var PathFind = require('../src/js/ripple/pathfind.js').PathFind;
var TrustLineService = require('./trust-line-service.js').TrustLineService;
var tls;

var Loop = require('./loop-util.js');
var osjs = require('./offer-service.js');
var minAmount = require('./amount-util.js').minAmount;

var ws = new WebSocket('ws://localhost:7890');
var wsConnected = false;
ws.on('open', function() {
    wsConnected = true;
});
ws.on('message', function(data, flags) {
    var books = JSON.parse(data);
    var orders = _.flatten(books);

    var currency1 = currencies[cIndexSet[0]];
    var currency2 = currencies[cIndexSet[1]];
    var cur1_issuers = tls.getIssuers(currency1);
    var cur2_issuers = tls.getIssuers(currency2);


    var orders_type_1 = [];
    var orders_type_2 = [];
    orders = _.each(orders, function(order) {
        var gets_currency = getCurrency(order.TakerGets);
        var gets_issuer = getIssuer(order.TakerGets);
        var pays_currency = getCurrency(order.TakerPays);
        var pays_issuer = getIssuer(order.TakerPays);

        if (gets_currency == currency1 && _.contains(cur1_issuers, gets_issuer) &&
            pays_currency == currency2 && _.contains(cur2_issuers, pays_issuer)) {
            order.price = math.round(order.price - 0, 6);
            orders_type_1.push(order);
        }

        if (gets_currency == currency2 && _.contains(cur2_issuers, gets_issuer) &&
            pays_currency == currency1 && _.contains(cur1_issuers, pays_issuer)) {
            order.price = math.round(order.price - 0, 6);
            orders_type_2.push(order);
        }
    });

    orders_type_1 = _.sortBy(orders_type_1, function(order) {
        return order.price;
    })

    orders_type_2 = _.sortBy(orders_type_2, function(order) {
        return order.price;
    });

    _.each(orders_type_1, function(order_type_1) {
        _.each(orders_type_2, function(order_type_2) {
            var profit = order_type_1.price * order_type_2.price;
            if (order_type_1.price * order_type_2.price < 1) {
                console.log(getCurrency(order_type_1.TakerGets), getCurrency(order_type_2.TakerGets), "profit:" + profit);
            }
        })
    });

    cLoop.next();
    goNext();
});

function getIssuer(pays_or_gets) {
    return typeof pays_or_gets == "string" ? "rrrrrrrrrrrrrrrrrrrrrhoLvTp" : pays_or_gets.issuer;
}

function getCurrency(pays_or_gets) {
    return typeof pays_or_gets == "string" ? "XRP" : pays_or_gets.currency;
}


ws.on('close', function() {
    wsConnected = false;
    ws.close();
});

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

var Amount = ripple.Amount;



var remote = new ripple.Remote(getRemoteOption());

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
    return servers[(new Date().getTime()) % servers.length];
}

function prepareCurrencies(lines) {
    currencies = _.pluck(lines, 'currency');
    currencies = _.uniq(currencies);
    currencies.push("XRP");
    currencySize = currencies.length;
    return currencies;
}

var profit_rate = config.profitRate;


var cLoop = new Loop([1, 0]);
var cIndexSet = [1, 0];
var currencySize;
var currencies;

function goNext() {
    if (!currencySize) {
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

        ws.send(JSON.stringify(req));
    } else {
        console.log("WebSocket is broken!");
    }
}

function remoteConnect() {
    console.log("step3:connect to remote!")
    remote.connect(function() {
        osjs.create(remote, account);
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
            remote = new ripple.Remote(getRemoteOption());
            remoteConnect();
        });

        listenAccountTx();
    });
}

var account;
console.log("step1:getAccount!")
theFuture.getAccount(config.marketMaker, function(result) {
    account = result.account;
    remoteConnect();
});