var io = require('socket.io-client');
var pows = io.connect('http://localhost:3003/ws');

var math = require('mathjs');
var WebSocket = require('ws');
var _ = require('underscore');
var crypto = require('./crypto-util.js');
var jsbn = require('../src/js/jsbn/jsbn.js');

var events = require('events');
var emitter = new events.EventEmitter();
emitter.once('makeSameCurrencyProfit', makeSameCurrencyProfit);

var ripple = require('../src/js/ripple');
var Amount = ripple.Amount;

var rsjs = require('./remote-service.js');
var remote = rsjs.getRemote();

var tfmjs = require('./the-future-manager.js');
var tfm = new tfmjs.TheFutureManager();

var CmdUtil = require('./cmd-builder.js').CmdUtil;
var cmdU = new CmdUtil();

var AmountUtil = require('./amount-util.js').AmountUtil;
var au = new AmountUtil();

var CLogger = require('./log-util.js').CLogger;
var cLogger = new CLogger();

var WSBookUtil = require('./web-socket-book-util.js').WSBookUtil;
var wsbu = new WSBookUtil();

var FirstOrderUtil = require('./first-order-util.js').FirstOrderUtil;
var fou = new FirstOrderUtil();

var OfferService = require('./offer-service.js').OfferService;
var osjs = new OfferService();

var TrustLineService = require('./trust-line-service.js').TrustLineService;
var tls = new TrustLineService();

var config = require('./config.js');
var drops = config.drops;
var transfer_rates = config.transfer_rates;
var currency_allow_empty = config.currency_allow_empty;
var first_order_allow_volumns = config.first_order_allow_volumns;
var solved_too_small_volumn_currencies = config.solved_too_small_volumn_currencies;

var account;
var secret;
console.log("step1:getAccount!");
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


function listenProfitOrder() {
    console.log("step5:listen to profit socket!");
    pows.on('scp', function(order) {
        emitter.emit('makeSameCurrencyProfit', order);
    });
}

function buildCmd(order) {
    var pays_issuer = au.getIssuer(order.TakerPays);
    var pays_currency = au.getCurrency(order.TakerPays);
    var gets_issuer = au.getIssuer(order.TakerGets);
    var gets_currency = au.getCurrency(order.TakerGets);

    return cmdU.buildByIssuerNCurrency(pays_issuer, pays_currency, gets_issuer, gets_currency);
}

function makeSameCurrencyProfit(order) {
    var order_taker_pays = Amount.from_json(order.TakerPays);
    var order_taker_gets = Amount.from_json(order.TakerGets);

    order_taker_pays = order_taker_pays.product_human("1.0001");

    var order_pays_balance = tls.getBalance(au.getIssuer(order.TakerPays), au.getCurrency(order.TakerPays));
    var order_gets_capacity = tls.getCapacity(au.getIssuer(order.TakerGets), au.getCurrency(order.TakerGets));

    var min_taker_pays = au.minAmount([order_taker_pays, order_pays_balance]);
    var min_taker_gets = au.minAmount([order_taker_gets, order_gets_capacity]);

    if (au.isVolumnNotAllowed(min_taker_pays) || au.isVolumnNotAllowed(min_taker_gets)) {
        console.log("the volumn is too small to trade for same currency profit");
        emitter.once('makeSameCurrencyProfit', makeSameCurrencyProfit);
        return;
    }

    console.log(order_taker_pays.to_text_full(), "->", order_taker_gets.to_text_full());


    var cmd = buildCmd(order);

    osjs.createSCPOffer(order_taker_gets.to_json(), order_taker_pays.to_json(), cmd, null, function(status) {
        console.log("same currency tx:", status);
        emitter.once('makeSameCurrencyProfit', makeSameCurrencyProfit);
    });
}