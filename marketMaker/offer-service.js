var _ = require('underscore');
var math = require('mathjs');
var aim = require('./account-info-manager.js');
var Amount = require('./amount-util.js').Amount;
var AmountUtil = require('./amount-util.js').AmountUtil;
var FirstOrderUtil = require('./first-order-util.js').FirstOrderUtil;

var au = new AmountUtil();
var fou = new FirstOrderUtil();

function OfferService(r, a, s) {
    this.remote = r;
    this.secret = s;
    this.accountId = a;
    this.offers = [];
}

OfferService.prototype.getOffers = function(callback) {
    var self = this;
    var remote = this.remote;
    var accountId = this.accountId;

    remote.requestAccountOffers(accountId, function(err, result) {
        _.each(result.offers, function(offer) {
            offer.quality = au.calPrice(offer.taker_pays, offer.taker_gets);
            self.offers.push(offer);
        });

        console.log("get offers success");

        if (callback) {
            callback(self.offers);
        }
    });
};

OfferService.prototype.ifOfferExist = function(pays, gets) {
    var offers = this.offers;

    var result = findOffer(pays, gets);

    if (result.length > 0) {
        return true;
    }

    return false;
}

function findOffer(pays, gets) {
    var offers = this.offers;

    if (offers.length == 0) {
        return false;
    }

    if (pays instanceof Amount) {
        pays = pays.to_json();
    }
    if (gets instanceof Amount) {
        gets = gets.to_json();
    }

    var result = _.filter(offers, function(offer) {
        return offer.taker_pays.currency == pays.currency && offer.taker_pays.issuer == pays.issuer && offer.taker_gets.currency == gets.currency && offer.taker_gets.issuer == gets.issuer;
    });

    return result;
}

OfferService.prototype.createOffer = function(taker_pays, taker_gets, logger, createFO, callback) {
    var self = this;
    var remote = this.remote;
    var secret = this.secret;
    var accountId = this.accountId;
    var offers = this.offers;

    if (self.ifOfferExist(taker_pays, taker_gets)) {
        console.log("offer already exist!!!!");
        return;
    }

    self.offers.push({
        'taker_pays': taker_pays,
        'taker_gets': taker_gets
    });

    console.log("start to create offer!!!");

    var tx = remote.transaction();
    if (secret) {
        tx.secret(secret);
    } else {
        return;
    }

    console.log("we are create offer here", "taker_pays", taker_pays, "taker_gets", taker_gets);
    if (logger)
        logger.log(true, "we are create offer here", "taker_pays", taker_pays, "taker_gets", taker_gets);

    tx.offerCreate(accountId, taker_pays, taker_gets);
    tx.on("success", function(res) {
        self.getOffers();
        if (createFO) {
            var quality = au.calPrice(taker_pays, taker_gets);
            fou.createFirstOffer({
                status: 'live',
                quality: quality,
                seq: res.transaction.Sequence,
                ledger_index: res.ledger_index,
                account: res.transaction.Account,
                src_currency: au.getCurrency(taker_gets),
                dst_currency: au.getCurrency(taker_pays),
            });
        }
    });

    tx.on('proposed', function(res) {
        if (callback) {
            callback("success");
        }
    });

    tx.on("error", function(res) {
        if (callback) {
            callback(res);
        }
    });

    tx.submit();
}

OfferService.prototype.createFirstOffer = function(taker_pays, taker_gets, removeOld, logger, callback) {
    var result = findOffer(taker_pays, taker_gets);
    if (result) {
        if (fou.isFirstOrder(result[0]) && removeOld) {
            cancelOffer(result[0], function() {
                createOffer(taker_pays, taker_gets, logger, false, callback);
            });
        } else {
            createOffer(taker_pays, taker_gets, logger, false, callback);
        }
    } else {
        createOffer(taker_pays, taker_gets, logger, false, callback);
    }
}

function cancelOffer(offer, callback) {
    remote.transaction().offerCancel(accountId, offer.seq).secret(secret).on('success', function() {
        console.log('offerCancel', offer.taker_pays, offer.taker_gets);

        fou.setFirstOrderDead({
            'seq': offer.seq,
            'account': accountId
        }, function() {
            if (callback) {
                callback();
            }
        });
    }).submit();
}

OfferService.prototype.cancelOfferUnderSameBook = function(pays, gets) {
    var offers = this.offers;
    var secret = this.secret;
    var accountId = this.accountId;

    var offersCancel = _.filter(offers, function(offer) {
        return offer.taker_pays.currency == pays.currency && offer.taker_pays.issuer == pays.issuer &&
            offer.taker_gets.currency == gets.currency && offer.taker_gets.issuer == gets.issuer;
    });

    _.each(offersCancel, function(offer) {
        remote.transaction().offerCancel(accountId, offer.seq).secret(secret).on('success', function() {
            console.log('offerCancel', offer.taker_pays, offer.taker_gets);
        }).submit();
    });
}

OfferService.prototype.allExist = function(offers) {
    var self = this;
    var allIsExist = true;

    offers.every(function(offer) {
        allIsExist = self.ifOfferExist(offer.TakerPays, offer.TakerGets);
        return allIsExist;
    })

    return allIsExist;
}

OfferService.prototype.atLeastExistOne = function(offers, reversed) {
    var self = this;
    var existOne = false;

    offers.every(function(offer) {
        if (reversed) {
            existOne = self.ifOfferExist(offer.TakerGets, offer.TakerPays);
        } else {
            existOne = self.ifOfferExist(offer.TakerPays, offer.TakerGets);
        }
        return !existOne;
    })

    return existOne;
}

exports.OfferService = OfferService;