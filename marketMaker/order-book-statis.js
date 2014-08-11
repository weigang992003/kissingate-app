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

remote.connect(function() {
    var currencies;
    rippleInfo.getAllCurrencies(function(result) {
        currencies = result;
    })
});


var orderBookSchema = mongoose.Schema({
    currencyPair: String,
    gatewayPair: String,
    askNum: Number,
    bidNum: Number,
    spread: Number
}, {
    collection: 'orderBook'
});


var orderBook;

function queryBook(currenciesInfo) {
    var gateways = _.groupBy(currenciesInfo, function(currencyInfo) {
        return currencyInfo.currency;
    });

    var currencies = _.keys(gateways);

    _.each(currencies, function(currency) {
        var gAddresses = gateways[currency];
        var size = gAddresses.length;
        if (size == 1) {
            return;
        }

        orderBook = {
            currencyPair: [currency, currency],
            gatewayPair: [gAddresses[indexStack[0]], gAddresses[indexStack[1]]],
            askNum: 0,
            bidNum: 0,
            spread: 0
        }

        var asks = remote.book(currency, indexStack[0], currency, indexStack[1]); // ripplecn.
        asks.offers(function(offers) {
            orderBook.askNum = offers.length;
        });
        var bids = remote.book(currency, indexStack[1], currency, indexStack[0]); // ripplecn.
        bids.offers(function(offers) {
            orderBook.bidNum = offers.length;
        });
    });
}

function queryBook(currency1, gateway1, currency2, gateway2) {
    orderBook = {
        currencyPair: [currency1, currency2],
        gatewayPair: [gateway1, gateway2]
    }

    var asks = remote.book(currency1, gateway1, currency2, gateway2);
    asks.offers(function(offers) {
        orderBook.askNum = offers.length;
        if (offers.length > 0) {
            if (offers[0].quality) {

            }
            var taker_pays = Amount.from_json(offers[0].TakerPays);
            var taker_gets = Amount.from_json(offers[0].TakerGets);
            var rate = taker_gets.ratio_human(taker_pays).to_human().replace(',', '');
            console.log(rate);
            console.log(offers[0].quality);
            close();

            alt.dest_amount = Amount.from_json(dest_amount);
            alt.source_amount = Amount.from_json(raw.source_amount);
            alt.rate = alt.source_amount.ratio_human(dest_amount).to_human().replace(',', '');
        }
    });
    var bids = remote.book(currency2, gateway2, currency1, gateway1);
    bids.offers(function(offers) {
        orderBook.bidNum = offers.length;
    });
}

function updateOrderBook(orderBook, key, value) {
    orderBook[key] = value;
}



var init = [1, 0];
var indexStack = [1, 0];

function getNextIndex(size) {
    var index = _.first(indexStack);
    indexStack = _.rest(indexStack);
    index = (index + 1) % size;
    if (index == 0 && indexStack.length > 0) {
        indexStack = getNextIndex();
    }

    while (_.contains(indexStack, index)) {
        indexStack.unshift(index);
        indexStack = getNextIndex();
        index = _.first(indexStack);
        indexStack = _.rest(indexStack);
    }

    indexStack.unshift(index);
    return indexStack;
}