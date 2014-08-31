var aujs = require('./amount-util.js');
var filterOffers = require('./offer-filter.js').filterOffers;

var getIssuer = aujs.getIssuer;
var getCurrency = aujs.getCurrency;

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
                logger.log(true, "price:" + price, bookInfo.taker_pays.to_json(), bookInfo.taker_gets.to_json());
            }

            console.log("price:" + price, bookInfo.taker_pays.to_json(), bookInfo.taker_gets.to_json());

            if (callback) {
                callback(bookInfo);
            }
        }
    });
}

function queryBookByOrder(remote, order, callback) {
    var taker_pays = order.TakerPays;
    var taker_gets = order.TakerGets;

    var currency1 = getCurrency(taker_gets);
    var issuer1 = getIssuer(taker_gets);
    var currency2 = getCurrency(taker_pays);
    var issuer2 = getIssuer(taker_pays);

    var asks = remote.book(currency1, issuer1, currency2, issuer2);
    asks.offers(function(offers) {
        if (offers.length > 0) {
            var newOffers = filterOffers(offers, currency1, currency2, "", "asks");

            var bookInfo = {};
            bookInfo.price = newOffers[0].quality;
            bookInfo.taker_gets = newOffers[0].TakerGets;
            bookInfo.taker_pays = newOffers[0].TakerPays;

            if (difference(order.quality, newOffers[0].quality) > 0.0001) {
                console.log("price:" + order.quality, taker_pays, taker_gets);
                console.log("price:" + newOffers[0].quality, bookInfo.taker_pays.to_json(), bookInfo.taker_gets.to_json());
            }

            if (callback) {
                callback(bookInfo);
            }
        }
    });
}

function difference(price1, price2) {
    return price1 * 1 > price2 * 1 ? (price1 - price2) / price2 : (price2 - price1) / price1;
}

exports.queryBook = queryBook;
exports.queryBookByOrder = queryBookByOrder;