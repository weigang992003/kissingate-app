var filterOffers = require('./offer-filter.js').filterOffers;

function queryBook(remote, currency1, issuer1, currency2, issuer2, account) {
    var bookInfo = {};

    var asks = remote.book(currency1, issuer1, currency2, issuer2);
    asks.offers(function(offers) {
        if (offers.length > 0) {
            var newOffers = filterOffers(offers, currency1, currency2, account, "asks");

            bookInfo.price = newOffers[0].TakerPays.ratio_human(newOffers[0].TakerGets).to_human().replace(',', '');
            bookInfo.takerPays = newOffers[0].TakerPays.to_json();
            bookInfo.TakerGets = newOffers[0].TakerGets.to_json();

            console.log(bookInfo);
        }
    });
}

exports.queryBook = queryBook;