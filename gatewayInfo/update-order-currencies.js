var _ = require('underscore');

var config = require('../marketMaker/config.js');
var ripple = require('../src/js/ripple');
var mongodbManager = require('../marketMaker/mongodb-manager.js');

var EventEmitter = require('events').EventEmitter;


var remote_options = config.remote_options;
var remote = new ripple.Remote(remote_options);

var emitter = new EventEmitter();

remote.connect(function() {
    var orderToXrps = [];
    var currencies = [];
    var gatewayInfos = [];
    var orderCurrenciesMap = {};
    var emitCount = 0;

    function count(account, currency, num) {
        var result = orderCurrenciesMap[account];
        if (result == undefined) {
            result = [];
            orderCurrenciesMap[account] = result;
        }
        result.push(currency);
    };

    emitter.on("countOrder", count);

    function update() {
        mongodbManager.updateOrderCurrencies(orderCurrenciesMap);
    }

    emitter.on("update", update);

    mongodbManager.findAllGatewayInfo(function(result) {
        _.each(result, function(gatewayInfo) {
            var currencies = _.union(gatewayInfo.receive_currencies, gatewayInfo.send_currencies);
            emitCount = emitCount + currencies.length;
        });

        _.each(result, function(gatewayInfo) {
            var currencies = _.union(gatewayInfo.receive_currencies, gatewayInfo.send_currencies);
            _.each(currencies, function(currency) {
                var asks = remote.book("XRP", "", currency, gatewayInfo.Account);
                asks.offers(function(offers) {
                    emitCount--;
                    console.log(emitCount);
                    if (offers.length > 5) {
                        emitter.emit("countOrder", gatewayInfo.Domain, currency, offers.length);
                    }
                    if (emitCount == 0) {
                        emitter.emit("update");
                    }
                });
            })
        })
    });
});