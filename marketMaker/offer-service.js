var remote;
var account;
var offers = [];

function create(r, a) {
    remote = r;
    account = a;
}

function getOffers(callback) {
    remote.requestAccountOffers(account, function(err, result) {
        offers = result.offers;
        console.log(offers);

        if (callback) {
            callback(offers);
        }
    });
}

function ifOfferExist(pays, gets) {
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

function createOffer(taker_pays, taker_gets, logger) {
    var tx = remote.transaction();
    if (secret) {
        tx.secret(secret);
    } else {
        return;
    }

    if (logger)
        logger.log(true, "we are create offer here", "taker_pays", taker_pays, "taker_gets", taker_gets);

    tx.offerCreate(account, taker_pays, taker_gets);
    tx.on("success", function(res) {
        getOffers();
    });

    tx2.on('proposed', function(res) {
        offers.push({
            'taker_pays': taker_pays,
            'taker_gets': taker_gets
        })
    });

    tx.on("error", function(res) {
        console.log(res);
        throw new Error(res);
    });

    tx.submit();
}

exports.create = create;
exports.getOffers = getOffers;
exports.createOffer = createOffer;
exports.ifOfferExist = ifOfferExist;