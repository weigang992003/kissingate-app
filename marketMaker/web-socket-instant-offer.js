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
            cmd: 'book',
            params: {
                'pays_currency': ['CNY'],
                'gets_currency': ['USD'],
                'CNY': ['rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y', 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA', 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'],
                'USD': ['rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B']
            },
            limit: 1,
            filter: 1,
            cache: 0
        }
        ws.send(JSON.stringify(req));
    });

    ws.once('message', function(data, flags) {
        var books = JSON.parse(data);
        var orders = _.flatten(books);
        checkOrdersForDiffCurrency(orders);
    });
});


function checkOrdersForDiffCurrency(orders) {
    orders = _.sortBy(orders, function(order) {
        return order.quality;
    });

    console.log(orders);
}