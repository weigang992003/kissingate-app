var http = require('http');
var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var jsbn = require('../src/js/jsbn/jsbn.js');


var emitter = new events.EventEmitter();

var remote_options = remote_options = {
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
var Amount = ripple.Amount;

var account = config.account;

var currency_unit = config.currency_unit;


var dest_amount = Amount.from_json({
    currency: 'USD',
    issuer: account,
    value: '0.0001'
});

console.log(dest_amount.to_text_full());
console.log(dest_amount.to_human({
    precision: 2
}));

console.log(dest_amount.product_human(1.005).to_text_full());
console.log(dest_amount.to_text_full());

var a = Amount.from_json("0.00000893068385/BTC/rf9q1WE2Kdmv9AWtesCaANJyNxnFjp5T7z");
var b = Amount.from_json("0.0000084/BTC/rf9q1WE2Kdmv9AWtesCaANJyNxnFjp5T7z");
console.log(a.to_json());
console.log(a.ratio_human(b).to_human());
console.log(Amount.from_json("1000/XRP/rrrrrrrrrrrrrrrrrrrrrhoLvTp").to_human())