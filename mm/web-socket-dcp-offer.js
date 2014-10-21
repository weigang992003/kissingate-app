var io = require('socket.io-client');
var pows = io.connect('http://localhost:3003/ws');
var fows = io.connect('http://localhost:3006/ws');
var tows = io.connect('http://localhost:3007/ws');

var math = require('mathjs');
var WebSocket = require('ws');
var _ = require('underscore');
var crypto = require('./crypto-util.js');
var jsbn = require('../src/js/jsbn/jsbn.js');

var events = require('events');
var emitter = new events.EventEmitter();

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


function listenProfitOrder() {
    console.log("step5:listen to profit socket!");
    pows.on('dcp', function(orders, profit) {
        emitter.emit('makeMultiCurrencyProfit', orders, profit);
    });
    tows.on('top', function(orders, profit) {
        emitter.emit('makeMultiCurrencyProfit', orders, profit);
    })
}

emitter.once('makeMultiCurrencyProfit', makeMultiCurrencyProfit);

function makeMultiCurrencyProfit(orders, profit) {
    console.log(orders);
    profit = math.round(profit, 6);
    console.log("tri data arrived! profit:", profit);
    var tradeSameTime = true;

    var taker_pays_amounts = [];
    var taker_gets_amounts = [];
    var taker_pays_balances = [];
    var taker_gets_capacities = [];
    var length = orders.length;

    _.each(_.range(orders.length), function(i) {
        cLogger.logOrder(orders[i]);
    });

    for (var i = 0; i < orders.length; i++) {
        var order = orders[i];
        var taker_pays_amount = Amount.from_json(order.TakerPays);
        var taker_gets_amount = Amount.from_json(order.TakerGets);
        var taker_pays_balance = tls.getBalance(au.getIssuer(order.TakerPays), au.getCurrency(order.TakerPays));
        var taker_gets_capacity = tls.getCapacity(au.getIssuer(order.TakerGets), au.getCurrency(order.TakerGets));

        if (_.contains(currency_allow_empty, au.getCurrency(order.TakerPays))) {
            taker_pays_balance = taker_pays_amount;
            tradeSameTime = false;
        }

        if (au.isVolumnNotAllowed(taker_pays_amount) || au.isVolumnNotAllowed(taker_gets_amount) ||
            au.isVolumnNotAllowed(taker_pays_balance) || au.isVolumnNotAllowed(taker_gets_capacity)) {
            console.log("the volumn is too small to trade for multi!!!");
            emitter.once('makeMultiCurrencyProfit', makeMultiCurrencyProfit);
            return;
        }

        var min_taker_pays = au.minAmount([taker_pays_amount, taker_pays_balance]);
        var min_taker_gets = au.minAmount([taker_gets_amount, taker_gets_capacity]);

        var new_taker_pays_amount = au.zoom(taker_gets_amount, min_taker_gets, taker_pays_amount);
        var new_taker_gets_amount = au.zoom(taker_pays_amount, min_taker_pays, taker_gets_amount);
        if (min_taker_pays.compareTo(new_taker_pays_amount) == 1) {
            taker_gets_amount = au.setValue(taker_gets_amount, min_taker_gets);
            taker_pays_amount = au.setValue(taker_pays_amount, new_taker_pays_amount);
        } else {
            taker_pays_amount = au.setValue(taker_pays_amount, min_taker_pays);
            taker_gets_amount = au.setValue(taker_gets_amount, new_taker_gets_amount);
        }

        taker_pays_amounts.push(taker_pays_amount);
        taker_gets_amounts.push(taker_gets_amount);
    };


    //we pick one currency we want to make profit.
    //it means that we invest the money as much as taker_pays_amount.
    //final_taker_gets_amount means how much money we can get back if we put taker_pays_amount into market.
    //taker_gets_amount means that how much money the market has.
    //if final_taker_gets_amount bigger than taker_gets_amount. we need to reduce our invest.
    //we cal how much moneny we need to invest, that's the start_taker_pays_amount means.
    var taker_pays_amount = taker_pays_amounts[0];
    var final_taker_gets_amount = au.zoomByTimes(taker_pays_amount, 1 / profit);
    var where = findTakerGetsWhere(taker_gets_amounts, taker_pays_amount);
    var taker_gets_amount = taker_gets_amounts[where];
    if (final_taker_gets_amount.compareTo(taker_gets_amount) == 1) {
        var start_taker_pays_amount = taker_gets_amount.product_human(profit);
        taker_pays_amounts[0] = au.setValue(taker_pays_amount, start_taker_pays_amount);
        taker_gets_amounts[0] = au.zoom(taker_pays_amount, start_taker_pays_amount, taker_gets_amounts[0]);
    }

    //we build the order based on start_taker_pays_amount. cal the result for each stop to final profit
    for (var i = 0, j = 0; j < length - 1; j++) {
        var pre_taker_gets_amount = taker_gets_amounts[i];

        var next_i = findTakerPaysWhere(taker_pays_amounts, pre_taker_gets_amount);
        var next_taker_pays_amount = taker_pays_amounts[next_i];
        var next_taker_gets_amount = taker_gets_amounts[next_i];

        taker_pays_amounts[next_i] = au.setValue(next_taker_pays_amount, pre_taker_gets_amount);
        taker_gets_amounts[next_i] = au.zoom(next_taker_pays_amount, pre_taker_gets_amount, next_taker_gets_amount);
        i = next_i;
    };

    var pays_list_in_order = [];
    var gets_list_in_order = [];
    for (var i = 0, j = 0; j < length; j++) {
        pays_list_in_order.push(taker_pays_amounts[i]);
        gets_list_in_order.push(taker_gets_amounts[i]);
        i = findTakerPaysWhere(taker_pays_amounts, taker_gets_amounts[i]);
    }

    var cmds = [];
    var exchanges = {};
    _.each(_.range(length), function(i) {
        cmds.push(cmdU.buildByAmount(pays_list_in_order[i], gets_list_in_order[i]));
        exchanges[i + ""] = pays_list_in_order[i].to_text_full() + "->" + gets_list_in_order[i].to_text_full();
        console.log(pays_list_in_order[i].to_text_full(), "->", gets_list_in_order[i].to_text_full());
    });

    // wsdoLogger.log(true, exchanges);

    osjs.canCreateDCPOffers(cmds, 0, function(canCreate) {
        if (canCreate) {
            if (tradeSameTime) {
                // tradeTogether(gets_list_in_order, pays_list_in_order);
            } else {
                // tradeOneByOne(gets_list_in_order, pays_list_in_order, 0);
            }
            //TODO need to remove this line after test done!!!
            emitter.once('makeMultiCurrencyProfit', makeMultiCurrencyProfit);
        } else {
            emitter.once('makeMultiCurrencyProfit', makeMultiCurrencyProfit);
        }
    });
}

function tradeTogether(orders_taker_pays, orders_taker_gets) {
    var length = orders_taker_pays.length;
    _.each(_.range(length), function(i) {
        var taker_pays_json = taker_pays_amounts[i].to_json();
        var taker_gets_json = taker_pays_amounts[i].to_json();
        osjs.createOffer(taker_pays_json, taker_gets_json, null, false, function(status) {
            console.log("tx", status);
            if (i == length - 1) {
                tls.getLines(function() {
                    console.log("re-listen tri profit order!!!");
                    emitter.once('makeMultiCurrencyProfit', makeMultiCurrencyProfit);
                })
            }
        });
    });
}

function tradeOneByOne(orders_taker_pays, orders_taker_gets, i) {
    var length = orders_taker_pays.length;
    var taker_pays_json = taker_pays_amounts[i].to_json();
    var taker_gets_json = taker_pays_amounts[i].to_json();
    osjs.createOffer(taker_pays_json, taker_gets_json, null, false, function(status) {
        console.log("tx" + i, status);
        tls.getLines(function() {
            if (length == i + 1) {
                console.log("re-listen profit order!!!");
                emitter.once('makeMultiCurrencyProfit', makeMultiCurrencyProfit);
            } else {
                tradeOneByOne(orders_taker_pays, orders_taker_gets, i++);
            }
        });
    });
}

function findTakerPaysWhere(taker_pays_amounts, taker_gets_amount) {
    for (var i = 0; i < taker_pays_amounts.length; i++) {
        if (taker_pays_amounts[i].currency().to_json() == taker_gets_amount.currency().to_json()) {
            return i;
        }
    };
}

function findTakerGetsWhere(taker_gets_amounts, taker_pays_amount) {
    for (var i = 0; i < taker_gets_amounts.length; i++) {
        if (taker_gets_amounts[i].currency().to_json() == taker_pays_amount.currency().to_json()) {
            return i;
        }
    };
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