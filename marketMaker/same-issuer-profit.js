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
var TrustLineService = require('./trust-line-service.js').TrustLineService;
var minAmount = require('./amount-util.js').minAmount;


// var Logger = require('./new-logger.js').Logger;
// var sipLogger = new Logger('same-issuer-profit');
var sipLogger;

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
var al;
var tls;

console.log("getAccount!");
theFuture.getAccount(3, function(result) { // 3 ripple isreal
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
        console.log("remote connected!");

        al = new AccountListener(remote, account);
        al.listenOffer();

        tls = new TrustLineService(remote, account);

        osjs.create(remote, account, secret);
        osjs.getOffers(function() {
            tls.getLines(function(result) {
                makeProfit(result);
            });
        });
    });
}

var same_issuer_profit = config.same_issuer_profit;
var issuers;
var currencyMap = {};
var next = 0;
var cpLoop;
var curCurrencies;
var curIssuer;
var cpIndexSet = [1, 0];

function makeProfit(lines) {
    //get all effective trust line.
    lines = _.filter(lines, function(line) {
        return line.limit != 0;
    });

    //group all trust line by currency.
    lines = _.groupBy(lines, function(line) {
        return line.account;
    })

    //apply to those issuers we support. we store them into same_currency_profilt 
    issuers = _.intersection(_.keys(lines), same_issuer_profit);
    _.each(issuers, function(issuer) {
        // find out issuers which have multi issuers and build issuerMap
        if (lines[issuer].length > 1) {
            var cs = _.pluck(lines[issuer], 'currency');
            cs.push("XRP");
            currencyMap[issuer] = cs;
        }
    });

    console.log(currencyMap);
    issuers = _.keys(currencyMap);

    goNextIssuer();
}

function goNextIssuer() {
    if (issuers.length > next) {
        curIssuer = issuers[next];
        curCurrencies = currencyMap[curIssuer];

        cpLoop = new Loop([1, 0]);
        goNextCurrencyPair();
    } else {
        throw new Error('we are done!!!!');
    }
}


function goNextCurrencyPair() {
    var currency1 = curCurrencies[cpIndexSet[0]];
    var currency2 = curCurrencies[cpIndexSet[1]];

    queryBook(remote, currency1, curIssuer, currency2, curIssuer, account, sipLogger, function(bi) {
        if (bi.my) {
            goNext();
            return;
        } else {
            var account_balance = tls.getBalance(curIssuer, bi.taker_gets.currency().to_json());
            if (account_balance) {
                var min_taker_gets = minAmount([bi.taker_gets, account_balance]);

                var times = min_taker_gets.ratio_human(bi.taker_gets).to_human().replace(',', '');
                times = math.round(times * 0.99999, 6);
                bi.taker_pays = bi.taker_pays.product_human(times);


                osjs.cancelOfferUnderSameBook(bi.taker_pays.to_json(), bi.taker_gets.to_json());
                console.log("createOffer", bi.taker_pays.to_json(), bi.taker_gets.to_json());
                osjs.createOffer(bi.taker_pays, bi.taker_gets, sipLogger);
            }
            goNext();
        }
    });
}

function goNext() {
    cpIndexSet = cpLoop.next(cpIndexSet, curCurrencies.length);
    if (cpLoop.isCycle()) {
        next++;
        goNextIssuer();
    } else {
        goNextCurrencyPair();
    }
}

setTimeout(throwDisconnectError, 1000 * 60 * 10);

function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}