var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var crypto = require('./crypto-util.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
var mongodbManager = require('./the-future-manager.js');
var Logger = require('./the-future-logger.js').TFLogger;
Logger.getNewLog("keep-currency-balance-solution");

var emitter = new events.EventEmitter();
emitter.once('decrypt', decrypt);
emitter.once('remoteConnect', remoteConnect);
emitter.on('goNextCurrency', goNextCurrency);
emitter.on('createOffer', createOffer);

var remote_options = remote_options = {
    // see the API Reference for available options
    // trace: true,
    trusted: true,
    local_signing: true,
    local_fee: true,
    fee_cushion: 1.5,
    max_fee: 100,
    servers: [{
        host: 's-east.ripple.com',
        port: 443,
        secure: true
    }, {
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

var account;
var secret;
mongodbManager.getAccount(config.mother, function(result) {
    account = result.account;
    secret = result.secret;
    emitter.emit('decrypt', secret);
});

var offers;
var orders = [];

function decrypt(encrypted) {
    crypto.decrypt(encrypted, function(result) {
        secret = result;
        emitter.emit('remoteConnect');
    });
}

function remoteConnect() {
    remote.connect(function() {
        remote.requestAccountOffers(account, function() {
            offers = arguments[1].offers;
            remote.requestAccountLines(account, function(err, result) {
                if (err) console.log(err);
                makeProfit(result.lines);
            });
        });
    });
}

var same_currency_profit = config.same_currency_profit;
var issuerMap = {};

function makeProfit(lines) {
    lines = _.filter(lines, function(line) {
        return line.limit != 0;
    });

    lines = _.groupBy(lines, function(line) {
        return line.currency;
    })

    var currencies = _.intersection(_.keys(lines), same_currency_profit);
    _.each(currencies, function(currency) {
        if (lines[currency].length > 1) {
            var issuers = _.pluck(lines[currency], 'account');
            issuerMap[currency] = issuers;
        }
    });
    currencies = _.keys(issuerMap);

    emitter.emit('goNextCurrency');
}

var next = 0;

function goNextCurrency() {
    if (currencies.length > next) {
        emitter.emit('createOffer', orders[next].taker_pays, orders[next].taker_gets);
    } else {
        throw new Error('we are done!!!!');
    }
}

var nextPair = [1, 0];

function goNextIssuerPair() {

}


function createOffer(taker_pays, taker_gets) {
    var tx = remote.transaction();
    if (secret) {
        tx.secret(secret);
    } else {
        return;
    }

    Logger.log(true, "we are create offer here", "taker_pays", taker_pays, "taker_gets", taker_gets);

    tx.offerCreate(account, taker_pays, taker_gets);
    tx.on("success", function(res) {
        next++;
        emitter.emit('goNextCurrency');
    })
    tx.on("error", function(res) {
        console.log(res);
        throw new Error('something wrong!!!!');
    })

    tx.submit();
}

function ifOfferExist(offers, pays, gets) {
    var self = this;

    var result = _.filter(offers, function(offer) {
        return offer.taker_pays.currency == pays.currency && offer.taker_pays.issuer == pays.issuer && offer.taker_gets.currency == gets.currency && offer.taker_gets.issuer == gets.issuer;
    });

    if (result.length > 0) {
        return true;
    }

    return false;
}

setTimeout(throwDisconnectError, 1000 * 60 * 10);

function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}