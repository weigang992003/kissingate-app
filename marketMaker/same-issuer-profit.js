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
var queryBookNoRate = require('./query-book.js').queryBookNoRate;

var Logger = require('./new-logger.js').Logger;
var sipLogger = new Logger('same-issuer-profit');

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
        osjs.create(remote, account);
        osjs.getOffers(function() {
            remote.requestAccountLines(account, function(err, result) {
                if (err) console.log(err);
                makeProfit(result.lines);
            });
        });
    });
}

var same_currency_profit = config.same_currency_profit;
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
    issuers = _.intersection(_.keys(lines), same_currency_profit);
    _.each(issuers, function(issuer) {
        // find out issuers which have multi issuers and build issuerMap
        if (lines[issuer].length > 1) {
            currencyMap[issuer] = _.pluck(lines[issuer], 'currency');
        }
    });
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

    queryBookNoRate(remote, currency1, curIssuer, currency2, curIssuer, account, sipLogger, function(bi) {
        if (bi.my) {
            goNext();
        } else {
            bi.taker_pays.product_human("0.99999");
            osjs.createOffer(bi.taker_pays, bi.taker_gets, sipLogger);
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