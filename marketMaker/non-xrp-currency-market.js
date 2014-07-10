var util = require('util');
var _ = require('underscore');
var EventEmitter = require('events').EventEmitter;
var Logger = require('./the-future-logger.js').TFLogger;

var config = require('./config.js');
var account = config.account;
var secret = config.secret;
var marketEvent = config.marketEvent;

function Market(remote, issuer_gets, currency_gets, name_issuer_gets, issuer_pays, currency_pays, name_issuer_pays) {
    EventEmitter.call(this);

    this._remote = remote;

    this._getsBook = remote.book(currency_gets, issuer_gets, currency_pays, issuer_pays);
    this._paysBook = remote.book(currency_pays, issuer_pays, currency_gets, issuer_pays);

    this._getsBook.on('model', function(offers) {
        var firstOffer = offers[0];

        var takerGets = firstOffer.TakerGets;
        var takerPays = firstOffer.TakerPays;

        if (takerGets.currency != currency_gets || takerGets.issuer != issuer_gets) {
            return;
        }
        if (takerPays.currency != currency_pays || takerPays.issuer != currency_pays) {
            return;
        }

        if (firstOffer.hasOwnProperty('taker_gets_funded')) {
            takerGets = firstOffer.taker_gets_funded;
        }
        if (firstOffer.hasOwnProperty('taker_pays_funded')) {
            takerPays = firstOffer.taker_pays_funded;
        }

        var priceIBuy = takerPays.value / takerGets.value;

        var market = {
            _name: name_issuer_gets,
            _issuer: issuer_gets,
            _currency: currency_gets,
            _priceIBuy: priceIBuy,
            _amountIBuy: takerGets.value
        }

        Logger.log(false, market);

        self.emit(self._name + marketEvent.gets, market);
    });

    this._paysBook.on('model', function(offers) {
        var firstOffer = offers[0];

        var takerGets = firstOffer.TakerGets;
        var takerPays = firstOffer.TakerPays;

        if (takerGets.currency != currency_gets || takerGets.issuer != issuer_gets) {
            return;
        }
        if (takerPays.currency != currency_pays || takerPays.issuer != currency_pays) {
            return;
        }

        if (firstOffer.hasOwnProperty('taker_gets_funded')) {
            takerGets = firstOffer.taker_gets_funded;
        }
        if (firstOffer.hasOwnProperty('taker_pays_funded')) {
            takerPays = firstOffer.taker_pays_funded;
        }

        var priceISell = takerGets.value / takerPays.value;

        var market = {
            _name: name_issuer_pays,
            _issuer: issuer_pays,
            _currency: currency_pays,
            _priceISell: priceISell,
            _amountISell: takerPays.value
        }

        Logger.log(false, market);

        self.emit(self._name + marketEvent.pays, market);

    })

}

util.inherits(Market, EventEmitter);


exports.Market = Market;