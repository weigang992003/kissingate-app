var Logger = require('./the-future-logger.js').TFLogger;
Logger.getNewLog('find-path-btc38-type-1');

var http = require('http');
var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var request = require('request');
var config = require('./config.js');
var querystring = require('querystring');
var crypto = require('./crypto-util.js');
var ripple = require('../src/js/ripple');
var jsbn = require('../src/js/jsbn/jsbn.js');
var mongodbManager = require('./mongodb-manager.js');
var PathFind = require('../src/js/ripple/pathfind.js').PathFind;

var defaultAmount = 100;
var drops = 1000000;

var emitter = new events.EventEmitter();

var remote_options = remote_options = {
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
        host: 's1.ripple.com',
        port: 443,
        secure: true
    }]
};

var remote = new ripple.Remote(remote_options);
var Amount = ripple.Amount;


var account;
var secret;
mongodbManager.getAccount(0, function(result) {
    account = result.account;
    crypto.decrypt(result.secret, function(result) {
        secret = result;
    });
})

var md5;
var cookie;
mongodbManager.getCookie('btc38', function(result) {
    cookie = result;
    getMD5(cookie);
});

function getMD5(cookie) {
    var list = cookie.split(";");
    _.each(list, function(item) {
        item = item.trim();
        if (item.indexOf("BTC38_md5") > -1) {
            md5 = item.split("=")[1];
            console.log('md5:' + md5);
        }
    })
}

function checkOnBtc38(cnyValue) {
    console.log("start to check on btc38!");
    request.get({
        url: 'http://m.btc38.com/getTradeInfo.php?coin_name=XRP',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.9; rv:30.0) Gecko/20100101 Firefox/30.0'
        }
    }, function(e, r, body) {
        if (!body) {
            console.log("there is no response from btc38");
            return;
        }
        var tradeInfo = JSON.parse(body);
        var sellOrder = tradeInfo.sellOrder;
        var price = parseFloat(sellOrder[0].price);
        var amount = parseInt(sellOrder[0].amount);
        amount = amount > defaultAmount ? defaultAmount : amount;
        var value = price * amount;

        checkInRipple(price, value, amount);
    });
}

var trade = false;
var pathFind;

function checkInRipple(btc38Price, cnyValue, amount) {
    var dest_amount = Amount.from_json({
        issuer: account,
        currency: "CNY",
        value: cnyValue + ""
    });

    if (pathFind) {
        pathFind.close();
    }

    pathFind = remote.pathFind(account, account, dest_amount, [buildSrcCurrencies("XRP")]);

    var times = 0;
    var trade = false;
    pathFind.on("update", function(message) {
        times++;
        if (times < 3) {
            return;
        }
        if (times > 10) {
            pathFind.close();
        }

        var alternatives = _.each(message.alternatives, function(raw) {
            var alt = {};
            alt.dest_amount = dest_amount;
            alt.source_amount = Amount.from_json(raw.source_amount);
            alt.paths = raw.paths_computed ? raw.paths_computed : raw.paths_canonical;

            if (xrpBalance < raw.source_amount) {
                throwErrorToExit("we don't have enough balance to trade,we total have:" + xrpBalance / drops);
                pathFind.close();
                return;
            }

            var rPrice = dest_amount.ratio_human(alt.source_amount).to_human();

            rPrice = parseFloat(rPrice);
            console.log("btc38 price:" + btc38Price + " ripple price:" + rPrice);
            if (rPrice > btc38Price) {
                console.log("ripple amount:" + parseFloat(raw.source_amount / drops) + " exchange btc38 amount:" + amount);
            } else {
                return;
            }

            if (parseInt(raw.source_amount) < (amount * 0.985 * drops) && !trade) {
                trade = true;
                pathFind.close();

                Logger.log(true, "buy xrp from btc38 with " + cnyValue + "(CNY)", "sell CNY in ripple with " + raw.source_amount / drops,
                    "ripple amount:" + parseFloat(raw.source_amount / drops) + " exchange btc38 amount:" + amount);

                createOrder(btc38Price, amount, alt, pathFind);
            }
        });
    });

    pathFind.create();

}

function buildSrcCurrencies(currency) {
    var issuer = currency == "XRP" ? 'rrrrrrrrrrrrrrrrrrrrrhoLvTp' : account;
    return {
        "currency": currency,
        "issuer": issuer
    }
}

function createOrder(price, amount, alt, pathFind, coin) {
    if (!md5 || !secret) {
        return;
    }

    var url = 'http://m.btc38.com/newOrder2.php';

    var form = {
        type: 1,
        amount: amount,
        price: price,
        coin_name: coin ? coin : "XRP",
        check: md5
    }

    console.log(form);

    var headers = {
        "Content-Length": querystring.stringify(form).length,
        "Referer": "http://m.btc38.com/tradeInfo.php?coin_name=xrp",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.9; rv:30.0) Gecko/20100101 Firefox/30.0',
        "Cookie": cookie
    };

    console.log(headers);

    request.post({
        url: url,
        form: form,
        headers: headers
    }, function(e, r, body) {
        console.log(body);
        if (body == "succ") {
            exchangeInRipple(alt);
        } else if (body == "wrongmd5") {
            throwErrorToExit("md5 is expired!!!! please update it!!!");
        }
    });
}

function exchangeInRipple(alt) {
    var tx = remote.transaction();

    tx.paths(alt.paths);
    tx.payment(account, account, alt.dest_amount);
    tx.send_max(alt.source_amount.product_human(1.01));

    Logger.log(true, "tx", alt.dest_amount.to_human_full() + "/" + alt.source_amount.to_human_full());

    if (secret) {
        tx.secret(secret);
    } else {
        return;
    }

    tx.on('proposed', function(res) {
        Logger.log(true, res);
        console.log("tx success!");
    });

    tx.on('error', function(res) {
        Logger.log(true, res);
    });

    tx.submit();
}

var xrpBalance = 0;
var reserve = 10000 * drops;

remoteConnect();

function remoteConnect() {
    remote.connect(function() {
        console.log("remote connected!");

        remote.requestAccountInfo(account, function(err, res) {
            if (err) {
                throwErrorToExit("error happen when query account info!!!");
                return;
            }

            xrpBalance = res.account_data.Balance;
            xrpBalance = xrpBalance - reserve;
            console.log("we have Balance in Ripple:" + xrpBalance);
            if (xrpBalance > 0) {
                checkOnBtc38();

                setInterval(checkOnBtc38, 1000 * 60);
            }
        });

        remote.on('error', function(error) {
            throw new Error("remote error!");
        });

        remote.on('disconnect', function() {
            remote = new ripple.Remote(remote_options);
            remoteConnect();
        });
    });
}

function throwErrorToExit(err) {
    throw new Error(err);
}