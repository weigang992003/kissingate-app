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

function Market(remote, issuer, currency, name, strategy) {
    EventEmitter.call(this);

    var self = this;

    this.asks = remote.book("XRP", "", currency, issuer);
    this.bids = remote.book(currency, issuer, "XRP", "");

    this.asks.on('model', handleAsks);
    this.bids.on('model', handleBids);

    function handleAsks(offers) {
        self.emit('model-change', offers, "asks", issuer + marketEvent.buy);
    }

    function handleBids(offers) {
        self.emit('model-change', offers, "bids", issuer + marketEvent.sell);
    }

    function emitFirstOrder(offers, action, eventName) {
        var newOffers = filterOffers(offers, action);

        var market = {
            name: name,
            issuer: issuer,
            currency: currency,
            price: newOffers[0].price.to_human().replace(',', '')
        }

        Logger.log(false, action, market);

        strategy.emit(eventName, market);
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

            if (!d.TakerPays.is_native() && d.TakerPays.currency().to_human() != currency) {
                Logger.log(true, "we filter the other currency order:" + d.TakerPays.currency().to_human());
                return false;
            }
            if (!d.TakerGets.is_native() && d.TakerGets.currency().to_human() != currency) {
                Logger.log(true, "we filter the other currency order:" + d.TakerGets.currency().to_human());
                return false;
            }

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

            return d;
        })));

        return newOffers;
    }


    strategy.on(issuer + marketEvent.buy, strategy.whenBuyPriceChange);
    strategy.on(issuer + marketEvent.sell, strategy.whenSellPriceChange);
}

util.inherits(Market, EventEmitter);

exports.XRMarket = Market;