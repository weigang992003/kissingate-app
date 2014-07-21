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

    this.buyPlan;
    this.sellPlan;
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

Strategy.prototype.whenBuyPriceChange = function(buyPlan) {
    var self = this;
    this.removeListener(marketEvent.buy, this.whenBuyPriceChange);

    self.buyPlan = buyPlan;

    var buyPlan = self.buyPlan;
    var sellPlan = self.sellPlan;

    if (buyPlan == undefined || sellPlan == undefined) {
        return;
    }

    Logger.log(true, 'buyPlan:', buyPlan, 'sellPlan:', sellPlan);

    if (buyPlan.price > 1.001 && sellPlan.price < 0.999) {
        self.emit(strategyEvents.deal, buyPlan, sellPlan, marketEvent.buy, self.whenBuyPriceChange);
    } else {
        self.addListener(marketEvent.buy, self.whenBuyPriceChange);
    }
}

Strategy.prototype.whenSellPriceChange = function(sellPlan) {
    var self = this;
    this.removeListener(marketEvent.sell, this.whenSellPriceChange);

    self.sellPlan = sellPlan;

    var buyPlan = self.buyPlan;
    var sellPlan = self.sellPlan;

    if (!buyPlan || !sellPlan) {
        return;
    }

    Logger.log(true, 'sellPlan:', sellPlan, 'buyPlan:', buyPlan);
    if (buyPlan.price > 1.001 && sellPlan.price < 0.999) {
        self.emit(strategyEvents.deal, buyPlan, sellPlan, marketEvent.sell, self.whenSellPriceChange);
    } else {
        self.addListener(marketEvent.sell, self.whenSellPriceChange);
    }

}

Strategy.prototype.makeADeal = function(buyPlan, sellPlan, eventNeedAddBack, listenerNeedAddBack) {
    var self = this;

    self.removeListener(strategyEvents.deal, self.makeADeal);

    var getsForBuy = buyPlan.taker_gets;
    getsForBuy['value'] = 10 + '';
    var paysForBuy = buyPlan.taker_pays;
    paysForBuy['value'] = buyPlan.price + '';

    var paysForSell = sellPlan.taker_pays;
    paysForSell['value'] = 10 + '';
    var getsForSell = sellPlan.taker_gets;
    getsForSell['value'] = sellPlan.price + '';

    self.remote.requestAccountOffers(account, function() {
        var offers = arguments[1].offers;
        Logger.log(true, "we may have chance to make a deal", paysForBuy, getsForBuy, paysForSell, getsForSell);

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
                        self.buyPlan = undefined;
                        self.sellPlan = undefined;
                    }).submit();
            }).submit();
    });

    Logger.log(false, paysForBuy, getsForBuy, paysForSell, getsForSell);
}

exports.SCStrategy = Strategy;