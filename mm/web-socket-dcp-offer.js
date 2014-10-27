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
    profit = math.round(profit, 6);
    console.log("tri data arrived! profit:", profit);

    var onlyCurrency = true;

    var taker_pays_amounts = [];
    var taker_gets_amounts = [];
    var taker_pays_balances = [];
    var taker_gets_capacities = [];

    var pays_list_from_balance = [];
    var gets_list_from_balance = [];
    var pays_list_from_offer = [];
    var gets_list_from_offer = [];
    var length = orders.length;

    //we need all gets because we want to check if we get pays from offer, does the currency we got has same issuer.
    var takerGetsJsonList = [];
    _.each(_.range(orders.length), function(i) {
        cLogger.logOrder(orders[i]);
        takerGetsJsonList.push(orders[i].TakerGets);
    });

    for (var i = 0; i < orders.length; i++) {
        var order = orders[i];
        var taker_pays_amount = Amount.from_json(order.TakerPays);
        var taker_gets_amount = Amount.from_json(order.TakerGets);
        var taker_pays_balance = tls.getBalance(au.getIssuer(order.TakerPays), au.getCurrency(order.TakerPays));
        var taker_gets_capacity = tls.getCapacity(au.getIssuer(order.TakerGets), au.getCurrency(order.TakerGets));

        //normally pays comes from balance, but if someday we lack of this type currency, we may get it from profit offer.
        var pays_from_balance = true;
        if (au.isVolumnNotAllowed(taker_pays_balance) && au.isVolumnAllowed(taker_pays_amount)) {
            if (au.findAmountJsonWhere(takerGetsJsonList, order.TakerPays) != -1) {
                pays_from_balance = false;
                taker_pays_balance = taker_pays_amount;
            }
        }

        if (au.isVolumnNotAllowed(taker_pays_amount) || au.isVolumnNotAllowed(taker_gets_amount) ||
            au.isVolumnNotAllowed(taker_pays_balance) || au.isVolumnNotAllowed(taker_gets_capacity)) {
            console.log("the volumn is too small to trade for multi!!!");
            emitter.once('makeMultiCurrencyProfit', makeMultiCurrencyProfit);
            return;
        }

        var min_taker_pays = au.minAmount([taker_pays_amount, taker_pays_balance]);
        var min_taker_gets = au.minAmount([taker_gets_amount, taker_gets_capacity]);

        //this step help us to decide if we start from gets or pays.
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

        if (pays_from_balance) {
            pays_list_from_balance.push(taker_pays_amount);
        } else {
            pays_list_from_offer.push(taker_pays_amount);
        }
    };

    if (pays_list_from_balance.length == 0) {
        emitter.once('makeMultiCurrencyProfit', makeMultiCurrencyProfit);
        return;
    }

    //we pick one currency we want to make profit.
    //it means that we invest the money as much as taker_pays_amount.
    //final_taker_gets_amount means how much money we can get back if we put taker_pays_amount into market.
    //taker_gets_amount means that how much money the market has.
    //if final_taker_gets_amount bigger than taker_gets_amount. we need to reduce our invest.
    //we cal how much moneny we need to invest, that's the start_taker_pays_amount means.
    var taker_pays_amount = pays_list_from_balance[0];
    var start_where = au.findAmountWhere(taker_pays_amounts, taker_pays_amount, onlyCurrency);
    var final_taker_gets_amount = au.zoomByTimes(taker_pays_amount, 1 / profit);

    //need enhance this when include more than one pays or gets with same currency. 
    var where = au.findAmountWhere(taker_gets_amounts, taker_pays_amount, onlyCurrency);
    var taker_gets_amount = taker_gets_amounts[where];
    if (final_taker_gets_amount.compareTo(taker_gets_amount) == 1) {
        var start_taker_pays_amount = taker_gets_amount.product_human(profit);
        taker_pays_amounts[start_where] = au.setValue(taker_pays_amount, start_taker_pays_amount);
        taker_gets_amounts[start_where] = au.zoom(taker_pays_amount, start_taker_pays_amount, taker_gets_amounts[0]);
    }

    //we build the order based on start_taker_pays_amount. cal the result for each stop to final profit
    //we adjust pays and gets of each step to make sure only start step and final step is different.
    //here we build taker_pays_amounts and taker_gets_amounts
    for (var i = start_where, j = 0; j < length - 1; j++) {
        var pre_taker_gets_amount = taker_gets_amounts[i];

        var next_i = au.findAmountWhere(taker_pays_amounts, pre_taker_gets_amount, onlyCurrency);
        var next_taker_pays_amount = taker_pays_amounts[next_i];
        var next_taker_gets_amount = taker_gets_amounts[next_i];

        taker_pays_amounts[next_i] = au.setValue(next_taker_pays_amount, pre_taker_gets_amount);
        taker_gets_amounts[next_i] = au.zoom(next_taker_pays_amount, pre_taker_gets_amount, next_taker_gets_amount);
        i = next_i;
    };

    var pays_list_in_order = [];
    var gets_list_in_order = [];
    if (pays_list_from_balance.length < length) {
        for (var i = 0; i < pays_list_from_balance.length; i++) {
            var where = au.findAmountWhere(taker_pays_amounts, pays_list_from_balance[i]);
            pays_list_from_balance[i] = taker_pays_amounts[where];
            gets_list_from_balance[i] = taker_gets_amounts[where];
        }

        pays_list_in_order.push(pays_list_from_balance);
        gets_list_in_order.push(gets_list_from_balance);

        var pays_from_offer_size = pays_list_from_offer.length;
        var pre_step_gets_list = gets_list_from_balance;
        while (pays_from_offer_size > 0) {
            var cur_step_pays_list = [];
            var cur_step_gets_list = [];
            var left_pays_list = [];

            for (var i = 0; i < pays_from_offer_size; i++) {
                if (au.findAmountWhere(pre_step_gets_list, pays_list_from_offer[i]) == -1) {
                    left_pays_list.push(pays_list_from_offer[i]);
                } else {
                    var where = au.findAmountWhere(taker_pays_amounts, pays_list_from_offer[i]);
                    cur_step_pays_list.push(taker_pays_amounts[where]);
                    cur_step_gets_list.push(taker_gets_amounts[where]);
                }
            }

            //this mean we can't get pays from previous offer's gets
            if (cur_step_pays_list.length == 0) {
                for (var i = 0; i < left_pays_list.length; i++) {
                    var where = au.findAmountWhere(taker_pays_amounts, pays_list_from_offer[i]);
                    cur_step_pays_list.push(taker_pays_amounts[where]);
                    cur_step_gets_list.push(taker_gets_amounts[where]);
                }
                left_pays_list = [];
            }

            if (cur_step_pays_list.length > 0) {
                pays_list_in_order.push(cur_step_pays_list);
                gets_list_in_order.push(cur_step_gets_list);
            }

            pays_list_from_offer = left_pays_list;
            pre_step_gets_list = cur_step_gets_list;
            pays_from_offer_size = pays_list_from_offer.length;
        }
    } else {
        pays_list_in_order.push(taker_pays_amounts);
        gets_list_in_order.push(taker_gets_amounts);
    }

    //set higher pays to make sure we can trade success.
    var cmds = [];
    _.each(pays_list_in_order, function(pays_list, i) {
        _.each(pays_list, function(pays, j) {
            cmds.push(cmdU.buildByAmount(pays_list_in_order[i][j], gets_list_in_order[i][j]));

            pays_list_in_order[i][j] = pays.product_human("1.00001");
            console.log(i + "", j + "", pays_list_in_order[i][j].to_text_full(), "->", gets_list_in_order[i][j].to_text_full());
        });
    });

    osjs.canCreateDCPOffers(cmds, 0, function(canCreate) {
        if (canCreate) {
            tradeOneByOneGroup(gets_list_in_order, pays_list_in_order, 0);
        } else {
            emitter.once('makeMultiCurrencyProfit', makeMultiCurrencyProfit);
        }
    });
}

function tradeTogether(orders_taker_pays, orders_taker_gets, callback) {
    var length = orders_taker_pays.length;
    _.each(_.range(length), function(i) {
        var taker_pays_json = orders_taker_pays[i].to_json();
        var taker_gets_json = orders_taker_gets[i].to_json();
        osjs.createOffer(taker_pays_json, taker_gets_json, null, false, function(status) {
            console.log("tx", status);
            tls.getLines(function() {
                if (i == length - 1) {
                    if (callback) {
                        callback();
                    }
                }
            });
        });
    });
}

function tradeOneByOneGroup(pays_set_list, gets_set_list, i) {
    var length = pays_set_list.length;
    if (i < length) {
        var pays_set = pays_set_list[i];
        var gets_set = gets_set_list[i];
        tradeTogether(pays_set, gets_set, function() {
            i = i + 1;
            if (length == i) {
                console.log("re-listen profit order");
                emitter.once('makeMultiCurrencyProfit', makeMultiCurrencyProfit);
            } else {
                tradeOneByOneGroup(pays_set_list, gets_set_list, i);
            }
        });
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
            remoteConnect(result.env);
        })
    });
}

function remoteConnect(env) {
    console.log("step3:connect to remote!")
    rsjs.getRemote(env, function(r) {
        remote = r;

        remote.connect(function() {
            tls = new TrustLineService(remote, account);
            tls.getLines(function() {
                listenProfitOrder();
            });

            osjs = new OfferService(remote, account, secret, tls);
            osjs.getOffers();

            remote.on('error', function(error) {
                throw new Error("remote error!");
            });

            remote.on('disconnect', function() {
                remoteConnect(env);
            });
        });
    });
}
