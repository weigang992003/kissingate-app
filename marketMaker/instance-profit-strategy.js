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
    this.buyPlans = [];
    this.sellPlans = [];
    this.profitRatioIWant = 3 / 1000;
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

    this.buyPlans = _.reject(this.buyPlans, function(item) {
        return item.issuer == market.issuer;
    });

    this.buyPlans.push(market);

    var buyPlan = _.min(this.buyPlans, function(item) {
        return item.price;
    });

    var sellPlan = _.max(this.sellPlans, function(item) {
        return item.price;
    });
    Logger.log(false, 'buyPlan:', buyPlan, 'sellPlan:', sellPlan);

    if (sellPlan.price - buyPlan.price > this.profitRatioIWant * buyPlan.price) {
        self.emit(strategyEvents.deal, buyPlan, sellPlan, market.issuer + marketEvent.buy, self.whenBuyPriceChange);
    } else {
        self.addListener(market.issuer + marketEvent.buy, self.whenBuyPriceChange);
    }
}

Strategy.prototype.whenSellPriceChange = function(market) {
    var self = this;
    this.removeListener(market.issuer + marketEvent.sell, this.whenSellPriceChange);

    this.sellPlans = _.reject(this.sellPlans, function(item) {
        return item.issuer = market.issuer;
    });

    this.sellPlans.push(market);

    var buyPlan = _.min(this.buyPlans, function(item) {
        return item.price;
    });

    var sellPlan = _.max(this.sellPlans, function(item) {
        return item.price;
    });
    Logger.log(false, 'sellPlan:', sellPlan, 'buyPlan:', buyPlan);

    if (sellPlan.price - buyPlan.price > this.profitRatioIWant * buyPlan.price) {
        self.emit(strategyEvents.deal, buyPlan, sellPlan, market.issuer + marketEvent.sell, self.whenSellPriceChange);
    } else {
        self.addListener(market.issuer + marketEvent.sell, self.whenSellPriceChange);
    }
}

Strategy.prototype.makeADeal = function(buyPlan, sellPlan, eventNeedAddBack, listenerNeedAddBack) {
    var self = this;

    self.removeListener(strategyEvents.deal, self.makeADeal);


    self.remote.requestAccountOffers(account, function() {
        var offers = arguments[1].offers;


        remote.requestAccountLines(account, function() {
            var lines = arguments[1].lines;
            var trsutLine = _.find(lines, function(line) {
                return line.account == buyPlan.issuer && line.currency == buyPlan.currency;
            });

            //if balance is too low, we don't make any deal.
            if (trsutLine.balance < 0.001) {
                self.addListener(strategyEvents.deal, self.makeADeal);
                self.addListener(eventNeedAddBack, listenerNeedAddBack);
                return;
            }

            var volumn = _.min(buyPlan.sum, balance.balance / buyPlan.price, sellPlan.sum);
            Logger.log(true, "the volumn we will make in this deal:" + volumn);

            var paysForSell = {
                currency: sellPlan.currency,
                value: (sellPlan.price) * volumn + '',
                issuer: sellPlan.issuer
            }
            var getsForSell = volumn * drops;

            var getsForBuy = {
                currency: buyPlan.currency,
                value: paysForSell.value + '', //even value should be string type
                issuer: buyPlan.issuer
            }
            var paysForBuy = drops * paysForSell.value / buyPlan.price;

            Logger.log(false, "we may have chance to make a deal", paysForBuy, getsForBuy, paysForSell, getsForSell);

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
                            self.buyPlans = [];
                            self.sellPlans = [];
                        }).submit();

                }).submit();
        });


    });

    Logger.log(false, paysForBuy, getsForBuy, paysForSell, getsForSell);
}

exports.IPStrategy = Strategy;