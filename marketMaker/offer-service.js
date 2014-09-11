var _ = require('underscore');
var math = require('mathjs');
var aim = require('./account-info-manager.js');
var Amount = require('./amount-util.js').Amount;
var AmountUtil = require('./amount-util.js').AmountUtil;
var exeCmd = require('./web-socket-book-util.js').exeCmd;
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
        self.offers = [];
        _.each(result.offers, function(offer) {
            offer.quality = au.calPrice(offer.taker_pays, offer.taker_gets);
            self.offers.push(offer);
        });

        console.log("get offers success");

        if (callback) {
            callback("success");
        }
    });
};

OfferService.prototype.ifOfferExist = function(pays, gets) {
    var offers = this.offers;

    var result = findSameBookOffer(offers, pays, gets);

    if (result.length > 0) {
        return true;
    }

    return false;
}

function findSameBookOffer(offers, pays, gets) {
    if (offers.length == 0) {
        return [];
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
        self.getOffers(callback);
        // if (createFO) {
        //     var quality = au.calPrice(taker_pays, taker_gets);
        //     fou.createFirstOffer({
        //         status: 'live',
        //         quality: quality,
        //         seq: res.transaction.Sequence,
        //         ledger_index: res.ledger_index,
        //         account: res.transaction.Account,
        //         src_currency: au.getCurrency(taker_gets),
        //         dst_currency: au.getCurrency(taker_pays),
        //     });
        // }
    });

    tx.on('proposed', function(res) {});

    tx.on("error", function(res) {
        if (callback) {
            callback(res);
        }
    });

    tx.submit();
}

OfferService.prototype.createFirstOffer = function(taker_pays, taker_gets, removeOld, cmd, logger, callback) {
    var self = this;

    if (removeOld) {
        exeCmd(cmd, function(cmdResult) {
            if (cmdResult.length == 0) {
                console.log("it is weird we get empty book!!!");
                return;
            }

            if (cmdResult[0].Account != self.accountId) {
                console.log("first order owner is ", cmdResult[0].Account);
                var results = findSameBookOffer(self.offers, taker_pays, taker_gets);
                if (results && results.length > 0) {
                    console.log("find same book offers:", results.length);
                    self.cancelOffers(results, 0, function() {
                        console.log("we have clean all non-first offers, now we create new offer.");
                        self.createOffer(taker_pays, taker_gets, logger, true, callback);
                    });
                } else {
                    self.createOffer(taker_pays, taker_gets, logger, true, callback);
                }
            } else {
                console.log("our offer already in the first place. we don't need to create another!!!");
                if (callback) {
                    callback("success");
                }
            }
        });
    } else {
        self.createOffer(taker_pays, taker_gets, logger, true, callback);
    }
}


OfferService.prototype.canCreate = function(order) {
    var self = this;
    var firstOrders = self.offers;
    var dst_currency = au.getCurrency(order.TakerGets);
    var src_currency = au.getCurrency(order.TakerPays);

    if (firstOrders.length == 0) {
        return true;
    }

    var orders = _.filter(firstOrders, function(o) {
        return src_currency == o.dst_currency && dst_currency == o.src_currency;
    });

    var hasProfit = false;
    orders.every(function(o) {
        if (o.quality * order.quality < 1) {
            hasProfit = true;
        }
        return !hasProfit;
    });

    return !hasProfit;
};


OfferService.prototype.cancelOffers = function(offersToCancel, i, callback) {
    var self = this;

    if (offersToCancel.length > i) {
        self.cancelOffer(offersToCancel[i], function() {
            i = i + 1;
            self.cancelOffers(offersToCancel, i, callback);
            return;
        });
    } else {
        console.log("cancel offers done!!!!");
        if (callback) {
            callback();
        }
    }
}

OfferService.prototype.cancelOffer = function(offer, callback) {
    var self = this;

    console.log("start to cancel offer!!!!");
    self.remote.transaction().offerCancel(self.accountId, offer.seq).secret(self.secret).on('success', function() {
        console.log('offer Cancel success!!!', offer);

        console.log("offers length:", self.offers.length);
        self.offers = _.without(self.offers, _.findWhere(self.offers, {
            'seq': offer.seq
        }));
        console.log("offers length:", self.offers.length);


        self.getOffers(function() {
            if (callback) {
                callback();
            }
        })

        // fou.setFirstOrderDead({
        //     'seq': offer.seq,
        //     'account': self.accountId
        // }, function() {
        //     if (callback) {
        //         callback();
        //     }
        // });
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