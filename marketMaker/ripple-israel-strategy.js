var util = require('util');
var _ = require('underscore');
var config = require('./config.js');
var EventEmitter = require('events').EventEmitter;
var Logger = require('./the-future-logger.js').TFLogger;

var account = config.account;
var secret = config.secret;
var drops = config.drops;
var marketEvent = config.marketEvent;

var maxAmountAllowed = 1;

function Strategy(remote) {
    var self = this;

    this._remote = remote;
    this._account = remote.account(account);

    this._buyMarkets = [];
    this._sellMarkets = [];
    this._sequences = [];
    this._offers = [];
    this._profitRatioIGive = 1 / 100000;
    this._profitRatioIWant = 0;

    this._account.on('entry', function() {
        self.getOffers();
    });

    this._getsList = [];
    this._paysList = [];
    this._tradeTimes = 0;
    // this.getOffers();
}

util.inherits(Strategy, EventEmitter);

Strategy.prototype.getOffers = function() {
    var self = this;
    self._remote.requestAccountOffers(account, function() {
        if (arguments[1].offers.length != self._offers.length) {
            self._offers = arguments[1].offers; //the second parameters are offers info
            Logger.log(false, "right now the offers this account have:", self._offers);
        }

    });
}

Strategy.prototype.createOffer = function createOffer(pays, gets) {
    var self = this;

    if (typeof pays == 'object' && self._paysList.length > 0) {
        var payItems = _.filter(self._paysList, function(item) {
            return pays.currency == item.currency && item.issuer == pays.issuer;
        });
        Logger.log(true, "payItems:", payItems);
        if (payItems.length > 0) {
            return;
        }
    }

    if (typeof gets == 'object' && self._getsList.length > 0) {
        var getItems = _.filter(self._getsList, function(item) {
            return gets.currency == item.currency && gets.issuer == item.issuer;
        });
        Logger.log(true, "getItems:", getItems);
        if (getItems.length > 0) {
            return;
        }
    }

    if (self._offers.length > 0) {
        if (self.ifOfferExist(self._offers, pays, gets)) {
            return;
        }
    }

    self._remote.requestAccountOffers(account, function() {
        self._offers = arguments[1].offers;

        if (self.ifOfferExist(self._offers, pays, gets)) {
            return;
        }

        Logger.log(true, "we make a deal here:", pays, gets);

        if (typeof pays == 'object' && _.findWhere(self._paysList, pays) != undefined) {
            self._paysList.push(pays);
        }

        if (typeof gets == 'object' && _.findWhere(self._getsList, gets) != undefined) {
            self._getsList.push(gets);
        }

        Logger.log(false, "_paysList:", self._paysList);
        Logger.log(false, "_getsList:", self._getsList);

        self._tradeTimes = self._tradeTimes + 1;

        self._remote.transaction()
            .offerCreate(account, pays, gets)
            .secret(secret).submit();
    });


}

Strategy.prototype.ifOfferExist = function(offers, pays, gets) {
    return this.ifAlreadyCreateBid(offers, pays) || this.ifAlreadyCreateAsk(offers, gets);
}

Strategy.prototype.ifAlreadyCreateBid = function(offers, pays) {
    var self = this;
    if (typeof pays == 'object' && offers.length > 0) {
        var result = _.filter(offers, function(offer) {
            return offer.taker_pays.currency == pays.currency && offer.taker_pays.issuer == pays.issuer;
        });

        if (result.length > 0) {
            return true;
        }
    }

    return false;
}

Strategy.prototype.ifAlreadyCreateAsk = function(offers, gets) {
    var self = this;
    if (typeof gets == 'object' && offers.length > 0) {

        var result = _.filter(offers, function(offer) {
            return offer.taker_gets.currency == gets.currency && offer.taker_gets.issuer == gets.issuer;
        });

        if (result.length > 0) {
            return true;
        }
    }

    return false;
}

Strategy.prototype.whenBuyPriceChange = function(market) {
    this._buyMarkets = _.reject(this._buyMarkets, function(item) {
        return item._name == market._name;
    });

    this._buyMarkets.push(market);

    setTimeout(this.makeADealIfReachProfitRatio(), 3000);
}

Strategy.prototype.makeADealIfReachProfitRatio = function() {
    var buyMarket = _.max(this._buyMarkets, function(item) {
        return item._lowestPrice;
    });

    var sellMarket = _.min(this._sellMarkets, function(item) {
        return item._highestPrice;
    });
    Logger.log(false, 'buyMarkets:', this._buyMarkets, 'sellMarket:', this._sellMarkets);

    var profitIGive;
    if (buyMarket._lowestPrice - sellMarket._highestPrice > this._profitRatioIWant * sellMarket._highestPrice) {
        var totalIGetForBuy = maxAmountAllowed * drops;

        profitIGive = buyMarket._lowestPrice * this._profitRatioIGive;
        var totalIPayForBuy = {
            'currency': buyMarket._currency,
            'value': (buyMarket._lowestPrice - profitIGive) * totalIGetForBuy / drops + '', //even value should be string type
            'issuer': buyMarket._issuer
        }

        this.createOffer(totalIPayForBuy, totalIGetForBuy);

        var totalIPayForSell = maxAmountAllowed * drops;

        profitIGive = sellMarket._highestPrice * this._profitRatioIGive;
        var totalIGetForSell = {
            'currency': sellMarket._currency,
            'value': (sellMarket._highestPrice + profitIGive) * totalIPayForSell / drops + '',
            'issuer': sellMarket._issuer
        }

        this.createOffer(totalIPayForSell, totalIGetForSell);

        Logger.log(false, totalIPayForBuy, totalIGetForBuy, totalIPayForSell, totalIGetForSell);
    }
}

Strategy.prototype.whenSellPriceChange = function(market) {
    this._sellMarkets = _.reject(this._sellMarkets, function(item) {
        return item._name = market._name;
    });

    this._sellMarkets.push(market);

    this.makeADealIfReachProfitRatio();
}

Strategy.prototype.removeMarket = function(name) {
    this.removeListener(name + '-buy-price-change', this.whenBuyPriceChange);
    this.removeListener(name + '-sell-price-change', this.whenSellPriceChange);
}

var gCurrencies = [];

remote.connect(function() {
    remote.requestAccountLines(account, function() {
        var lines = arguments[1].lines;
        gCurrencies = _.map(lines, function(line) {
            delete line.limit;
            delete line.limit_peer;
            delete line.no_ripple;
            delete line.quality_in;
            delete line.quality_out;
            return line;
        });

        var currency1 = gCurrencies[indexStack[0]].currency;
        var currency2 = gCurrencies[indexStack[1]].currency;
        



    });
});

var size = 0;
var indexStack = [1, 0];

function nextIndexStack() {
    var index = _.first(indexStack);
    indexStack = _.rest(indexStack);
    index = (index + 1) % size;
    if (index == 0 && indexStack.length > 0) {
        indexStack = nextGIndexStack();
    }

    while (_.contains(indexStack, index)) {
        indexStack.unshift(index);
        indexStack = nextGIndexStack();
        index = _.first(indexStack);
        indexStack = _.rest(indexStack);
    }

    indexStack.unshift(index);
    return indexStack;
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

        if (size == 2) {
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

exports.LHStrategy = Strategy;