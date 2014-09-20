var io = require('socket.io').listen(3007);
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

var Loop = require('./new-loop-util.js').Loop;
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
var transfer_rates = config.transfer_rates;
var profit_min_volumns = config.profit_min_volumns;
var same_currency_profit = config.same_currency_profit;
var same_currency_issuers = config.same_currency_issuers;
var first_order_currencies = config.first_order_currencies;
var first_order_allow_issuers = config.first_order_allow_issuers;

var noAvailablePair = [];

function checkOrdersForDiffCurrency(orders) {
    console.log("we get orders:" + orders.length);
    var cIndexSet = cLoop.curIndexSet();
    var currency1 = currencies[cIndexSet[0]];
    var currency2 = currencies[cIndexSet[1]];
    var currency3 = currencies[cIndexSet[2]];

    var orders_paths = [];
    _.each(_.range(6), function(i) {
        orders_paths.push([]);
    });

    _.each(orders, function(order) {
        var gets_currency = au.getCurrency(order.TakerGets);
        var gets_issuer = au.getIssuer(order.TakerGets);
        var pays_currency = au.getCurrency(order.TakerPays);
        var pays_issuer = au.getIssuer(order.TakerPays);

        if (gets_currency == currency1 && pays_currency == currency2) {
            order.quality = au.getPrice(order, pays_currency, gets_currency);
            orders_paths[0].push(order);
        }

        if (gets_currency == currency2 && pays_currency == currency3) {
            order.quality = au.getPrice(order, pays_currency, gets_currency);
            orders_paths[1].push(order);
        }

        if (gets_currency == currency3 && pays_currency == currency1) {
            order.quality = au.getPrice(order, pays_currency, gets_currency);
            orders_paths[2].push(order);
        }


        if (gets_currency == currency2 && pays_currency == currency1) {
            order.quality = au.getPrice(order, pays_currency, gets_currency);
            orders_paths[3].push(order);
        }

        if (gets_currency == currency1 && pays_currency == currency3) {
            order.quality = au.getPrice(order, pays_currency, gets_currency);
            orders_paths[4].push(order);
        }


        if (gets_currency == currency3 && pays_currency == currency2) {
            order.quality = au.getPrice(order, pays_currency, gets_currency);
            orders_paths[5].push(order);
        }
    });

    var sort_orders_paths = [];
    _.each(orders_paths, function(orders_path) {
        sort_orders_paths.push(_.sortBy(orders_path, function(order) {
            return order.quality;
        }));
    });

    checkPathProfit(_.initial(sort_orders_paths, 3));
    checkPathProfit(_.last(sort_orders_paths, 3));
}

function checkPathProfit(orders_paths) {
    var needCheck = true;
    _.each(orders_paths, function(path_orders) {
        if (path_orders.length == 0) {
            needCheck = false;
        }
    });

    if (needCheck) {
        orders_paths[0].every(function(order_path_1) {
            orders_paths[1].every(function(order_path_2) {
                orders_paths[2].every(function(order_path_3) {
                    checkOrderProfit(order_path_1, order_path_2, order_path_3);
                });
            });
        });
    }
}


function checkOrderProfit(order1, order2, order3) {
    var real_profit = order1.quality * order2.quality * order3.quality;
    console.log("real profit rate:", real_profit);
    var expect_profit = pu.getMultiProfitRate([order1, order2, order3], profit_rate);
    console.log("expect profit rate:" + expect_profit);
}

function checkOrders(orders) {
    checkOrdersForDiffCurrency(orders);
    cLoop.next();
    goNext();
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
    cLoop = new Loop([0, 1, 2], currencySize, false);
    return currencies;
}

var cLoop;

function goNext() {
    if (!currencySize) {
        return;
    }

    if (cLoop.isCycle()) {
        console.log("query done!");
        cLoop = new Loop([0, 1, 2], currencySize, false);
        console.log("next round would be start in 5 seconds!");
        setTimeout(goNext, 1000 * 5);
        return;
    }

    var cIndexSet = cLoop.curIndexSet();

    var currency1 = currencies[cIndexSet[0]];
    var currency2 = currencies[cIndexSet[1]];
    var currency3 = currencies[cIndexSet[2]];

    if (currency1 == currency2 && currency2 == currency3 && currency3 == currency1) {
        cLoop.next();
        goNext();
        return;
    }

    if (_.contains(noAvailablePair, currency1 + currency2 + currency3)) {
        cLoop.next();
        goNext();
        return;
    }

    if (wsConnected) {
        var req = {
            "cmd": "book",
            "params": [],
            "limit": 1,
            "filter": 1,
            "cache": 1
        }

        var pairs = getCurrencyPair([currency1, currency2, currency3]);
        console.log(pairs);
        _.each(pairs, function(pair) {
            req.params.push(buildParams[pair[0], pair[1]]);
        });
        console.log(req);


        console.log(currency1, currency2, currency3);

        ws.send(JSON.stringify(req));
    } else {
        console.log("WebSocket is broken!");
    }
}

function getCurrencyPair(currencyList) {
    var currencyMap = {};

    _.each(currencyList, function(currency) {
        var count = currencyMap[currency];
        if (!count) {
            currencyMap[currency] = 1;
        } else {
            currencyMap[currency] = count + 1;
        }
    });

    var currencySet = _.uniq(currencyList);

    return buildPair(currencySet, currencyMap);
}

function buildPair(currencySet, currencyMap) {
    var pairs = [];
    if (currencySet.length <= 1) {
        return pairs;
    }

    while (currencySet.length > 2) {
        var first = currencySet[0];
        _.each(currencySet, function(currency) {
            if (first == currency) {
                var count = currencyMap[currency];
                if (count > 1) {
                    pairs.push([first, currency]);
                }
            } else {
                pairs.push([first, currency]);
            }
        });

        currencySet = _.rest(currencySet);
    }

    return pairs;
}

function buildParams(currency1, currency2) {
    var params = {
        filter: 1,
        cache: 1,
        limit: 1
    };
    params[currency1] = tls.getIssuers(currency1);
    params[currency2] = tls.getIssuers(currency2);
    if (currency1 == currency2) {
        params.filter = 0;
    }
    return params;
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
            connectWS(result.wspm);
            remoteConnect(result.env);
        })
    });
}

setTimeout(throwDisconnectError, 1000 * 60 * 30);

function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}