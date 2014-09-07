var Logger = require('./new-logger.js').Logger;
var wsoLogger;
var wsoLogger = new Logger('web-socket-offer');

var io = require('socket.io-client');
var wsio = io.connect('http://localhost:3003/ws');

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
var AmountUtil = require('./amount-util.js').AmountUtil;
var OfferService = require('./offer-service.js').OfferService;
var queryBookByOrder = require('./query-book.js').queryBookByOrder;
var FirstOrderUtil = require('./first-order-util.js').FirstOrderUtil;
var AccountListener = require('./listen-account-util.js').AccountListener;
var TrustLineService = require('./trust-line-service.js').TrustLineService;

var au = new AmountUtil();
var fou = new FirstOrderUtil();
var tfm = new tfmjs.TheFutureManager();

var tls;
var osjs;
var Amount = ripple.Amount;
var remote = rsjs.getRemote();

var transfer_rates = config.transfer_rates;

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

function listenProfitOrder() {
    console.log("step5:listen to profit socket!");
    wsio.on('dcp', function(order1, order2) {
        emitter.emit('makeProfit', order1, order2);
    });

    wsio.on('scp', function(order) {
        console.log(order);
        emitter.emit('makeSameCurrencyProfit', order);
    });

    wsio.on('fos', function(order) {});
}

function makeFirstOrder(order) {
    if (fou.canCreate(order)) {
        var removeOld = true;
        osjs.createFirstOffer(order.TakerPays, order.TakerGets, removeOld, wsoLogger, function() {

        });
    }
}

function makeSameCurrencyProfit(order) {
    var order_taker_pays = Amount.from_json(order.TakerPays);
    var order_taker_gets = Amount.from_json(order.TakerGets);

    order_taker_pays = order_taker_pays.product_human("1.0001");

    if (osjs.ifOfferExist(order_taker_gets.to_json(), order_taker_pays.to_json())) {
        emitter.once('makeSameCurrencyProfit', makeSameCurrencyProfit);
        return;
    }

    osjs.createOffer(order_taker_gets.to_json(), order_taker_pays.to_json(), wsoLogger, false, function(status) {
        console.log("same currency tx:", status);
        wsoLogger.log(true, "same currency tx", status, order_taker_gets.to_json(), order_taker_pays.to_json());
        emitter.once('makeSameCurrencyProfit', makeSameCurrencyProfit);
    });
}

var emitter = new events.EventEmitter();
emitter.once('makeProfit', makeProfit);
emitter.once('makeSameCurrencyProfit', makeSameCurrencyProfit);

function makeProfit(order1, order2) {
    console.log("new data arrived!", order1, order2);

    var order1_taker_pays = Amount.from_json(order1.TakerPays);
    var order1_taker_gets = Amount.from_json(order1.TakerGets);
    var order2_taker_pays = Amount.from_json(order2.TakerPays);
    var order2_taker_gets = Amount.from_json(order2.TakerGets);

    var order1_pays_balance = tls.getBalance(au.getIssuer(order1.TakerPays), au.getCurrency(order1.TakerPays));
    var order1_gets_capacity = tls.getCapacity(au.getIssuer(order1.TakerGets), au.getCurrency(order1.TakerGets));
    var order2_pays_balance = tls.getBalance(au.getIssuer(order2.TakerPays), au.getCurrency(order2.TakerPays));
    var order2_gets_capacity = tls.getCapacity(au.getIssuer(order2.TakerGets), au.getCurrency(order2.TakerGets));

    var min_taker_pays = au.minAmount([order1_taker_pays, order2_taker_gets, order2_gets_capacity, order1_pays_balance]);
    var min_taker_gets = au.minAmount([order1_taker_gets, order1_gets_capacity, order2_taker_pays, order2_pays_balance]);

    if (!au.isVolumnAllowed(min_taker_pays) || !au.isVolumnAllowed(min_taker_gets)) {
        console.log("the volumn is too small to trade", min_taker_gets.to_json(), min_taker_pays.to_json());
        emitter.once('makeProfit', makeProfit);
        return;
    }

    if (min_taker_gets.is_zero() || min_taker_pays.is_zero()) {
        console.log("lack of currency balance:", min_taker_gets.to_json(), min_taker_pays.to_json());
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

    var reserved = true;
    if (osjs.atLeastExistOne([order1, order2], reserved)) {
        console.log("same order already exist!!");
        emitter.once('makeProfit', makeProfit);
        return;
    }

    //TODO will remove when atLeastExistOne method works.
    if (osjs.ifOfferExist(order1_taker_gets.to_json(), order1_taker_pays.to_json()) ||
        osjs.ifOfferExist(order2_taker_gets.to_json(), order2_taker_pays.to_json())) {
        console.log("same order already exist!!!");
        emitter.once('makeProfit', makeProfit);
        return;
    }

    osjs.createOffer(order1_taker_gets.to_json(), order1_taker_pays.to_json(), wsoLogger, false, function(status) {
        console.log("tx1", status);
        wsoLogger.log(true, "tx1", status, order1_taker_gets.to_json(), order1_taker_pays.to_json());
    });
    osjs.createOffer(order2_taker_gets.to_json(), order2_taker_pays.to_json(), wsoLogger, false, function(status) {
        console.log("tx2", status);
        wsoLogger.log(true, "tx2", status, order2_taker_gets.to_json(), order2_taker_pays.to_json());

        tls.getLines(function() {
            console.log("re-listen profit order!!!");
            emitter.once('makeProfit', makeProfit);
        })
    });
}

// setInterval(checkIfHasListener, 1000 * 30);

// function checkIfHasListener() {
//     if (emitter.listeners('makeProfit').length == 0) {
//         emitter.once('makeProfit', makeProfit);
//     }
//     if (emitter.listeners('makeSameCurrencyProfit').length == 0) {
//         emitter.once('makeSameCurrencyProfit', makeSameCurrencyProfit);
//     }
// }

setTimeout(prepareRestart, 1000 * 60 * 10);

function prepareRestart() {
    emitter.removeAllListeners('makeProfit');
    emitter.removeAllListeners('makeSameCurrencyProfit');
    setTimeout(throwDisconnectError, 1000 * 30);
}

function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}