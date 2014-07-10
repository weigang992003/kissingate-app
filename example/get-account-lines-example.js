var _ = require('underscore');

require('../future/date-extend.js');
var ripple = require('../src/js/ripple');
var config = require('../future/config.js');
var jsbn = require('../src/js/jsbn/jsbn.js');

var Remote = ripple.Remote;
var account = config.account;
var secret = config.secret;

var remote = new Remote({
    // see the API Reference for available options
    trace: true,
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
    remote.requestAccountLines(account, function() {
        var lines = arguments[1].lines;
        lines = _.map(lines, function(line) {
            delete line.limit;
            delete line.limit_peer;
            delete line.no_ripple;
            delete line.quality_in;
            delete line.quality_out;
            return line;
        })
        var accountLineRecord = {
            'account': account,
            'lines': lines,
            'time': new Date()
        }

        close();
    });

    // "lines": [{
    //     "account": "rM8199qFwspxiWNZRChZdZbGN5WrCepVP1",
    //     "balance": "9.999999999720001",
    //     "currency": "CNY",
    //     "limit": "0",
    //     "limit_peer": "0",
    //     "no_ripple": true,
    //     "quality_in": 0,
    //     "quality_out": 0
    // }, {
    //     "account": "rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y",
    //     "balance": "9.90000000028",
    //     "currency": "CNY",
    //     "limit": "10",
    //     "limit_peer": "0",
    //     "no_ripple": true,
    //     "quality_in": 0,
    //     "quality_out": 0
    // }, {
    //     "account": "razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA",
    //     "balance": "10",
    //     "currency": "CNY",
    //     "limit": "10",
    //     "limit_peer": "0",
    //     "no_ripple": true,
    //     "quality_in": 0,
    //     "quality_out": 0
    // }, {
    //     "account": "rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK",
    //     "balance": "10",
    //     "currency": "CNY",
    //     "limit": "10",
    //     "limit_peer": "0",
    //     "no_ripple": true,
    //     "quality_in": 0,
    //     "quality_out": 0
    // }]

});




function close() {
    remote.disconnect(function() {
        console.log("disconnect");
        process.exit(1);
    })
}