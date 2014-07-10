// Routines for working with an orderbook.
//
// One OrderBook object represents one half of an order book. (i.e. bids OR
// asks) Which one depends on the ordering of the parameters.
//
// Events:
//  - transaction   A transaction that affects the order book.

// var network = require("./network.js");

var EventEmitter = require('events').EventEmitter;
var util         = require('util');
var extend       = require('extend');
var Amount       = require('./amount').Amount;
var UInt160      = require('./uint160').UInt160;
var Currency     = require('./currency').Currency;

function OrderBook(remote, currency_gets, issuer_gets, currency_pays, issuer_pays) {
  EventEmitter.call(this);

  var self            = this;

  this._remote        = remote;
  this._currency_gets = currency_gets;
  this._issuer_gets   = issuer_gets;
  this._currency_pays = currency_pays;
  this._issuer_pays   = issuer_pays;
  this._subs          = 0;

  // We consider ourselves synchronized if we have a current copy of the offers,
  // we are online and subscribed to updates.
  this._sync         = false;

  // Offers
  this._offers       = [ ];

  function listenerAdded(type, listener) {
    if (~OrderBook.subscribe_events.indexOf(type)) {
      self._subs += 1;
      if (self._subs == 1 && self._remote._connected) {
        self._subscribe();
      }
    }
  };

  this.on('newListener', listenerAdded);

  function listenerRemoved(type, listener) {
    if (~OrderBook.subscribe_events.indexOf(type)) {
      self._subs -= 1;
      if (!self._subs && self._remote._connected) {
        self._sync = false;
        self._remote.request_unsubscribe()
        .books([self.to_json()])
        .request();
      }
    }
  };

  this.on('removeListener', listenerRemoved);

  // ST: This *should* call _prepareSubscribe.
  this._remote.on('prepare_subscribe', function(request) {
    self._subscribe(request);
  });

  function remoteDisconnected() {
    self._sync = false;
  };

  this._remote.on('disconnect', remoteDisconnected);

  return this;
};

util.inherits(OrderBook, EventEmitter);

/**
 * List of events that require a remote subscription to the orderbook.
 */
OrderBook.subscribe_events = ['transaction', 'model', 'trade'];

/**
 * Subscribes to orderbook.
 *
 * @private
 */
OrderBook.prototype._subscribe = function (request) {
  var self = this;

  if (self.is_valid() && self._subs) {
    var request = this._remote.request_subscribe();
    request.addBook(self.to_json(), true);

    request.once('success', function(res) {
      self._sync   = true;
      self._offers = res.offers;
      self.emit('model', self._offers);
    });

    request.once('error', function(err) {
      // XXX What now?
    });

    request.request();
  }
};

/**
 * Adds this orderbook to a subscription request.

// ST: Currently this is not working because the server cannot give snapshots
//     for more than one order book in the same subscribe message.

OrderBook.prototype._prepareSubscribe = function (request) {
  var self = this;
  if (self.is_valid() && self._subs) {
    request.addBook(self.to_json(), true);
    request.once('success', function(res) {
      self._sync   = true;
      self._offers = res.offers;
      self.emit('model', self._offers);
    });
    request.once('error', function(err) {
      // XXX What now?
    });
  }
};
 */

OrderBook.prototype.to_json = function () {
  var json = {
    taker_gets: {
      currency: this._currency_gets
    },
    taker_pays: {
      currency: this._currency_pays
    }
  };

  if (this._currency_gets !== 'XRP') {
    json['taker_gets']['issuer'] = this._issuer_gets;
  }

  if (this._currency_pays !== 'XRP') {
    json['taker_pays']['issuer'] = this._issuer_pays;
  }

  return json;
};

/**
 * Whether the OrderBook is valid.
 *
 * Note: This only checks whether the parameters (currencies and issuer) are
 *       syntactically valid. It does not check anything against the ledger.
 */
OrderBook.prototype.is_valid = function () {
  // XXX Should check for same currency (non-native) && same issuer
  return (
    Currency.is_valid(this._currency_pays) &&
    (this._currency_pays === 'XRP' || UInt160.is_valid(this._issuer_pays)) &&
    Currency.is_valid(this._currency_gets) &&
    (this._currency_gets === 'XRP' || UInt160.is_valid(this._issuer_gets)) &&
    !(this._currency_pays === 'XRP' && this._currency_gets === 'XRP')
  );
};

OrderBook.prototype.trade = function(type) {
  var tradeStr = '0'
  + ((this['_currency_' + type] === 'XRP') ? '' : '/'
     + this['_currency_' + type ] + '/'
     + this['_issuer_' + type]);
  return Amount.from_json(tradeStr);
};

/**
 * Notify object of a relevant transaction.
 *
 * This is only meant to be called by the Remote class. You should never have to
 * call this yourself.
 */
OrderBook.prototype.notify = function (message) {
  var self       = this;
  var changed    = false;
  var trade_gets = this.trade('gets');
  var trade_pays = this.trade('pays');

  function handleTransaction(an) {
    if (an.entryType !== 'Offer') return;

    var i, l, offer;

    switch(an.diffType) {
      case 'DeletedNode':
      case 'ModifiedNode':
        var deletedNode = an.diffType === 'DeletedNode';

        for (i = 0, l = self._offers.length; i < l; i++) {
          offer = self._offers[i];
          if (offer.index === an.ledgerIndex) {
            if (deletedNode) {
              self._offers.splice(i, 1);
            } else {
              extend(offer, an.fieldsFinal);
            }
            changed = true;
            break;
          }
        }

        // We don't want to count a OfferCancel as a trade
        if (message.transaction.TransactionType === 'OfferCancel') return;

        trade_gets = trade_gets.add(an.fieldsPrev.TakerGets);
        trade_pays = trade_pays.add(an.fieldsPrev.TakerPays);

        if (!deletedNode) {
          trade_gets = trade_gets.subtract(an.fieldsFinal.TakerGets);
          trade_pays = trade_pays.subtract(an.fieldsFinal.TakerPays);
        }
        break;

      case 'CreatedNode':
        var price = Amount.from_json(an.fields.TakerPays).ratio_human(an.fields.TakerGets);

        for (i = 0, l = self._offers.length; i < l; i++) {
          offer = self._offers[i];
          var priceItem = Amount.from_json(offer.TakerPays).ratio_human(offer.TakerGets);

          if (price.compareTo(priceItem) <= 0) {
            var obj   = an.fields;
            obj.index = an.ledgerIndex;
            self._offers.splice(i, 0, an.fields);
            changed = true;
            break;
          }
        }
        break;
    }
  };

  message.mmeta.each(handleTransaction);

  // Only trigger the event if the account object is actually
  // subscribed - this prevents some weird phantom events from
  // occurring.
  if (this._subs) {
    this.emit('transaction', message);
    if (changed) {
      this.emit('model', this._offers);
    }
    if (!trade_gets.is_zero()) {
      this.emit('trade', trade_pays, trade_gets);
    }
  }
};

OrderBook.prototype.notifyTx = OrderBook.prototype.notify;

/**
 * Get offers model asynchronously.
 *
 * This function takes a callback and calls it with an array containing the
 * current set of offers in this order book.
 *
 * If the data is available immediately, the callback may be called synchronously.
 */
OrderBook.prototype.offers = function (callback) {
  var self = this;
  if (typeof callback === 'function') {
    if (this._sync) {
      callback(this._offers);
    } else {
      this.once('model', callback);
    }
  }
  return this;
};

/**
 * Return latest known offers.
 *
 * Usually, this will just be an empty array if the order book hasn't been
 * loaded yet. But this accessor may be convenient in some circumstances.
 */
OrderBook.prototype.offersSync = function () {
  return this._offers;
};

exports.OrderBook = OrderBook;

// vim:sw=2:sts=2:ts=8:et
