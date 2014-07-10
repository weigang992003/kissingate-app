var jsbn = require('../src/js/jsbn/jsbn.js');
var ripple = require('../src/js/ripple');
var http = require('http');
// var ripple = require('ripple-lib');
var Remote = ripple.Remote;
var Transaction = ripple.Transaction;
var Seed = ripple.Seed;
var Amount = ripple.Amount;
var _ = require('underscore');
var EventEmitter = require('events').EventEmitter;
var events = require('events');

var emitter = new events.EventEmitter();

var Market = require('./same-currency-with-xrp.js').Market;

// var ripplechina = new Market(remote, 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA', 'CNY', 'ripplechina');
// var ripplefox = new Market(remote, 'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y', 'CNY', 'ripplefox');
// var ripplecn = new Market(remote, 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK', 'CNY', 'ripplecn');

// console.log(this.test);

// close();



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

var drops = 1000000;
remote.connect(function() {
    var ripplechina = new Market(remote, 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA', 'CNY', 'ripplechina');
    var ripplefox = new Market(remote, 'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y', 'CNY', 'ripplefox');
    var ripplecn = new Market(remote, 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK', 'CNY', 'ripplecn');

    ripplechina.addMarket(ripplefox);
    ripplechina.addMarket(ripplecn);
    ripplecn.addMarket(ripplefox);

});



function close() {
    remote.disconnect(function() {
        console.log("disconnect");
        process.exit(1);
    })
}