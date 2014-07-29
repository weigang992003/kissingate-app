var _ = require('underscore');

var ripple = require('../src/js/ripple');
var jsbn = require('../src/js/jsbn/jsbn.js');
var config = require('./config.js');

var account = config.motherAccount;
var Remote = ripple.Remote;

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
    remote.requestAccountOffers(account, function() {
        console.log(false, "right now the offers this account have:", arguments[1].offers);
    });
});

// [{
//     flags: 131072,
//     seq: 14471,
//     taker_gets: {
//         currency: 'CNY',
//         issuer: 'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y',
//         value: '17.5657917386088'
//     },
//     taker_pays: {
//         currency: 'USD',
//         issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
//         value: '2.828092469916046'
//     }
// }, {
//     flags: 0,
//     seq: 14535,
//     taker_gets: {
//         currency: 'CNY',
//         issuer: 'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y',
//         value: '199.8'
//     },
//     taker_pays: {
//         currency: 'CNY',
//         issuer: 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA',
//         value: '200'
//     }
// }, {
//     flags: 131072,
//     seq: 14536,
//     taker_gets: {
//         currency: 'CNY',
//         issuer: 'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y',
//         value: '67.1332691218781'
//     },
//     taker_pays: {
//         currency: 'CNY',
//         issuer: 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK',
//         value: '67.200402391'
//     }
// }]




function close() {
    remote.disconnect(function() {
        console.log("disconnect");
        process.exit(1);
    })
}