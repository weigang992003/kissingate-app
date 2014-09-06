var _ = require('underscore');
var math = require('mathjs');
var aim = require('./account-info-manager.js');
var Amount = require('./amount-util.js').Amount;

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
        self.offers = result.offers;
        console.log("get offers success");

        if (callback) {
            callback(self.offers);
        }
    });
};

OfferService.prototype.ifOfferExist = function(pays, gets) {
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

    if (result.length > 0) {
        return true;
    }

    return false;
}

OfferService.prototype.createOffer = function(taker_pays, taker_gets, logger, createHB, callback) {
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
        if (createHB) {
            var price = taker_pays.ratio_human(taker_gets).to_human().replace(',', '');
            price = math.round(price * 1, 6);
            aim.saveHB({
                'hash': res.transaction.hash,
                'sequence': res.transaction.Sequence,
                'account': accountId,
                'price': price,
                'dst_amount': taker_pays.product_human("0").to_text_full(),
                'src_amount': taker_gets.product_human("0").to_text_full()
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

OfferService.prototype.atLeastExistOne = function(offers) {
    var self = this;
    var existOne = false;

    offers.every(function(offer) {
        existOne = self.ifOfferExist(offer.TakerPays, offer.TakerGets);
        return !existOne;
    })

    return existOne;
}

exports.OfferService = OfferService;