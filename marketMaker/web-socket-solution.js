var WebSocket = require('ws');
var _ = require('underscore');
var aujs = require('./amount-util.js');
var tfm = require('./the-future-manager.js');

var getPrice = aujs.getPrice;
var getIssuer = aujs.getIssuer;
var getCurrency = aujs.getCurrency;

var currency1 = "USD";
var currency2 = "CNY";

tfm.getEnv(function(result) {
    var ws = new WebSocket(result.wspm);
    ws.on('open', function() {
        var req = {
            "src_currency": currency1,
            "dst_currency": currency2,
            "limit": 1
        }
        ws.send(JSON.stringify(req));
    });

    ws.on('message', function(data, flags) {
        var books = JSON.parse(data);
        var orders = _.flatten(books);
        checkOrdersForDiffCurrency(orders);
    });
});


function checkOrdersForDiffCurrency(orders) {
    var orders_type_1 = [];
    var orders_type_2 = [];
    _.each(orders, function(order) {
        var gets_currency = getCurrency(order.TakerGets);
        var gets_issuer = getIssuer(order.TakerGets);
        var pays_currency = getCurrency(order.TakerPays);
        var pays_issuer = getIssuer(order.TakerPays);

        if (gets_currency == currency1 && pays_currency == currency2) {
            order.quality = getPrice(order, pays_currency, gets_currency);
            orders_type_1.push(order);
        }

        if (gets_currency == currency2 && pays_currency == currency1) {
            order.quality = getPrice(order, pays_currency, gets_currency);
            orders_type_2.push(order);
        }
    });

    orders_type_1 = _.sortBy(orders_type_1, function(order) {
        return order.quality;
    });

    orders_type_2 = _.sortBy(orders_type_2, function(order) {
        return order.quality;
    });

    orders_type_1.every(function(order_type_1) {
        orders_type_2.every(function(order_type_2) {
            var profit = order_type_1.quality * order_type_2.quality;
            if (profit < 0.999) {
                console.log(order_type_1.TakerPays, order_type_1.TakerGets,
                    order_type_2.TakerPays, order_type_2.TakerGets,
                    "profit:" + profit, "price1:" + order_type_1.quality, "price2:" + order_type_2.quality);
            }
            return profit < 1;
        });
    });
}