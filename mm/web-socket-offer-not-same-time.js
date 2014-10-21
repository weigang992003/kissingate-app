var Logger = require('./new-logger.js').Logger;
var wsoLogger;
var wsoLogger = new Logger('web-socket-offer');

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
var currency_allow_empty = config.currency_allow_empty;
var first_order_allow_volumns = config.first_order_allow_volumns;
var solved_too_small_volumn_currencies = config.solved_too_small_volumn_currencies;
var currency_pair_allow_trade_not_in_same_ledger = config.currency_pair_allow_trade_not_in_same_ledger;

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

function firstOrderDecision(orders, key) {
    var oldOne = _.findWhere(firstOrderMap, {
        'key': key
    });

    firstOrderMap = _.without(firstOrderMap, oldOne);

    if (!oldOne) {
        firstOrderMap.push({
            'key': key,
            'orders': orders,
            'handled': false
        })
        return;
    }

    oldOne.orders = orders;
    if (!hasListenerForFirstOrder()) {
        console.log("we don't have listener for first order right now!");
        firstOrderMap.push(oldOne);
        return;
    }

    if (!oldOne.handled) {
        console.log("handle key:", oldOne.key);
        oldOne.handled = true;
        firstOrderMap.push(oldOne);
        emitter.emit('makeFirstOrderProfit', oldOne.orders, 0);
        return;
    }

    firstOrderMap.push(oldOne);

    var needHandle = _.findWhere(firstOrderMap, {
        'handled': false
    });

    if (needHandle) {
        console.log("handle key:", needHandle.key);
        firstOrderMap = _.without(firstOrderMap, needHandle);
        needHandle.handled = true;
        firstOrderMap.push(needHandle);
        emitter.emit('makeFirstOrderProfit', needHandle.orders, 0);
    } else {
        console.log("all are handled!! go next round!!");
        firstOrderMap = {};
    }
}

function listenProfitOrder() {
    console.log("step5:listen to profit socket!");
    pows.on('dcp', function(order1, order2, profit) {
        emitter.emit('makeProfit', order1, order2, profit);
    });

    pows.on('scp', function(order) {
        emitter.emit('makeSameCurrencyProfit', order);
    });

    fows.on('fos', function(orders, key) {
        firstOrderDecision(orders, key);
    });

    tows.on('top', function(orders, profit) {
        emitter.emit('makeTriCurrencyProfit', orders, profit);
    })
}

function hasListenerForFirstOrder() {
    return emitter.listeners('makeFirstOrderProfit').length > 0;
}

var firstOrderMap = [];

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

function makeProfit(order1, order2, profit) {
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

    if (!_.contains(currency_allow_empty, order1_taker_pays_currency) &&
        !_.contains(currency_allow_empty, order2_taker_pays_currency)) {
        console.log("we don't handle trade offer same time here!!!");
        emitter.once('makeProfit', makeProfit);
        return;
    }

    var trade_order1_first = true;

    var order1_taker_pays = Amount.from_json(order1.TakerPays);
    var order1_taker_gets = Amount.from_json(order1.TakerGets);
    var order2_taker_pays = Amount.from_json(order2.TakerPays);
    var order2_taker_gets = Amount.from_json(order2.TakerGets);

    var order1_pays_balance = tls.getBalance(order1_taker_pays_issuer, order1_taker_pays_currency);
    var order1_gets_capacity = tls.getCapacity(order1_taker_gets_issuer, order1_taker_gets_currency);
    var order2_pays_balance = tls.getBalance(order2_taker_pays_issuer, order2_taker_pays_currency);
    var order2_gets_capacity = tls.getCapacity(order2_taker_gets_issuer, order2_taker_gets_currency);

    var min_taker_pays;
    var min_taker_gets;
    if (_.contains(currency_allow_empty, order1_taker_pays_currency)) {
        trade_order1_first = false;
        min_taker_pays = au.minAmount([order1_taker_pays, order2_taker_gets, order2_gets_capacity]);
        min_taker_gets = au.minAmount([order1_taker_gets, order1_gets_capacity, order2_taker_pays, order2_pays_balance]);
    }
    if (_.contains(currency_allow_empty, order2_taker_pays_currency)) {
        trade_order1_first = true;
        min_taker_pays = au.minAmount([order1_taker_pays, order2_taker_gets, order2_gets_capacity, order1_pays_balance]);
        min_taker_gets = au.minAmount([order1_taker_gets, order1_gets_capacity, order2_taker_pays]);
    }

    if (au.isVolumnNotAllowed(min_taker_pays) || au.isVolumnNotAllowed(min_taker_gets)) {
        console.log("the volumn is too small to trade!!!");
        emitter.once('makeProfit', makeProfit);
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
            var orders_taker_pays = [];
            var orders_taker_gets = [];
            if (trade_order1_first) {
                orders_taker_pays.push(order1_taker_gets);
                orders_taker_pays.push(order2_taker_gets);

                orders_taker_gets.push(order1_taker_pays);
                orders_taker_gets.push(order2_taker_pays);
            } else {
                orders_taker_pays.push(order2_taker_gets);
                orders_taker_pays.push(order1_taker_gets);

                orders_taker_gets.push(order2_taker_pays);
                orders_taker_gets.push(order1_taker_pays);
            }
        } else {
            emitter.once('makeProfit', makeProfit);
        }
    });
}

function tradeOneByOne(orders_taker_pays, orders_taker_gets, i) {
    var length = orders_taker_pays.Logger;
    osjs.createOffer(orders_taker_pays[i].to_json(), orders_taker_gets[i].to_json(), wsoLogger, false, function(status) {
        console.log("tx" + i, status);
        tls.getLines(function() {
            if (length == i + 1) {
                console.log("re-listen profit order!!!");
                emitter.once('makeProfit', makeProfit);
            } else {
                tradeOneByOne(orders_taker_pays, orders_taker_gets, i++);
            }
        });
    });
}