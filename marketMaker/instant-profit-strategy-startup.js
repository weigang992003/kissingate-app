var http = require('http');
var _ = require('underscore');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var jsbn = require('../src/js/jsbn/jsbn.js');
var Market = require('./xrp-related-market.js').XRMarket;
var Strategy = require('./instant-profit-strategy.js').IPStrategy;

var remote_options = config.remote_options;
var remote = new ripple.Remote(remote_options);

remote.connect(function() {
    var strategy = new Strategy(remote);

    var ripplechina = new Market(remote, 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA', 'CNY', 'ripplechina', strategy);
    var ripplefox = new Market(remote, 'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y', 'CNY', 'ripplefox', strategy);
    var ripplecn = new Market(remote, 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK', 'CNY', 'ripplecn', strategy);
    var xrpchina = new Market(remote, 'rM8199qFwspxiWNZRChZdZbGN5WrCepVP1', 'CNY', 'xrpchina', strategy);
});