var http = require('http');
var _ = require('underscore');

var jsbn = require('../src/js/jsbn/jsbn.js');
var ripple = require('../src/js/ripple');

var Remote = ripple.Remote;
var Strategy = require('../future/low-high-strategy.js').LHStrategy;
var Market = require('../future/xrp-related-market.js').XRMarket;

var remote = new Remote({
    // see the API Reference for available options
    // trace: true,
    trusted: true,
    local_signing: true,
    local_fee: true,
    fee_cushion: 1.5,
    max_fee: 100,
    servers: [{
        host: 's1.ripple.com',
        port: 443,
        secure: true
    }]
});

remote.connect(function() {
    var strategy = new Strategy(remote);

    var ripplechina = new Market(remote, 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA', 'CNY', 'ripplechina', strategy);
    var ripplefox = new Market(remote, 'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y', 'CNY', 'ripplefox', strategy);
    var ripplecn = new Market(remote, 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK', 'CNY', 'ripplecn', strategy);
    var xrpchina = new Market(remote, 'rM8199qFwspxiWNZRChZdZbGN5WrCepVP1', 'CNY', 'xrpchina', strategy);
});