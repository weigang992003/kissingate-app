var http = require('http');
var _ = require('underscore');

var math = require('mathjs');
var ripple = require('../src/js/ripple');
var config = require('../marketMaker/config.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
var queryBook = require('../marketMaker/query-book.js').queryBook;
var filterOffers = require('../marketMaker/offer-filter.js').filterOffers;

var Remote = ripple.Remote;
var account = config.account;
var secret = config.secret;
var Amount = ripple.Amount;

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

var bi1;
var bi2;
var account = "r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59";


function createOffer(bi1, bi2) {
    if (bi1.taker_gets.compareTo(bi2.taker_pays) == 1) {
        var c = bi2.taker_pays.currency().to_json();

        var times = bi2.taker_pays.ratio_human(bi1.taker_gets).to_human().replace(',', '');
        times = math.round(times - 0, 6);
        bi1.taker_gets = bi2.taker_pays;
        bi1.taker_pays = bi1.taker_pays.product_human(times);
    } else if (bi2.taker_gets.compareTo(bi1.taker_pays) == 1) {
        var c = bi1.taker_pays.currency().to_json();

        var times = bi2.taker_gets.ratio_human(bi1.taker_pays).to_human().replace(',', '');
        times = math.round(times - 0, 6) + "";
        bi2.taker_gets = bi1.taker_pays;
        bi2.taker_pays = bi2.taker_pays.divide(Amount.from_json(times));
    }

    console.log(true, "profit:" + bi1.price * bi2.price,
        bi1.taker_pays.to_text_full(), bi1.taker_gets.to_text_full(),
        bi2.taker_pays.to_text_full(), bi2.taker_gets.to_text_full());
}



remote.connect(function() {
    console.log("remote connected!");
    // var book = remote.book("XRP", "", "CNY", "razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA"); // ripplecn.
    // queryBook(remote, "XRP", "", "CNY", "razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA");

    queryBook(remote, "XRP", "", "CNY", "razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA", account, null, function(bi) {
        bi1 = bi;
        if (bi1 && bi2) {
            createOffer(bi1, bi2);
        }
    });
    queryBook(remote, "CNY", "rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK", "XRP", "", account, null, function(bi) {
        bi2 = bi;
        if (bi1 && bi2) {
            createOffer(bi1, bi2);
        }
    });


    // book.offers(function(offers) {
    //     var newOffers = filterOffers(offers, "XRP", "CNY", "abc", "asks");
    //     console.log(newOffers[0].TakerPays.to_text_full());
    //     console.log(newOffers[0].TakerGets.to_text_full());


    //     // console.log(offers[0].quality);
    //     close();
    // })

    //the response
    // {
    //     Account: 'r9pzLhY7UZ5R5rvbdEQsfcQanmDc7hoPVx',
    //     BookDirectory: '94F5D00A3AAD35ED809D94B5CB98771EBB9E5668A5F7EBDD550392ADC7402800',
    //     BookNode: '0000000000000000',
    //     Flags: 131072,
    //     LedgerEntryType: 'Offer',
    //     OwnerNode: '0000000000000002',
    //     PreviousTxnID: '3DA20D5D1A6E698030854FF0CDCA0E6597A525FFFCF3CDDDBFC5EA2C06A6389D',
    //     PreviousTxnLgrSeq: 7552157,
    //     Sequence: 4836,
    //     TakerGets: {
    //         currency: 'CNY',
    //         issuer: 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK',
    //         value: '467.6086642384866'
    //     },
    //     TakerPays: {
    //         currency: 'CNY',
    //         issuer: 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA',
    //         value: '470.2740336246461'
    //     },
    //     index: 'AD8E69F7BB421AA6EB9BF589FD499C03E2293CEB1631B77F03507EF8BF2D9597',
    //     quality: '1.0057'
    // }

    // var book = remote.book("HBY", "rD75kUrZudj83s7i4kVY3cQvEdeQvtkBor", "XRP", ""); // ripplecn.
    // book.offers(function(offers) {
    //     console.log(offers[0]);
    //     close();
    // })

    //the response 
    // {
    //     Account: 'rDyum2Xptm22baz5cjtExMfUuqNaETiqcg',
    //     BookDirectory: '1B686B6C4DEA9808B5B92820B04837BB180053636EC9818C5B0AA87BEE538000',
    //     BookNode: '0000000000000000',
    //     Flags: 131072,
    //     LedgerEntryType: 'Offer',
    //     OwnerNode: '0000000000000000',
    //     PreviousTxnID: 'D729D524CE5A1555138B01A03AE81E3B4B7BCDDE479C7DD437E1DF064138652C',
    //     PreviousTxnLgrSeq: 7553358,
    //     Sequence: 35,
    //     TakerGets: {
    //         currency: 'HBY',
    //         issuer: 'rD75kUrZudj83s7i4kVY3cQvEdeQvtkBor',
    //         value: '200'
    //     },
    //     TakerPays: '600000000',
    //     index: 'C3037A40BD59DB8DA366C49EE593C089EE59602A29D4ABD3E25EFF84D2E3A8BC',
    //     quality: '3000000',
    //     taker_gets_funded: {
    //         currency: 'HBY',
    //         issuer: 'rD75kUrZudj83s7i4kVY3cQvEdeQvtkBor',
    //         value: '11'
    //     },
    //     taker_pays_funded: '33000000'
    // }

    // var book = remote.book("HBY", "rD75kUrZudj83s7i4kVY3cQvEdeQvtkBor", "HBY", "rMF1zj5f6pc7BeRjhU1MjXEQxvmviP1u78"); // ripplecn.
    // book.offers(function(offers) {
    //     console.log(offers[0]);
    //     close();
    // })

    //the response
    // {
    //     Account: 'rDyum2Xptm22baz5cjtExMfUuqNaETiqcg',
    //     BookDirectory: 'B845C304654232AD0FA56D0B84A736CD5805ADFE61E7D41257071AFD498D0000',
    //     BookNode: '0000000000000000',
    //     Flags: 131072,
    //     LedgerEntryType: 'Offer',
    //     OwnerNode: '0000000000000000',
    //     PreviousTxnID: '4E632436D429972B80324C5EB555CB6FCD133A07E702C1389360E077E12507CD',
    //     PreviousTxnLgrSeq: 7553326,
    //     Sequence: 34,
    //     TakerGets: {
    //         currency: 'HBY',
    //         issuer: 'rD75kUrZudj83s7i4kVY3cQvEdeQvtkBor',
    //         value: '500'
    //     },
    //     TakerPays: {
    //         currency: 'HBY',
    //         issuer: 'rMF1zj5f6pc7BeRjhU1MjXEQxvmviP1u78',
    //         value: '100000'
    //     },
    //     index: '9284EA81710D8F78BF3D43116CD5D53CC0561C2E6CA23E2FAF53861D11E6CFE6',
    //     quality: '200',
    //     taker_gets_funded: {
    //         currency: 'HBY',
    //         issuer: 'rD75kUrZudj83s7i4kVY3cQvEdeQvtkBor',
    //         value: '11'
    //     },
    //     taker_pays_funded: {
    //         currency: 'HBY',
    //         issuer: 'rMF1zj5f6pc7BeRjhU1MjXEQxvmviP1u78',
    //         value: '2200'
    //     }
    // }

});

function close() {
    remote.disconnect(function() {
        process.exit(1);
    })
}