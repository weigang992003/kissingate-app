var WebSocket = require('ws');
var _ = require('underscore');
var ws = new WebSocket('ws://localhost:7890');
ws.on('open', function() {
    ws.send('{"src_currency":"XRP","dst_currency":"BTC","limit":2}');
});
ws.on('message', function(data, flags) {
    console.log(data);
});