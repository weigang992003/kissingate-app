var _ = require('underscore');
var mongoose = require('mongoose');

mongoose.connect('mongodb://localhost/ripple-info');


var currenciesSchema = mongoose.Schema({
    currency: String,
    Account: String,
    trade_rate: Number,
    account_rate: Number,
    balance: Number,
    trust_line_limit_peer: Number,
    domain: String,
    trust_line_amount: Number
}, {
    collection: 'currencies'
});

var orderBookSchema = mongoose.Schema({
    currencyPair: [String],
    gatewayPair: [String],
    askNum: Number,
    bidNum: Number,
    askPrice: String,
    bidPrice: String
}, {
    collection: 'orderBook'
});

var currencies = mongoose.model('currencies', currenciesSchema);
var orderBook = mongoose.model('orderBook', orderBookSchema);

function getAllCurrencies(callback) {
    currencies.find({}, "currency Account", {}, function(err, result) {
        if (err) return handleError(err);
        return callback(result);
    })
}

function saveOrderBook(record) {
    var row = new orderBook(record);
    row.save(function(err) {
        if (err) return handleError(err);
    });
}

exports.getAllCurrencies = getAllCurrencies;
exports.saveOrderBook = saveOrderBook;