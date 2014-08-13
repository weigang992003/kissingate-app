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
var gAddresses;

var emitter = new events.EventEmitter();
emitter.on('queryBook', queryBook);
emitter.on('nextCurrencyPair', nextCurrencyPair);

remote.connect(function() {
    console.log("remote connected!");
    rippleInfo.getAllCurrenciesByAccountRate(function(result) {
        gatewayMap = _.groupBy(result, function(currencyInfo) {
            return currencyInfo.Account;
        });

        gAddresses = _.keys(gatewayMap);
        gSize = gAddresses.length;

        g1Address = gAddresses[gIndexStack[0]];
        g1Currencies = gatewayMap[g1Address];
        g1CurrencySize = g1Currencies.length;
        g1CurrencyIndex = 0;

        g2Address = gAddresses[gIndexStack[1]];
        g2Currencies = gatewayMap[g2Address];
        g2CurrencySize = g2Currencies.length;
        g2CurrencyIndex = 0;

        nextCurrencyPair();
    });
});

var currenciesIssued;
var gAddressIndex = 0;
var currency1;
var currency2;
var address1;
var address2;
var domain1;
var domain2;

var index = 0;

var loop = false;

function goNextGateway() {
    if (gIndexStack[0] == 1 && gIndexStack[1] == 0) {
        console.log("orderBook build done!");
        return;
    } else {
        g1Address = gAddresses[gIndexStack[0]];
        g1Currencies = gatewayMap[g1Address];
        g1CurrencySize = g1Currencies.length;
        g1CurrencyIndex = 0;

        g2Address = gAddresses[gIndexStack[1]];
        g2Currencies = gatewayMap[g2Address];
        g2CurrencySize = g2Currencies.length;
        g2CurrencyIndex = 0;

        nextCurrencyPair();
    }
}

function nextCurrencyPair() {
    currency1 = g1Currencies[g1CurrencyIndex].currency;
    currency2 = g2Currencies[g2CurrencyIndex].currency;
    domain1 = g1Currencies[g1CurrencyIndex].domain;
    domain2 = g2Currencies[g2CurrencyIndex].domain;
    console.log(currency1, ":", currency2);
    console.log(domain1, ":", domain2);
    emitter.emit('queryBook', currency1, g1Address, domain1, currency2, g2Address, domain2);
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
        }

        if (orderBook.askNum != 0 || orderBook.bidNum != 0) {
            console.log(index++);
            rippleInfo.saveOrderBook(orderBook);
        }

        nextCIndexStack();
        if (g1CurrencyIndex == 0 && g2CurrencyIndex == 0) {
            nextGIndexStack();
            goNextGateway();
            return;
        }

        emitter.emit('nextCurrencyPair');
    });
}

var g1Address;
var g2Address;
var g1CurrencyIndex;
var g1CurrencySize;
var g2CurrencyIndex;
var g2CurrencySize;
var g1Currencies;
var g2Currencies;

function nextCIndexStack() {
    g1CurrencyIndex = (g1CurrencyIndex + 1) % g1CurrencySize;
    if (g1CurrencyIndex == 0) {
        g2CurrencyIndex = (g2CurrencyIndex + 1) % g2CurrencySize;
    }
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