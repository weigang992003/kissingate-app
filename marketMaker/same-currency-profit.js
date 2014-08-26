var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var crypto = require('./crypto-util.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
var osjs = require('./offer-service.js');
var Loop = require('./loop-util.js').Loop;
var theFuture = require('./the-future-manager.js');
var queryBook = require('./query-book.js').queryBook;
var AccountListener = require('./listen-account-util.js').AccountListener;
var al;

var Logger = require('./new-logger.js').Logger;
var scpLogger = new Logger('same-currency-profit');

var emitter = new events.EventEmitter();
emitter.once('decrypt', decrypt);
emitter.once('remoteConnect', remoteConnect);

var remote_options = remote_options = {
    // see the API Reference for available options
    // trace: true,
    trusted: true,
    local_signing: true,
    local_fee: true,
    fee_cushion: 1.5,
    max_fee: 100,
    servers: [{
        host: 's1.ripple.com',
        port: 443,
        secure: true
    }, {
        host: 's-east.ripple.com',
        port: 443,
        secure: true
    }, {
        host: 's-west.ripple.com',
        port: 443,
        secure: true
    }]
};

var remote = new ripple.Remote(remote_options);

var account;
var secret;
theFuture.getAccount(config.mother, function(result) {
    account = result.account;
    secret = result.secret;
    emitter.emit('decrypt', secret);
});

function decrypt(encrypted) {
    crypto.decrypt(encrypted, function(result) {
        secret = result;
        emitter.emit('remoteConnect');
    });
}

function remoteConnect() {
    remote.connect(function() {
        al = new AccountListener(account);
        al.listenOffer();

        osjs.create(remote, account, secret);
        osjs.getOffers(function() {
            remote.requestAccountLines(account, function(err, result) {
                if (err) console.log(err);
                makeProfit(result.lines);
            });
        });
    });
}

var same_currency_profit = config.same_currency_profit;
var currencies;
var issuerMap = {};
var next = 0;
var ipLoop;
var curIssuers;
var curCurrency;
var ipIndexSet = [1, 0];

function makeProfit(lines) {
    //get all effective trust line.
    lines = _.filter(lines, function(line) {
        return line.limit != 0;
    });

    //group all trust line by currency.
    lines = _.groupBy(lines, function(line) {
        return line.currency;
    })

    //apply to those currencies we support. we store them into same_currency_profilt 
    currencies = _.intersection(_.keys(lines), same_currency_profit);
    _.each(currencies, function(currency) {
        // find out currencies which have multi issuers and build issuerMap
        if (lines[currency].length > 1) {
            var issuers = _.pluck(lines[currency], 'account');
            issuerMap[currency] = issuers;
        }
    });
    currencies = _.keys(issuerMap);

    goNextCurrency();
}

function goNextCurrency() {
    if (currencies.length > next) {
        curCurrency = currencies[next];
        curIssuers = issuerMap[curCurrency];

        ipLoop = new Loop([1, 0]);
        goNextIssuerPair();
    } else {
        throw new Error('we are done!!!!');
    }
}


function goNextIssuerPair() {
    var issuer1 = curIssuers[ipIndexSet[0]];
    var issuer2 = curIssuers[ipIndexSet[1]];

    queryBook(remote, curCurrency, issuer1, curCurrency, issuer2, account, scpLogger, function(bi) {
        console.log("buy " + issuer1, "price:" + bi.price, "with:" + issuer2);
        if (bi.price - 0 < 0.999) {
            osjs.createOffer(bi.taker_pays, bi.taker_gets, scpLogger);
        }

        ipIndexSet = ipLoop.next(ipIndexSet, curIssuers.length);
        if (ipLoop.isCycle()) {
            next++;
            goNextCurrency();
        } else {
            goNextIssuerPair();
        }
    });
}

setTimeout(throwDisconnectError, 1000 * 60 * 10);

function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}