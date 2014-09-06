var WebSocket = require('ws');
var _ = require('underscore');
var tfm = require('./the-future-manager.js');

tfm.getEnv(function(result) {
    var ws = new WebSocket(result.wspm);
    ws.on('open', function() {
        ws.send('{"src_currency":"EUR","dst_currency":"CNY","limit":1}');
    });
    ws.on('message', function(data, flags) {
        var books = JSON.parse(data);
        var orders = _.flatten(books);
        console.log(orders);
    });
});