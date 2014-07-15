var _ = require('underscore');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var jsbn = require('../src/js/jsbn/jsbn.js');

var Market = require('./non-xrp-currency-market.js').NXCMarket;
var Strategy = require('./same-currency-strategy.js').SCStrategy;

var remote_options = {
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
};

var remote = new ripple.Remote(remote_options);

setTimeout(throwDisconnectError, 1000 * 60 * 30);

remote.connect(function() {
    new Market(remote, 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA', 'CNY', 'ripplechina',
        'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK', 'CNY', 'ripplecn', new Strategy(remote));

    new Market(remote, 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK', 'CNY', 'ripplecn',
        'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y', 'CNY', 'ripplefox', new Strategy(remote));

    new Market(remote, 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA', 'CNY', 'ripplechina',
        'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y', 'CNY', 'ripplefox', new Strategy(remote));
});

function throwDisconnectError() {
    throw new Error('we are disconnect with ripple network!!!');
}