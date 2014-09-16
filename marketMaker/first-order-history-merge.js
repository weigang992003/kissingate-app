var Logger = require('./new-logger.js').Logger;
var fohmLogger = new Logger('first-order-history-merge');

var _ = require('underscore');
var config = require('./config.js');

var Loop = require('./new-loop-util.js').Loop;
var AmountUtil = require('./amount-util.js').AmountUtil;
var TheFutureManager = require('./the-future-manager.js').TheFutureManager;
var AccountInfoManager = require('./account-info-manager.js').AccountInfoManager;

var tls;
var loop;
var au = new AmountUtil();
var tfm = new TheFutureManager();
var aim = new AccountInfoManager();

var ledger_current_index;
var ledger_index_start;
var ledger_index_end;

var account;
console.log("step1:getAccount!")
tfm.getAccount(config.marketMaker, function(result) {
    console.log(result.account);
    aim.getTHByAccount(result.account, function(ths) {
        var currencies = prepareCurrencies(ths);
        console.log("start merge");

        startMerge(ths, currencies, loop.curIndexSet());
    })
});

function prepareCurrencies(ths) {
    var i_pays_currencies = _.pluck(ths, 'i_pays_currency');
    var i_gets_currencies = _.pluck(ths, 'i_gets_currency');
    i_pays_currencies = _.uniq(i_pays_currencies);
    i_gets_currencies = _.uniq(i_gets_currencies);
    var currencies = _.union(i_pays_currencies, i_gets_currencies);
    loop = new Loop([1, 0], currencies.length, false);
    return currencies;
}


function startMerge(ths, currencies, indexSet) {
    console.log(currencies[indexSet[0]], currencies[indexSet[1]]);

    var i_pays_currency = currencies[indexSet[0]];
    var i_gets_currency = currencies[indexSet[1]];

    var th1 = _.find(ths, function(th) {
        return th.i_pays_currency == i_pays_currency && th.i_gets_currency == i_gets_currency;
    });

    i_pays_currency = currencies[indexSet[1]];
    i_gets_currency = currencies[indexSet[0]];

    var th2 = _.find(ths, function(th) {
        return th.i_pays_currency == i_pays_currency && th.i_gets_currency == i_gets_currency;
    });

    if (th1 && th2) {
        var th = merge(th1, th2);
        if (th.price) {
            console.log("remove th1");
            th1.remove(function(err) {
                if (err) {
                    throw new Error(err);
                }

                console.log("remove th2");
                th2.remove(function(err) {
                    if (err) {
                        throw new Error(err);
                    }

                    console.log("save th");
                    aim.saveTH(th, function() {
                        loop.next();
                        if (!loop.isCycle()) {
                            startMerge(ths, currencies, loop.curIndexSet());
                            return;
                        } else {
                            console.log("merge done!!!");
                        }
                    });
                })

            })
        }
    } else {
        loop.next();
        if (!loop.isCycle()) {
            startMerge(ths, currencies, loop.curIndexSet());
            return;
        } else {
            console.log("merge done!!!");
        }
    }


}

function merge(th1, th2) {
    if (th1.i_pays_currency != th2.i_gets_currency || th2.i_pays_currency != th1.i_gets_currency) {
        return;
    }

    var th = {};
    th.hashs = _.union(th1.hashs, th2.hashs);
    th.account = th1.account;

    //case1 i_pays_value of th1 bigger then gets_value and i_gets_value of th1 bigger then pays_value of th2
    //1 USD ->6 CNY 3CNY -> 0.5 USD
    //when has profit between th1 and th2, or th1>=th2 or th2>th1
    if (th1.price * th2.price < 1) {
        if (th1.i_pays_value - th2.i_gets_value >= 0 && th1.i_gets_value - th2.i_pays_value >= 0) {
            th.i_pays_currency = th1.i_pays_currency;
            th.i_gets_currency = th1.i_gets_currency;
            th.i_pays_value = th1.i_pays_value - th2.i_gets_value;
            th.i_gets_value = th1.i_gets_value - th2.i_pays_value;
            th.price = (th.i_pays_value / th.i_gets_value).toExponential();
        } else {
            th.i_pays_currency = th2.i_pays_currency;
            th.i_gets_currency = th2.i_gets_currency;
            th.i_pays_value = th2.i_pays_value - th1.i_gets_value;
            th.i_gets_value = th2.i_gets_value - th1.i_pays_value;
            th.price = (th.i_pays_value / th.i_gets_value).toExponential();
        }

        return th;
    } else {
        console.log("profit:", th1.price * th2.price);
    }
}

// setTimeout(close, 1000 * 60 * 60);


// function close() {
//     remote.disconnect(function() {
//         console.log("disconnect");
//         process.exit(1);
//     })
// }