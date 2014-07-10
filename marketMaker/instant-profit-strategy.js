var util = require('util');
var _ = require('underscore');
var EventEmitter = require('events').EventEmitter;

var config = require('./config.js');
var crypto = require('./crypto-util.js');
var Logger = require('./the-future-logger.js').TFLogger;

var drops = config.drops;
var account = config.account;
var encryptedSecret = config.secret;
var marketEvent = config.marketEvent;
var strategyEvents = config.strategyEvents;
var maxAmountAllowed = config.maxAmountAllowed;

function Strategy(remote) {
    var self = this;
    this.remote = remote;
    this.buyMarkets = [];
    this.sellMarkets = [];
    this.profitRatioIWant = 1 / 100;
    this.secret;

    crypto.decrypt(encryptedSecret, function(result) {
        self.secret = result;
        self.on(strategyEvents.deal, self.makeADeal);
    })
}

util.inherits(Strategy, EventEmitter);

Strategy.prototype.ifOfferExist = function(offers, pays, gets) {
    var self = this;

    var result = _.filter(offers, function(offer) {
        return offer.taker_pays.currency == pays.currency && offer.taker_pays.issuer == pays.issuer && offer.taker_gets.currency == gets.currency && offer.taker_gets.issuer == gets.issuer;
    });

    if (result.length > 0) {
        return true;
    }

    return false;
}

Strategy.prototype.whenBuyPriceChange = function(market) {
    var self = this;
    this.removeListener(market.issuer + marketEvent.buy, this.whenBuyPriceChange);

    this.buyMarkets = _.reject(this.buyMarkets, function(item) {
        return item.issuer == market.issuer;
    });

    this.buyMarkets.push(market);

    var buyMarket = _.min(this.buyMarkets, function(item) {
        return item.price;
    });

    var sellMarket = _.max(this.sellMarkets, function(item) {
        return item.price;
    });
    Logger.log(true, 'buyMarket:', buyMarket, 'sellMarket:', sellMarket);

    if (sellMarket.price - buyMarket.price > this.profitRatioIWant * buyMarket.price) {
        self.emit(strategyEvents.deal, buyMarket, sellMarket, market.issuer + marketEvent.buy, self.whenBuyPriceChange);
    } else {
        self.addListener(market.issuer + marketEvent.buy, self.whenBuyPriceChange);
    }
}

Strategy.prototype.whenSellPriceChange = function(market) {
    var self = this;
    this.removeListener(market.issuer + marketEvent.sell, this.whenSellPriceChange);

    this.sellMarkets = _.reject(this.sellMarkets, function(item) {
        return item.issuer = market.issuer;
    });

    this.sellMarkets.push(market);

    var buyMarket = _.min(this.buyMarkets, function(item) {
        return item.price;
    });

    var sellMarket = _.max(this.sellMarkets, function(item) {
        return item.price;
    });
    Logger.log(true, 'sellMarket:', sellMarket, 'buyMarket:', buyMarket);

    if (sellMarket.price - buyMarket.price > this.profitRatioIWant * buyMarket.price) {
        self.emit(strategyEvents.deal, buyMarket, sellMarket, market.issuer + marketEvent.sell, self.whenSellPriceChange);
    } else {
        self.addListener(market.issuer + marketEvent.sell, self.whenSellPriceChange);
    }
}

Strategy.prototype.makeADeal = function(buyMarket, sellMarket, eventNeedAddBack, listenerNeedAddBack) {
    var self = this;

    self.removeListener(strategyEvents.deal, self.makeADeal);
    var getsForBuy = maxAmountAllowed * drops;
    var paysForBuy = {
        currency: buyMarket.currency,
        value: (buyMarket.price) * maxAmountAllowed + '', //even value should be string type
        issuer: buyMarket.issuer
    }

    var paysForSell = maxAmountAllowed * drops;
    var getsForSell = {
        currency: sellMarket.currency,
        value: (sellMarket.price) * maxAmountAllowed + '',
        issuer: sellMarket.issuer
    }

    self.remote.requestAccountOffers(account, function() {
        var offers = arguments[1].offers;

        if (self.ifOfferExist(offers, paysForBuy, getsForBuy) || self.ifOfferExist(offers, paysForSell, getsForSell)) {
            self.addListener(strategyEvents.deal, self.makeADeal);
            self.addListener(eventNeedAddBack, listenerNeedAddBack);
            return;
        }

        Logger.log(true, "we make a deal here:", paysForBuy, getsForBuy, paysForSell, getsForSell);

        self.remote.transaction()
            .offerCreate(account, paysForBuy, getsForBuy)
            .secret(self.secret).on("success", function() {

                self.remote.transaction().offerCreate(account, paysForSell, getsForSell)
                    .secret(self.secret).on("success", function() {
                        self.addListener(strategyEvents.deal, self.makeADeal);
                        self.addListener(eventNeedAddBack, listenerNeedAddBack);
                    }).submit();

            }).submit();
    });

    Logger.log(false, paysForBuy, getsForBuy, paysForSell, getsForSell);
}

exports.IPStrategy = Strategy;