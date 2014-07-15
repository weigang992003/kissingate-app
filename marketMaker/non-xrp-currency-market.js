var util = require('util');
var _ = require('underscore');
var mathjs = require('mathjs');
var EventEmitter = require('events').EventEmitter;

var Logger = require('./the-future-logger.js').TFLogger;
var ripple = require('../src/js/ripple');
var rpamount = require('./rpamount.js');
var config = require('./config.js');
var drops = config.drops;
var secret = config.secret;
var account = config.account;
var marketEvent = config.marketEvent;
var Amount = ripple.Amount;

function Market(remote, issuer1, currency1, name_issuer1,
    issuer2, currency2, name_issuer2, strategy) {
    var self = this;

    EventEmitter.call(this);

    this.exchangeCurrency1 = remote.book(currency1, issuer1, currency2, issuer2);
    this.exchangeCurrency2 = remote.book(currency2, issuer2, currency1, issuer1);

    this.exchangeCurrency1.offers(function(offers) {
        self.emit('model-change', offers, "asks", marketEvent.buy);
    });

    this.exchangeCurrency2.offers(function(offers) {
        self.emit('model-change', offers, "bids", marketEvent.sell);
    });

    this.exchangeCurrency1.on('model', handleAsks);
    this.exchangeCurrency2.on('model', handleBids);

    function handleAsks(offers) {
        self.emit('model-change', offers, "asks", marketEvent.buy);
    }

    function handleBids(offers) {
        self.emit('model-change', offers, "bids", marketEvent.sell);
    }

    function emitFirstOrder(offers, action, eventName) {
        var newOffers = filterOffers(offers, action);

        if (action == "asks") {
            var sellCurrency1 = {
                "taker_pays": {
                    name: name_issuer2,
                    currency: currency2,
                    issuer: issuer2
                },
                "taker_gets": {
                    name: name_issuer1,
                    currency: currency1,
                    issuer: issuer1
                },
                "price": parseFloat(newOffers[0].price)
            }

            Logger.log(true, action, sellCurrency1);

            strategy.emit(eventName, sellCurrency1);
        } else {
            var sellCurrency2 = {
                "taker_pays": {
                    name: name_issuer1,
                    currency: currency1,
                    issuer: issuer1
                },
                "taker_gets": {
                    name: name_issuer2,
                    currency: currency2,
                    issuer: issuer2
                },
                "price": parseFloat(newOffers[0].price)
            }

            Logger.log(true, action, sellCurrency2);

            strategy.emit(eventName, sellCurrency2);
        }
    }

    self.on('model-change', emitFirstOrder);

    function filterOffers(offers, action) {
        var lastprice;
        var rowCount = 0;
        var max_rows = 1;
        newOffers = _.values(_.compact(_.map(offers, function(d, i) {
            if (rowCount > max_rows) return false;

            if (d.hasOwnProperty('taker_gets_funded')) {
                d.TakerGets = d.taker_gets_funded;
                d.TakerPays = d.taker_pays_funded;
            }

            d.TakerGets = Amount.from_json(d.TakerGets);
            d.TakerPays = Amount.from_json(d.TakerPays);

            d.price = Amount.from_quality(d.BookDirectory, "1", "1");

            if (action !== "asks") d.price = Amount.from_json("1/1/1").divide(d.price);

            // Adjust for drops: The result would be a million times too large.
            if (d[action === "asks" ? "TakerPays" : "TakerGets"].is_native())
                d.price = d.price.divide(Amount.from_json("1000000"));

            // Adjust for drops: The result would be a million times too small.
            if (d[action === "asks" ? "TakerGets" : "TakerPays"].is_native())
                d.price = d.price.multiply(Amount.from_json("1000000"));

            var price = rpamount(d.price, {
                rel_precision: 4,
                rel_min_precision: 2
            });

            if (d.Account == account) {
                d.my = true;
            }

            if (lastprice === price && !d.my) {
                offers[current].TakerPays = Amount.from_json(offers[current].TakerPays).add(d.TakerPays);
                offers[current].TakerGets = Amount.from_json(offers[current].TakerGets).add(d.TakerGets);
                d = false;
            } else current = i;

            if (!d.my)
                lastprice = price;

            if (d) rowCount++;

            if (rowCount > max_rows) return false;

            d.price = price;

            return d;
        })));

        return newOffers;
    }

    strategy.on(marketEvent.buy, strategy.whenBuyPriceChange);
    strategy.on(marketEvent.sell, strategy.whenSellPriceChange);
}

util.inherits(Market, EventEmitter);


exports.NXCMarket = Market;