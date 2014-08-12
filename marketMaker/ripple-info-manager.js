var _ = require('underscore');
var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/ripple-info');


var currenciesSchema = mongoose.Schema({
    currency: String,
    Account: String,
    trade_rate: Number,
    account_rate: Number,
    transfer_rate_percent: Number,
    balance: Number,
    trust_line_limit_peer: Number,
    domain: String,
    trust_line_amount: Number
}, {
    collection: 'currencies'
});

var orderBookSchema = mongoose.Schema({
    currencyPair: [String],
    gAddressPair: [String],
    gNamePair: [String],
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
    currencies.find({
        trade_rate: {
            $gt: 500
        },
        trust_line_amount: {
            $gt: 100
        }
    }, "currency Account domain", {}, function(err, result) {
        if (err) return handleError(err);
        return callback(result);
    })
}

function saveOrderBook(record) {
    var currency1 = record.currencyPair[0];
    var currency2 = record.currencyPair[1];

    var gAddress1 = record.gAddressPair[0];
    var gAddress2 = record.gAddressPair[1];

    orderBook.findOne({
        $or: [{
            currencyPair: [currency1, currency2],
            gAddressPair: [gAddress1, gAddress2]
        }, {
            currencyPair: [currency2, currency1],
            gAddressPair: [gAddress2, gAddress1]
        }, {
            currencyPair: [currency2, currency1],
            gAddressPair: [gAddress1, gAddress2]
        }, {
            currencyPair: [currency1, currency2],
            gAddressPair: [gAddress2, gAddress1]
        }]
    }, function(err, result) {
        if (err) handleError(err);
        if (result) {
            result.currencyPair = record.currencyPair;
            result.gAddressPair = record.gAddressPair;
            result.gNamePair = record.gNamePair;
            result.askNum = record.askNum;
            result.askPrice = record.askPrice;
            result.bidNum = record.bidNum;
            result.bidPrice = record.bidPrice;
            result.save();
        } else {
            var row = new orderBook(record);
            row.save(function(err) {
                if (err) return handleError(err);
            });
        }
    })
}

function getAllGatewaysWithRate(callback) {
    currencies.find({
        transfer_rate_percent: {
            $gt: 0
        }
    }, "Account domain transfer_rate_percent", {}, function(err, result) {
        if (err) return handleError(err);
        return callback(result);
    })
}

exports.saveOrderBook = saveOrderBook;
exports.getAllCurrencies = getAllCurrencies;


// getAllGatewaysWithRate(function(result) {
//     var gateways = _.groupBy(result, function(e) {
//         return e.Account;
//     });

//     _.each(_.keys(gateways), function(account) {
//         console.log(gateways[account][0]);
//     })
// });