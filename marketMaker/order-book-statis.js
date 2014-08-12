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
var gAddress1;
var gAddress2;
var gName1;
var gName2;

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
    var indexStack = nextGIndexStack();
    if (indexStack[0] == 1 && indexStack[1] == 0) {
        currencyIndex++;
        goNextCurrency();
    }

    currency1 = currencies[currencyIndex];
    currency2 = currencies[currencyIndex];
    gAddress1 = gateways[indexStack[0]].Account;
    gAddress2 = gateways[indexStack[1]].Account;
    gName1 = gateways[indexStack[0]].domain;
    gName2 = gateways[indexStack[1]].domain;
    console.log(gName1, gName2);
    emitter.emit('queryBook', currency1, gAddress1, gName1, currency2, gAddress2, gName2);
}

function queryBook(currency1, gAddress1, gName1, currency2, gAddress2, gName2) {
    var orderBook = {
        currencyPair: [currency1, currency2],
        gAddressPair: [gAddress1, gAddress2],
        gNamePair: [gName1, gName2],
        askNum: 0,
        askPrice: 0,
        bidNum: 0,
        bidPrice: 0
    }

    var asks = remote.book(currency1, gAddress1, currency2, gAddress2);
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

    var bids = remote.book(currency2, gAddress2, currency1, gAddress1);
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

        emitter.emit('goNextGateway');
    });
}



var gSize = 0;
var gIndexStack;

function nextGIndexStack() {
    if (!gIndexStack) {
        gIndexStack = [1, 0];
        return gIndexStack;
    }
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