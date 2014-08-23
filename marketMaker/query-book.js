var filterOffers = require('./offer-filter.js').filterOffers;

function queryBook(remote, currency1, issuer1, currency2, issuer2, account, logger, callback) {
    var bookInfo = {};
    var rate = 0.000001;

    var asks = remote.book(currency1, issuer1, currency2, issuer2);
    asks.offers(function(offers) {
        if (offers.length > 0) {
            var newOffers = filterOffers(offers, currency1, currency2, account, "asks");

            var price = newOffers[0].TakerPays.ratio_human(newOffers[0].TakerGets).to_human().replace(',', '');
            price = (price - 0) + price * rate;
            bookInfo.price = price + "";

            bookInfo.taker_pays = newOffers[0].TakerPays.to_json();

            if (typeof bookInfo.taker_pays == "string") {
                var value = bookInfo.taker_pays;
                value = (value - 0) + value * rate;
                bookInfo.taker_pays = value + "";
            } else {
                var value = bookInfo.taker_pays.value;
                value = (value - 0) + value * rate;
                bookInfo.taker_pays.value = value + "";
            }

            bookInfo.taker_gets = newOffers[0].TakerGets.to_json();

            if (logger) {
                logger.log(true, bookInfo);
            }

            console.log(bookInfo);

            if (callback) {
                callback(bookInfo);
            }
        }
    });
}

exports.queryBook = queryBook;