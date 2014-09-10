var WebSocket = require('ws');
var _ = require('underscore');
var tfmjs = require('./the-future-manager.js');

var ws;
var wsConnected;

function connect(callback) {
    tfmjs.getEnv(function(result) {
        ws = new WebSocket(result.wspm);
        ws.on('open', function() {
            wsConnected = true;
            if (callback) {
                callback();
            }
        });

        ws.on('close', function() {
            wsConnected = false;
            ws.close();
            connect();
        });
    })
}

function exeCmd(cmd, callback) {
    if (wsConnected) {
        ws.once('message', function(data, flags) {
            var books = JSON.parse(data);
            var orders = _.flatten(books);
            console.log("message received!! order number is", orders.length);

            callback(orders);
        });

        ws.send(JSON.stringify(cmd));
    } else {
        connect(function() {
            ws.once('message', function(data, flags) {

                var books = JSON.parse(data);
                var orders = _.flatten(books);
                console.log("message received!! order number is", orders.length);

                callback(orders);
            });

            ws.send(JSON.stringify(cmd));
        });
    }
}

exports.exeCmd = exeCmd;

// exeCmd({
//     "cmd": "book",
//     "params": {
//         "CNY": ["rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y"],
//         "USD": ["rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q"]
//     },
//     "limit": 1,
//     "filter": 0,
//     "cache": 1
// }, function(orders) {
//     console.log(orders);
// })