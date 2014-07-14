var http = require('http');
var ripple = require('../src/js/ripple');
var jsbn = require('../src/js/jsbn/jsbn.js');

var Remote = ripple.Remote;
var Amount = ripple.Amount;
var _ = require('underscore');

var config = require('../marketMaker/config.js');
var cryptoUtil = require('../marketMaker/crypto-util.js');
var account = config.account;
var encryptedSecret = config.secret;

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

    cryptoUtil.decrypt(encryptedSecret, function(secret) {
        remote.transaction().offerCreate({
            "source": account,
            "taker_pays": {
                "currency": "CNY",
                "value": "0.0001",
                "issuer": "rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y",
                "name": "ripplefox"
            },
            "taker_gets": {
                "currency": "CNY",
                "value": "0.0001",
                "issuer": "razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA",
                "name": "ripplechina"
            }
        }).secret(secret)
            .once("success", function(data) {
                remote.requestAccountOffers(account, function() {
                    console.dir(arguments[1].offers);
                });
            }).submit();
    })
    // remote.transaction().offerCreate({
    //     "source": account,
    //     "taker_gets": 1000000,
    //     "taker_pays": {
    //         "currency": "CNY",
    //         "value": "1",
    //         "issuer": "razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA"
    //     }
    // }).secret(secret)
    //     .on("success", function(data) {
    //         console.log(data);
    //         console.dir(data.transaction);
    //     }).submit();




    //The Response
    // {
    //     engine_result: 'tesSUCCESS',
    //     engine_result_code: 0,
    //     engine_result_message: 'The transaction was applied.',
    //     ledger_hash: 'DE2F76B555E3529027399F33EE65B04F266E9849FE13C53DEE8A837471AB155E',
    //     ledger_index: 7498454,
    //     meta: {
    //         AffectedNodes: [
    //             [Object],
    //             [Object],
    //             [Object],
    //             [Object]
    //         ],
    //         TransactionIndex: 9,
    //         TransactionResult: 'tesSUCCESS'
    //     },
    //     status: 'closed',
    //     transaction: {
    //         Account: 'rDyum2Xptm22baz5cjtExMfUuqNaETiqcg',
    //         Fee: '15',
    //         Flags: 0,
    //         Sequence: 28,
    //         SigningPubKey: '03566100C464EE8452BF2AF864FAADD5DFA2A6E70F2A5C049A2A35868572F60BB5',
    //         TakerGets: {
    //             currency: 'HBY',
    //             issuer: 'rMF1zj5f6pc7BeRjhU1MjXEQxvmviP1u78',
    //             value: '1'
    //         },
    //         TakerPays: '60000000000',
    //         TransactionType: 'OfferCreate',
    //         TxnSignature: '304602210088AF1DAFEDF06D0CD617D02F13B07875A35E634AE1DAD005695BF5CE78A23212022100931BA9BC8D4600CFEDA17781E3FC4FC34956F90E68AC77FB79CC7C03EA939F83',
    //         date: 457503920,
    //         hash: '7DA69D03199F57C2A6BE54322695605842E0822F1EA9D21F1383828D2F57C627'
    //     },
    //     type: 'transaction',
    //     validated: true,
    //     mmeta: {
    //         nodes: [
    //             [Object],
    //             [Object],
    //             [Object],
    //             [Object]
    //         ]
    //     },
    //     metadata: {
    //         AffectedNodes: [
    //             [Object],
    //             [Object],
    //             [Object],
    //             [Object]
    //         ],
    //         TransactionIndex: 9,
    //         TransactionResult: 'tesSUCCESS'
    //     },
    //     tx_json: {
    //         Account: 'rDyum2Xptm22baz5cjtExMfUuqNaETiqcg',
    //         Fee: '15',
    //         Flags: 0,
    //         Sequence: 28,
    //         SigningPubKey: '03566100C464EE8452BF2AF864FAADD5DFA2A6E70F2A5C049A2A35868572F60BB5',
    //         TakerGets: {
    //             currency: 'HBY',
    //             issuer: 'rMF1zj5f6pc7BeRjhU1MjXEQxvmviP1u78',
    //             value: '1'
    //         },
    //         TakerPays: '60000000000',
    //         TransactionType: 'OfferCreate',
    //         TxnSignature: '304602210088AF1DAFEDF06D0CD617D02F13B07875A35E634AE1DAD005695BF5CE78A23212022100931BA9BC8D4600CFEDA17781E3FC4FC34956F90E68AC77FB79CC7C03EA939F83',
    //         date: 457503920,
    //         hash: '7DA69D03199F57C2A6BE54322695605842E0822F1EA9D21F1383828D2F57C627'
    //     }
    // }
});




function close() {
    remote.disconnect(function() {
        console.log("disconnect");
        process.exit(1);
    })
}