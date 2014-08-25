var filterOffers = require('./offer-filter.js').filterOffers;

function queryBook(remote, currency1, issuer1, currency2, issuer2, account, logger, callback) {
    var bookInfo = {};

    var asks = remote.book(currency1, issuer1, currency2, issuer2);
    asks.offers(function(offers) {
        if (offers.length > 0) {
            var newOffers = filterOffers(offers, currency1, currency2, account, "asks");

            var price = newOffers[0].TakerPays.ratio_human(newOffers[0].TakerGets).to_human().replace(',', '');

            bookInfo.price = price;
            bookInfo.my = newOffers[0].my;
            bookInfo.taker_gets = newOffers[0].TakerGets;
            bookInfo.taker_pays = newOffers[0].TakerPays;

            if (logger) {
                logger.log(true, "price:" + price, bookInfo.taker_gets.to_json(), bookInfo.taker_pays.to_json());
            }

            console.log("price:" + price, bookInfo.taker_gets.to_json(), bookInfo.taker_pays.to_json());

            if (callback) {
                callback(bookInfo);
            }
        }
    });
}

exports.queryBook = queryBook;