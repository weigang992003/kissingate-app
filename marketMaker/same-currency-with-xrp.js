var util = require('util');
var _ = require('underscore');

var EventEmitter = require('events').EventEmitter;

var config = require('./config.js');
var account = config.account;
var secret = config.secret;

var drops = 1000000;
var maxAmountAllowed = 100 * drops;

function Market(remote, issuer, currency, name) {
    EventEmitter.call(this);
    var self = this;

    this._index = 0;

    this._remote = remote;

    this._name = name;
    this._issuer = issuer;
    this._currency = currency;

    //we talk about xrp here, so we use numberic type to represent it
    this._priceIBuy = 0;
    this._amountIBuy = 0;

    this._priceISell = 0;
    this._amountISell = 0;

    this._buyXrpBook = remote.book("XRP", "", this._currency, this._issuer); //means I can buy xro from this book
    this._sellXrpBook = remote.book(this._currency, this._issuer, "XRP", ""); //means I can sell xrp in this book

    this._markets = [];

    this._buyXrpBook.on('model', function(offers) {
        self.log(false, self._name + ' buy price change index:' + self._index++);

        var cheapestOne = offers[0];

        var priceIBuy;
        if (cheapestOne.quality == undefined) {
            priceIBuy = (cheapestOne.TakerPays.value / cheapestOne.TakerGets) * drops;
        } else {
            priceIBuy = cheapestOne.quality * drops;
        }

        if (self._priceIBuy != 0 && priceIBuy == self._priceIBuy) {
            return;
        }

        self._priceIBuy = priceIBuy;
        self._amountIBuy = cheapestOne.TakerGets;
        if (cheapestOne.hasOwnProperty('taker_gets_funded')) {
            self._amountIBuy = cheapestOne.taker_gets_funded;
        }

        var market = {
            _name: self._name,
            _issuer: self._issuer,
            _currency: self._currency,
            _priceIBuy: self._priceIBuy,
            _amountIBuy: self._amountIBuy
        }

        self.log(false, market);

        self.emit(self._name + '-buy-price-change', market);
    });

    this._sellXrpBook.on('model', function(offers) {
        self.log(false, self._name + ' sell price change index:' + self._index++);

        var highestOffer = offers[0];

        var priceISell = (highestOffer.TakerGets.value / highestOffer.TakerPays) * drops;

        if (self._priceISell != 0 && priceISell == self._priceISell) {
            return;
        }

        self._priceISell = priceISell;
        self._amountISell = highestOffer.TakerPays;

        if (highestOffer.hasOwnProperty('taker_pays_funded')) {
            self._amountISell = highestOffer.taker_pays_funded;
        }

        var market = {
            _name: self._name,
            _issuer: self._issuer,
            _currency: self._currency,
            _priceISell: self._priceISell,
            _amountISell: self._amountISell
        }

        self.log(false, market);

        self.emit(this._name + '-sell-price-change', market);
    });
}

util.inherits(Market, EventEmitter);


Market.prototype.buyFromSeller = function(pays, gets) {
    this.createOffer(pays, gets);
}

Market.prototype.sellToBuyer = function(pays, gets) {
    this.createOffer(pays, gets);
}

Market.prototype.createOffer = function createOffer(pays, gets) {
    this.log(true, pays, gets);
    // this._remote.transaction()
    //     .offerCreate(account, pays, gets)
    //     .secret(secret)
    //     .submit();
}

Market.prototype.addMarket = function(market) {
    market.on(market._name + '-buy-price-change', this.whenBuyPriceChange);
    market.on(market._name + '-sell-price-change', this.whenSellPriceChange);
};

Market.prototype.whenBuyPriceChange = function(market) {
    if (this._priceISell > market._priceIBuy) {
        var totalIGetForBuy = _.min([this._amountISell, market._amountIBuy, maxAmountAllowed]);
        var totalIPayForBuy = {
            name: market._name,
            issuer: market._issuer,
            currency: market._currency,
            value: (market._priceIBuy * totalIGetForBuy) / drops
        }

        this.buyFromSeller(totalIPayForBuy, totalIGetForBuy);

        var totalIPayForSell = (totalIPayForBuy.value / this._priceISell) * drops;
        var totalIGetForSell = {
            issuer: this._issuer,
            currency: this._currency,
            value: totalIPayForBuy.value
        }
        this.sellToBuyer(totalIPayForSell, totalIGetForSell);

        this.log(true, totalIPayForBuy, totalIGetForBuy, totalIPayForSell, totalIGetForSell);

    }
}

Market.prototype.whenSellPriceChange = function(market) {
    if (this._priceIBuy < market._priceISell) {
        var totalIGetForBuy = _.min([this._amountIBuy, market._amountISell, maxAmountAllowed]);
        var totalIPayForBuy = {
            name: this._name,
            issuer: this._issuer,
            currency: this._currency,
            value: (this._priceIBuy * totalIGetForBuy) / drops
        }

        this.buyFromSeller(totalIPayForBuy, totalIGetForBuy);

        var totalIPayForSell = (totalIPayForBuy.value / market._priceISell) * drops;
        var totalIGetForSell = {
            issuer: market._issuer,
            currency: market._currency,
            value: totalIPayForBuy.value
        }
        this.sellToBuyer(totalIPayForSell, totalIGetForSell);

        this.log(true, totalIPayForBuy, totalIGetForBuy, totalIPayForSell, totalIGetForSell);

    }
}

Market.prototype.removeMarket = function(name) {
    _.without(this._markets, name + '-buy-price-change', name + '-sell-price-change');
    this.removeListener(name + '-buy-price-change', this.whenBuyPriceChange);
    this.removeListener(name + '-sell-price-change', this.whenSellPriceChange);
}

Market.prototype.log = function() {
    var arguNum = arguments.length;
    if (arguNum == 0) {
        return;
    }
    if (arguments[0]) { //check if we want to log something, this value is boolean type.
        for (var i = 1; i < arguNum; i = i + 1) {
            console.dir(arguments[i]);
        }
    }
}


exports.Market = Market;