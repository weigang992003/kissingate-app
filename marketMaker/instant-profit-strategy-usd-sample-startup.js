var http = require('http');
var _ = require('underscore');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var jsbn = require('../src/js/jsbn/jsbn.js');
var mongodbManager = require('./the-future-manager.js');

var Logger = require('./the-future-logger.js').TFLogger;
var Market = require('./xrp-related-market.js').XRMarket;
var Strategy = require('./instant-profit-strategy-sample.js').IPStrategy;

var remote_options = config.remote_options;
var remote = new ripple.Remote(remote_options);

var account = config.account;

setTimeout(throwDisconnectError, 1000 * 60 * 15);

remote.connect(function() {
    var strategyus = new Strategy(remote);
    new Market(remote, 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q', 'USD', 'snapswap', strategyus);
    new Market(remote, 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B', 'USD', 'bitstamps', strategyus);
});

function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}