var WebSocket = require('ws');
var _ = require('underscore');
var aujs = require('./amount-util.js');
var rsjs = require('./remote-service.js');
var tfm = require('./the-future-manager.js');

var getPrice = aujs.getPrice;
var getIssuer = aujs.getIssuer;
var getCurrency = aujs.getCurrency;

var currency1 = "USD";
var currency2 = "CNY";

var asks = [
    "please input pays_currency",
    "please input pays_issuer",
    "please input gets_currency",
    "please input gets_issuer",
    "please input account"
];

var taker_pays = {};
var taker_gets = {};
var account;
var secret;

function ask(questions, i) {
    var question = questions[i];

    var stdin = process.stdin,
        stdout = process.stdout;

    stdin.resume();
    stdout.write(question);

    stdin.once('data', function(data) {
        if (i == 0) {
            taker_pays.currency = data;
            i = i + 1;
            ask(questions, i);
            return;
        }

        if (i == 1) {
            taker_pays.issuer = data;
            i = i + 1;
            ask(questions, i);
            return;
        }

        if (i == 2) {
            taker_gets.currency = data;
            i = i + 1;
            ask(questions, i);
            return;
        }

        if (i == 3) {
            taker_gets.issuer = data;
            i = i + 1;
            buildCmd();
            ask(questions, i);
            return;
        }

        if (i == 4) {
            mongodbManager.getAccount(data, function(result) {
                account = result.account;
                console.log("account:" + account);
                crypto.decrypt(result.secret, function(result) {
                    secret = result;
                });
            });
        }
    });
}

ask(asks, 0);

function buildCmd() {
    var pays_issuer = taker_pays.issuer;
    var pays_currency = taker_pays.currency;
    var gets_issuer = taker_gets.issuer;
    var gets_currency = taker_gets.currency;

    var cmd = {
        "cmd": "book",
        "params": {
            "pays_currency": [taker_pays.currency],
            "gets_currency": [taker_gets.currency],
            "pays_issuer": [taker_pays.issuer],
            "gets_issuer": [taker_gets.issuer]
        },
        "limit": 1,
        "filter": 1,
        "cache": 0
    }

    if (taker_pays.currency == taker_gets.currency) {
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


tfm.getEnv(function(result) {
    console.log("step3:connect to remote!")
    rsjs.getRemote(result.env, function(r) {
        remote = r;

        remote.connect(function() {
            osjs = new OfferService(remote, account, secret);
            osjs.createOffer(taker_pays, taker_gets);
        });
    });

});


function checkOrdersForDiffCurrency(orders) {
    orders = _.sortBy(orders, function(order) {
        return order.quality;
    });

    console.log(orders);
}