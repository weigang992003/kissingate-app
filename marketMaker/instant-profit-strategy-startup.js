var http = require('http');
var _ = require('underscore');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var jsbn = require('../src/js/jsbn/jsbn.js');
var mongodbManager = require('./the-future-manager.js');

var Logger = require('./the-future-logger.js').TFLogger;
var Market = require('./xrp-related-market.js').XRMarket;
var Strategy = require('./instant-profit-strategy.js').IPStrategy;

var remote_options = config.remote_options;
var remote = new ripple.Remote(remote_options);

var account = config.account;

setTimeout(throwDisconnectError, 1000 * 60 * 15);

remote.connect(function() {
    // remote.requestAccountLines(account, function() {
    //     var lines = arguments[1].lines;
    //     lines = _.map(lines, function(line) {
    //         delete line.limit;
    //         delete line.limit_peer;
    //         delete line.no_ripple;
    //         delete line.quality_in;
    //         delete line.quality_out;
    //         return line;
    //     });
    //     var accountLineRecord = {
    //         'account': account,
    //         'lines': lines,
    //         'time': new Date()
    //     }

    //     mongodbManager.saveAccountLines(accountLineRecord);
    // });

    var strategy = new Strategy(remote);

    var ripplechina = new Market(remote, 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA', 'CNY', 'ripplechina', strategy);
    var ripplefox = new Market(remote, 'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y', 'CNY', 'ripplefox', strategy);
    var ripplecn = new Market(remote, 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK', 'CNY', 'ripplecn', strategy);
    var xrpchina = new Market(remote, 'rM8199qFwspxiWNZRChZdZbGN5WrCepVP1', 'CNY', 'xrpchina', strategy);

});

function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}