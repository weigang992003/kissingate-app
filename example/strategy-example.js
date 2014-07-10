var util = require('util');
var _ = require('underscore');
var EventEmitter = require('events').EventEmitter;

function Strategy() {
    this.emit('aaa', 'aaaa');
    this.on('aaa', this.abc);
}

util.inherits(Strategy, EventEmitter);

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

Strategy.prototype.abc = function() {
    // this.removeListener('aaa', this.abc);
    console.log(util.inspect(this.listeners('aaa')));
}

var offers = [{
    flags: 0,
    seq: 2268,
    taker_gets: {
        currency: 'CNY',
        issuer: 'rM8199qFwspxiWNZRChZdZbGN5WrCepVP1',
        value: '100'
    },
    taker_pays: {
        currency: 'CNY',
        issuer: 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA',
        value: '100'
    }
}, {
    flags: 0,
    seq: 2269,
    taker_gets: {
        currency: 'CNY',
        issuer: 'rM8199qFwspxiWNZRChZdZbGN5WrCepVP1',
        value: '100'
    },
    taker_pays: {
        currency: 'CNY',
        issuer: 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK',
        value: '100'
    }
}, {
    flags: 0,
    seq: 2270,
    taker_gets: {
        currency: 'CNY',
        issuer: 'rM8199qFwspxiWNZRChZdZbGN5WrCepVP1',
        value: '50'
    },
    taker_pays: {
        currency: 'CNY',
        issuer: 'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y',
        value: '50'
    }
}, {
    flags: 0,
    seq: 2271,
    taker_gets: {
        currency: 'USD',
        issuer: 'rPDXxSZcuVL3ZWoyU82bcde3zwvmShkRyF',
        value: '1.08'
    },
    taker_pays: '300000000'
}, {
    flags: 0,
    seq: 2272,
    taker_gets: {
        currency: 'CNY',
        issuer: 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA',
        value: '0.0001'
    },
    taker_pays: '1000000'
}, {
    flags: 0,
    seq: 2273,
    taker_gets: {
        currency: 'CNY',
        issuer: 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA',
        value: '0.0001'
    },
    taker_pays: '1000000'
}];

var pays = {
    'currency': 'CNY',
    'value': '1',
    'issuer': 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA'
}

var gets = {
    currency: 'CNY',
    value: '1',
    issuer: 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA'
}

var strategy = new Strategy();
console.log(strategy.ifOfferExist(offers, pays, 100));
console.log(strategy.ifOfferExist(offers, 100, gets));
strategy.abc();