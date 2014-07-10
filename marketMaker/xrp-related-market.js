var util = require('util');
var _ = require('underscore');
var mathjs = require('mathjs');
var EventEmitter = require('events').EventEmitter;
var Logger = require('./the-future-logger.js').TFLogger;

var config = require('./config.js');
var drops = config.drops;
var secret = config.secret;
var account = config.account;
var marketEvent = config.marketEvent;

function Market(remote, issuer, currency, name, strategy) {
    EventEmitter.call(this);

    var self = this;

    this._remote = remote;

    this._buyXrpBook = remote.book("XRP", "", currency, issuer); //means I can buy xro from this book
    this._sellXrpBook = remote.book(currency, issuer, "XRP", ""); //means I can sell xrp in this book

    this._buyXrpBook.on('model', function(offers) {
        var cheapestOne = offers[0];

        var buyPrice;
        if (cheapestOne.quality == undefined) {
            buyPrice = (cheapestOne.TakerPays.value / cheapestOne.TakerGets) * drops;
        } else {
            buyPrice = cheapestOne.quality * drops;
        }
        buyPrice = mathjs.round(buyPrice, 5);

        if (cheapestOne.TakerPays.currency != currency) {
            Logger.log(true, "we filter same buy price change:" + buyPrice);
            return;
        }

        var market = {
            name: name,
            issuer: issuer,
            currency: currency,
            price: buyPrice
        }

        Logger.log(false, market);

        strategy.emit(issuer + marketEvent.buy, market);
    });

    this._sellXrpBook.on('model', function(offers) {
        var highestOffer = offers[0];

        var sellPrice = (highestOffer.TakerGets.value / highestOffer.TakerPays) * drops;
        sellPrice = mathjs.round(sellPrice, 5);

        if (highestOffer.TakerGets.currency != currency) {
            Logger.log(true, "we filter same sell price change:" + sellPrice);
            return;
        }

        var market = {
            name: name,
            issuer: issuer,
            currency: currency,
            price: sellPrice
        }

        Logger.log(false, market);

        strategy.emit(issuer + marketEvent.sell, market);
    });

    strategy.on(issuer + marketEvent.buy, strategy.whenBuyPriceChange);
    strategy.on(issuer + marketEvent.sell, strategy.whenSellPriceChange);
}

util.inherits(Market, EventEmitter);

exports.XRMarket = Market;