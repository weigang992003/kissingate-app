var WebSocket = require('ws');
var _ = require('underscore');
var ws = new WebSocket('ws://localhost:7890');
ws.on('open', function() {
    ws.send('{"src_currency":"XRP","dst_currency":"CNY","limit":1}');
});
ws.on('message', function(data, flags) {
    console.log(data);
});