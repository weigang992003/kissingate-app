var Logger = require('./new-logger.js').Logger;
var wsoLogger = new Logger('web-socket-offer');

var io = require('socket.io-client');
var wsio = io.connect('http://localhost:3003/ws');

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
var Amount = ripple.Amount;
var remote = rsjs.getRemote();

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

function remoteConnect() {
    console.log("step3:connect to remote!")
    remote.connect(function() {
        osjs = new OfferService(remote, account, secret);
        osjs.getOffers();

        tls = new TrustLineService(remote, account);
        tls.getLines();

        listenProfitOrder();

        remote.on('error', function(error) {
            throw new Error("remote error!");
        });

        remote.on('disconnect', function() {
            remoteConnect = false;
            remote = new ripple.Remote(rsjs.getRemoteOption());
            remoteConnect();
        });
    });
}

var processing = false;

function listenProfitOrder() {
    console.log("step5:listen to profit socket!");
    wsio.on('po', function(order1, order2) {
        console.log("new data arrived!");

        var needCreate = true;
        queryBookByOrder(remote, order1, function(nodiff) {
            if (!nodiff) needCreate = false;
        });

        queryBookByOrder(remote, order2, function(nodiff) {
            if (needCreate && nodiff) {
                wsoLogger.log(true, "Yes, we will create offer here!");
                createOffer(order1, order2);
            }
        });
    });
}

function createOffer(order1, order2) {
    var order1_taker_pays = Amount.from_json(order1.TakerPays);
    var order1_taker_gets = Amount.from_json(order1.TakerGets);
    var order2_taker_pays = Amount.from_json(order2.TakerPays);
    var order2_taker_gets = Amount.from_json(order2.TakerGets);
    //step 1 get account's balance by currency
    var order1_pays_balance = tls.getBalance(aujs.getIssuer(order1.TakerPays), aujs.getCurrency(order1.TakerPays));
    var order1_gets_balance = tls.getBalance(aujs.getIssuer(order1.TakerGets), aujs.getCurrency(order1.TakerGets));
    var order2_pays_balance = tls.getBalance(aujs.getIssuer(order2.TakerPays), aujs.getCurrency(order2.TakerPays));
    var order2_gets_balance = tls.getBalance(aujs.getIssuer(order2.TakerGets), aujs.getCurrency(order2.TakerGets));

    var min_taker_pays = minAmount([order1_taker_pays, order2_taker_gets, order1_pays_balance, order2_gets_balance]);
    var min_taker_gets = minAmount([order1_taker_gets, order2_taker_pays, order1_gets_balance, order2_pays_balance]);

    var times = min_taker_gets.ratio_human(order1_taker_gets).to_human().replace(',', '');
    times = math.round(times - 0, 6);
    if (min_taker_pays.compareTo(order1_taker_pays.product_human(times)) == 1) {
        order1_taker_gets = aujs.setValue(order1_taker_gets, min_taker_gets);
        order1_taker_pays = order1_taker_pays.product_human(times);

        times = min_taker_gets.ratio_human(order2_taker_pays).to_human().replace(',', '');
        times = math.round(times - 0, 6);
        order2_taker_pays = aujs.setValue(order2_taker_pays, min_taker_gets);
        order2_taker_gets = order2_taker_gets.product_human(times);
    } else {
        times = min_taker_pays.ratio_human(order1_taker_pays).to_human().replace(',', '');
        times = math.round(times - 0, 6);
        order1_taker_pays = aujs.setValue(order1_taker_pays, min_taker_pays);
        order1_taker_gets = order1_taker_gets.product_human(times);

        times = min_taker_pays.ratio_human(order2_taker_gets).to_human().replace(',', '');
        times = math.round(times - 0, 6);
        order2_taker_gets = aujs.setValue(order2_taker_gets, min_taker_pays);
        order2_taker_pays = order2_taker_pays.product_human(times);
    }

    order1_taker_pays = order1_taker_pays.product_human("1.00001");
    order2_taker_pays = order2_taker_pays.product_human("1.00001");

    console.log(order1_taker_pays.to_json(), order1_taker_gets.to_json());
    console.log("");
    console.log(order2_taker_pays.to_json(), order2_taker_gets.to_json());

    wsoLogger.log(true, order1_taker_pays.to_json(), order1_taker_gets.to_json(),
        order2_taker_pays.to_json(), order2_taker_gets.to_json());

    // osjs.createOffer(order1_taker_gets.to_json(), order1_taker_pays.to_json(), wsoLogger);
    // osjs.createOffer(order2_taker_gets.to_json(), order2_taker_pays.to_json(), wsoLogger);
}