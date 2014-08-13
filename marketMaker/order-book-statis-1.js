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
emitter.on('goNextCurrency', goNextCurrency);

remote.connect(function() {
    console.log("remote connected!");
    rippleInfo.getAllCurrenciesByAccountRate(function(result) {
        gatewayMap = _.groupBy(result, function(currencyInfo) {
            return currencyInfo.Account;
        });

        gAddresses = _.keys(gatewayMap);

        goNextGateway();
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

function goNextGateway() {
    if (gAddresses.length > gAddressIndex) {
        currenciesIssued = gatewayMap[gAddresses[gAddressIndex]];
        cSize = currenciesIssued.length;
        if (cSize <= 1) {
            gAddressIndex++;
            goNextGateway();
            return;
        } else {
            goNextCurrency();
        }
    } else {
        console.log("orderBook build done!");
    }
}

function goNextCurrency() {
    address1 = gAddresses[gAddressIndex];
    address2 = gAddresses[gAddressIndex];
    currency1 = currenciesIssued[cIndexStack[0]].currency;
    currency2 = currenciesIssued[cIndexStack[1]].currency;
    domain1 = currenciesIssued[cIndexStack[0]].domain;
    domain2 = currenciesIssued[cIndexStack[1]].domain;
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
        }

        if (orderBook.askNum != 0 || orderBook.bidNum != 0) {
            console.log(index++);
            rippleInfo.saveOrderBook(orderBook);
        }

        if (cSize == 2) {
            gAddressIndex++;
            goNextGateway();
            return;
        }

        var indexStack = nextGIndexStack();
        if ((indexStack[0] == 1 && indexStack[1] == 0)) {
            gAddressIndex++;
            goNextGateway();
            return;
        }

        emitter.emit('goNextCurrency');
    });
}



var cSize = 0;
var cIndexStack = [1, 0];

function nextGIndexStack() {
    var index = _.first(cIndexStack);
    cIndexStack = _.rest(cIndexStack);
    index = (index + 1) % cSize;
    if (index == 0 && cIndexStack.length > 0) {
        cIndexStack = nextGIndexStack();
    }

    while (_.contains(cIndexStack, index)) {
        cIndexStack.unshift(index);
        cIndexStack = nextGIndexStack();
        index = _.first(cIndexStack);
        cIndexStack = _.rest(cIndexStack);
    }

    cIndexStack.unshift(index);
    return cIndexStack;
}