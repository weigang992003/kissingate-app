var _ = require('underscore');
var events = require('events');
var ripple = require('../src/js/ripple');
var rippleInfo = require('./ripple-info-manager.js');

var remote_options = {
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
var Amount = ripple.Amount;

var gatewayMap;
var currencies;
var currenciesInfo;

var emitter = new events.EventEmitter();
emitter.on('queryBook', queryBook);
emitter.on('goNextGateway', goNextGateway);

remote.connect(function() {
    console.log("remote connected!");
    rippleInfo.getAllCurrencies(function(result) {
        currenciesInfo = result;
        gatewayMap = _.groupBy(currenciesInfo, function(currencyInfo) {
            return currencyInfo.currency;
        });

        currencies = _.keys(gatewayMap);

        goNextCurrency();
    });
});

var gateways;
var currencyIndex = 0;
var currency1;
var currency2;
var address1;
var address2;
var domain1;
var domain2;

function goNextCurrency() {
    if (currencies.length > currencyIndex) {
        gateways = gatewayMap[currencies[currencyIndex]];
        gSize = gateways.length;
        if (gSize <= 1) {
            currencyIndex++;
            goNextCurrency();
            return;
        } else {
            goNextGateway();
        }
    } else {
        console.log("orderBook build done!");
    }
}

function goNextGateway() {
    currency1 = currencies[currencyIndex];
    currency2 = currencies[currencyIndex];
    address1 = gateways[gIndexStack[0]].Account;
    address2 = gateways[gIndexStack[1]].Account;
    domain1 = gateways[gIndexStack[0]].domain;
    domain2 = gateways[gIndexStack[1]].domain;
    console.log(currency1, ":", currency2);
    console.log(domain1, ":", domain2);
    emitter.emit('queryBook', currency1, address1, domain1, currency2, address2, domain2);
}

function queryBook(currency1, address1, domain1, currency2, address2, domain2) {
    var orderBook = {
        gateway1: {
            domain: domain1,
            address: address1,
            currency: currency1
        },
        gateway2: {
            domain: domain2,
            address: address2,
            currency: currency2
        },
        askNum: 0,
        askPrice: 0,
        bidNum: 0,
        bidPrice: 0
    }

    var asks = remote.book(currency1, address1, currency2, address2);
    asks.offers(function(offers) {
        console.log("asks offers return;");
        if (offers.length > 0) {
            orderBook.askNum = offers.length;

            if (offers[0].quality) {
                orderBook.askPrice = offers[0].quality;
            } else {
                var taker_pays = Amount.from_json(offers[0].TakerPays);
                var taker_gets = Amount.from_json(offers[0].TakerGets);
                var askPrice = taker_pays.ratio_human(taker_gets).to_human().replace(',', '');
                orderBook.askPrice = askPrice;
            }
        }
    });

    var bids = remote.book(currency2, address2, currency1, address1);
    bids.offers(function(offers) {
        console.log("bids offers return;");
        if (offers.length > 0) {
            orderBook.bidNum = offers.length;

            if (offers[0].quality) {
                orderBook.bidPrice = 1 / offers[0].quality;
            } else {
                var taker_pays = Amount.from_json(offers[0].TakerPays);
                var taker_gets = Amount.from_json(offers[0].TakerGets);
                var bidPrice = taker_gets.ratio_human(taker_pays).to_human().replace(',', '');
                orderBook.bidPrice = bidPrice;
            }

            rippleInfo.saveOrderBook(orderBook);
        }

        if (gSize == 2) {
            currencyIndex++;
            goNextCurrency();
            return;
        }

        var indexStack = nextGIndexStack();
        if ((indexStack[0] == 1 && indexStack[1] == 0)) {
            currencyIndex++;
            goNextCurrency();
            return;
        }

        emitter.emit('goNextGateway');
    });
}



var gSize = 0;
var gIndexStack = [1, 0];

function nextGIndexStack() {
    var index = _.first(gIndexStack);
    gIndexStack = _.rest(gIndexStack);
    index = (index + 1) % gSize;
    if (index == 0 && gIndexStack.length > 0) {
        gIndexStack = nextGIndexStack();
    }

    while (_.contains(gIndexStack, index)) {
        gIndexStack.unshift(index);
        gIndexStack = nextGIndexStack();
        index = _.first(gIndexStack);
        gIndexStack = _.rest(gIndexStack);
    }

    gIndexStack.unshift(index);
    return gIndexStack;
}
