var Logger = require('./new-logger.js').Logger;
var fohLogger = new Logger('first-order-history');

var ripple = require('../src/js/ripple');
var jsbn = require('../src/js/jsbn/jsbn.js');

var Remote = ripple.Remote;
var Amount = ripple.Amount;

var _ = require('underscore');
var config = require('../marketMaker/config.js');

var Loop = require('./new-loop-util.js').Loop;
var AmountUtil = require('./amount-util.js').AmountUtil;
var TrustLineService = require('./trust-line-service.js').TrustLineService;
var AccountInfoManager = require('./account-info-manager.js').AccountInfoManager;


var tls;
var loop;
var au = new AmountUtil();
var aim = new AccountInfoManager();

var drops = config.drops;
var profit_rate = config.profitRate;
var currencies_no = config.currencies_no;
var transfer_rates = config.transfer_rates;
var profit_min_volumns = config.profit_min_volumns;
var same_currency_profit = config.same_currency_profit;
var same_currency_issuers = config.same_currency_issuers;
var first_order_currencies = config.first_order_currencies;
var first_order_allow_issuers = config.first_order_allow_issuers;

var ledger_current_index;
var ledger_index_start;
var ledger_index_end;
var account;

var remote = new Remote({
    // see the API Reference for available options
    // trace: true,
    trusted: true,
    local_signing: true,
    local_fee: true,
    fee_cushion: 1.5,
    max_fee: 100,
    servers: [{
        host: 's-west.ripple.com',
        port: 443,
        secure: true
    }, {
        host: 's-east.ripple.com',
        port: 443,
        secure: true
    }]
});


var currencies;

function prepareCurrencies(lines) {
    lines = _.filter(lines, function(line) {
        return line.limit != 0;
    })
    currencies = _.pluck(lines, 'currency');
    currencies = _.uniq(currencies);
    currencies.push("XRP");
    loop = new Loop([1, 0], currencies.length, false);
    return currencies;
}

function remoteConnect() {
    remote.connect(function() {
        console.log("remote connected!");

        tls = new TrustLineService(remote, account);
        tls.getLines(function(lines) {
            console.log("step4:prepare currencies!")
            var currencies = prepareCurrencies(lines);

            startMerge(currencies, loop.curIndexSet());
        });
    });
}

remoteConnect();

function startMerge(currencies, indexSet) {
    var i_pays_currency = currencies[indexSet[0]];
    var i_gets_currency = currencies[indexSet[1]];

    aim.getTH(account, i_pays_currency, i_gets_currency, function(th1) {
        if (th1.length > 0) {
            aim.getTHByCurrencyPair(i_gets_currency, i_pays_currency, function(th2) {
                if (th2.length > 0) {
                    var th = merge(th1, th2);
                    if (th) {
                        th1.remove();
                        th2.remove();
                        aim.saveTH(th);
                    }
                }
            })
        }
    })
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
            th.i_pays_value = th1.i_pays_currency - th2.i_gets_value;
            th.i_gets_value = th1.i_gets_value - th2.i_pays_value;
            th.price = (th.i_pays_value / th.i_gets_value).toExponential();
        } else {
            th.i_pays_currency = th2.i_pays_currency;
            th.i_gets_currency = th2.i_gets_currency;
            th.i_pays_value = th2.i_pays_currency - th1.i_gets_value;
            th.i_gets_value = th2.i_gets_value - th1.i_pays_value;
            th.price = (th.i_pays_value / th.i_gets_value).toExponential();
        }

        return th;
    }
}

// setTimeout(close, 1000 * 60 * 60);


// function close() {
//     remote.disconnect(function() {
//         console.log("disconnect");
//         process.exit(1);
//     })
// }