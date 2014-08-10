var _ = require('underscore');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var jsbn = require('../src/js/jsbn/jsbn.js');
var mongodbManager = require('./the-future-manager.js');

var Logger = require('./the-future-logger.js').TFLogger;
var Market = require('./xrp-related-market.js').XRMarket;
var Strategy = require('./instant-profit-strategy.js').IPStrategy;

var EventEmitter = require('events').EventEmitter;


var remote_options = config.remote_options;
var remote = new ripple.Remote(remote_options);

var account = config.account;

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