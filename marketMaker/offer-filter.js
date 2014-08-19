var _ = require('underscore');

var rpamount = require('./rpamount.js');
var ripple = require('../src/js/ripple');
var Amount = ripple.Amount;


function filterOffers(offers, currency1, currency2, account, action) {
    var lastprice;
    var rowCount = 0;
    var max_rows = 1;
    newOffers = _.values(_.compact(_.map(offers, function(d, i) {
        if (rowCount > max_rows) return false;

        if (d.hasOwnProperty('taker_gets_funded')) {
            d.TakerGets = d.taker_gets_funded;
            d.TakerPays = d.taker_pays_funded;
        }

        d.TakerGets = Amount.from_json(d.TakerGets);
        d.TakerPays = Amount.from_json(d.TakerPays);

        if (!d.TakerGets.is_native() && d.TakerGets.currency().to_human() != currency1) {
            return false;
        }

        if (!d.TakerPays.is_native() && d.TakerPays.currency().to_human() != currency2) {
            return false;
        }


        d.price = Amount.from_quality(d.BookDirectory, "1", "1");

        if (action !== "asks") d.price = Amount.from_json("1/1/1").divide(d.price);

        // Adjust for drops: The result would be a million times too large.
        if (d[action === "asks" ? "TakerPays" : "TakerGets"].is_native())
            d.price = d.price.divide(Amount.from_json("1000000"));

        // Adjust for drops: The result would be a million times too small.
        if (d[action === "asks" ? "TakerGets" : "TakerPays"].is_native())
            d.price = d.price.multiply(Amount.from_json("1000000"));

        var price = rpamount(d.price, {
            rel_precision: 4,
            rel_min_precision: 2
        });

        if (d.Account == account) {
            d.my = true;
        }

        if (lastprice === price && !d.my) {
            offers[current].TakerPays = Amount.from_json(offers[current].TakerPays).add(d.TakerPays);
            offers[current].TakerGets = Amount.from_json(offers[current].TakerGets).add(d.TakerGets);
            d = false;
        } else current = i;

        if (!d.my)
            lastprice = price;

        if (d) rowCount++;

        if (rowCount > max_rows) return false;

        return d;
    })));

    var key = action === "asks" ? "TakerGets" : "TakerPays";
    var sum;
    _.each(newOffers, function(order, i) {
        if (sum) sum = order.sum = sum.add(order[key]);
        else sum = order.sum = order[key];
    });

    return newOffers;
}

exports.filterOffers = filterOffers;