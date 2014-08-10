var Logger = require('./the-future-logger.js').TFLogger;
Logger.getNewLog('btc38-test');

var http = require('http');
var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var request = require('request');
var querystring = require('querystring');
var jsbn = require('../src/js/jsbn/jsbn.js');
var mongodbManager = require('./the-future-manager.js');

var md5;
var cookie;
mongodbManager.getCookie('btc38', function(result) {
    cookie = result;
    getMD5(cookie);
    createOrder(0.04, 100, 2);
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

function createOrder(price, amount, type, coin) {
    if (!md5) {
        return;
    }

    var url = 'http://m.btc38.com/newOrder2.php';

    var form = {
        type: type,
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
            Logger.log(true, form);
            console.log("md5 is expired!!!! please update it!!!");
        }
    });
}