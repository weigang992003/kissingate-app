var math = require('mathjs');
var _ = require('underscore');
var events = require('events');

var config = require('./config.js');
var ripple = require('../src/js/ripple');
var crypto = require('./crypto-util.js');
var jsbn = require('../src/js/jsbn/jsbn.js');
var mongoManager = require('./mongodb-manager.js');

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
        host: 's-east.ripple.com',
        port: 443,
        secure: true
    }, {
        host: 's-west.ripple.com',
        port: 443,
        secure: true
    }, {
        host: 's1.ripple.com',
        port: 443,
        secure: true
    }]
};

var remote = new ripple.Remote(remote_options);
var Amount = ripple.Amount;

var account = config.account;
var weight = config.factorWeight;
var profit_rate = config.profitRate;
var encryptedSecret = config.secret;
var currency_unit = config.currency_unit;
var send_max_rate = config.sendMaxRate;

var altMap = {};
var factorMap = {};
var xrp = {
    "currency": "XRP",
    "issuer": "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
    "value": "1000000"
};

var tx1Success = false;
var tx2Success = false;

var secret;
crypto.decrypt(encryptedSecret, function(result) {
    secret = result;
});

mongoManager.getAllFailedTransactions(function(docs) {
    var pathFindMap = [];
    _.each(docs, function(doc) {
        console.log(doc);
        var dest_amount = Amount.from_json(doc.dest_amount);
        var dest_amount_json = dest_amount.to_json();
        var source_amount = Amount.from_json(doc.source_amount);
        var source_amount_json = source_amount.to_json();
        var rate = source_amount.ratio_human(dest_amount).to_human().replace(',', '');

        var item = _.find(pathFindMap, function(pathFind) {
            return pathFind.dest_currency == dest_amount_json.currency;
        })

        if (!item) {
            item = {};
            item['dest_currency'] = dest_amount_json.currency;
            item['dest_amount'] = dest_amount;

            var src_currencies = [];
            src_currencies.push({
                'currency': source_amount_json.currency,
                'issuer': source_amount_json.issuer
            });

            item['src_currencies'] = src_currencies;
            pathFindMap.push(item);
        } else {
            var src_currencies = _.compact(item['src_currencies']);

            var src_currency = _.find(src_currencies, function(src_currency) {
                return src_currency.currency == source_amount_json.currency;
            });
            if (!src_currency) {
                src_currencies.push(src_currency);
            }

            item['src_currencies'] = src_currencies;
        }
    });

    console.dir(pathFindMap);


});