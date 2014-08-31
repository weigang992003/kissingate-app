var WebSocket = require('ws');
var _ = require('underscore');
var rsjs = require('./remote-service.js');
var remote = rsjs.getRemote();

var queryBookByOrder = require('./query-book.js').queryBookByOrder;

remote.connect(function() {
    var ws = new WebSocket('ws://localhost:7890');
    ws.on('open', function() {
        ws.send('{"src_currency":"USD","dst_currency":"CNY","limit":1}');
    });
    ws.on('message', function(data, flags) {
        var books = JSON.parse(data);
        var orders = _.flatten(books);
        checkOrders(orders);
    });
});

function checkOrders(orders) {
    orderQueue = orderQueue.concat(orders);

    isOrderNewest();
}

var orderQueue = [];
var nextOrder = 0;

function isOrderNewest() {
    if (orderQueue.length > nextOrder) {
        queryBookByOrder(remote, orderQueue[nextOrder], function() {
            nextOrder++;
            isOrderNewest();
        });
    } else {
        console.log("check done!");
    }
}