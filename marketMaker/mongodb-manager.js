var _ = require('underscore');
var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/the-future');

var cryptoSchema = mongoose.Schema({
    key: String,
    hash: String,
    inputEncoding: String,
    outputEncoding: String,
    algorithm: String
}, {
    collection: 'crypto'
});

var countersSchema = mongoose.Schema({
    name: String,
    seq: Number
}, {
    collection: 'counters'
});

var accountLineSchema = mongoose.Schema({
    account: String,
    currency: String,
    balance: Number
});

var accountLinesHistorySchema = mongoose.Schema({
    account: String,
    lines: [accountLineSchema],
    time: Date
}, {
    collection: 'accountLinesHistory'
});

var orderToXrpSchema = mongoose.Schema({
    currency: String,
    asksNum: Number,
    bidsNum: Number
})

var gatewayInfoSchema = mongoose.Schema({
    Account: String,
    receive_currencies: [String],
    send_currencies: [String],
    Domain: String,
    Balance: String,
    orderCurrencies: [String]
}, {
    collection: 'gatewayInfo'
});

var failedTransactionSchema = mongoose.Schema({
    dest_amount: String,
    source_amount: String
}, {
    collection: 'failedTransaction'
});


var crypto = mongoose.model('crypto', cryptoSchema);
var counters = mongoose.model('counters', countersSchema);
var accountLinesHistory = mongoose.model('accountLinesHistory', accountLinesHistorySchema);
var gatewayInfo = mongoose.model('gatewayInfo', gatewayInfoSchema);
var orderToXrp = mongoose.model('orderToXrp', orderToXrpSchema);
var failedTransaction = mongoose.model('failedTransaction', failedTransactionSchema);

function getCryptoOption(callback) {
    crypto.findOne({
        key: 'kissingate'
    }, function(err, result) {
        if (err) return handleError(err);
        callback(result);
    });
}

function getNextSequence(name, callback) {
    counters.findOneAndUpdate({
            name: name
        }, {
            $inc: {
                seq: 1
            }
        }, {
            new: true
        },
        function(err, result) {
            if (err) return handleError(err);
            callback(result.seq);
        });
}

function saveAccountLines(record) {
    var row = new accountLinesHistory(record);
    row.save(function(err) {
        if (err) return handleError(err);
    });
}

function findAllGatewayInfo(callback) {
    gatewayInfo.find({}, function(err, result) {
        if (err) console.log(err);
        callback(result);
    });
}

function updateOrderCurrencies(orderCurrenciesMap) {
    _.each(_.keys(orderCurrenciesMap), function(domain) {
        gatewayInfo.update({
            Domain: domain
        }, {
            orderCurrencies: orderCurrenciesMap[domain]
        }, {}, function(err, numberAffected, raw) {
            if (err) console.log(err);
        });
    });
}

function saveFailedTransaction(record) {
    var row = new failedTransaction(record);
    row.save(function(err) {
        if (err) return handleError(err);
    });
}

function deleteFailedTransaction(record) {
    failedTransaction.findOne(record, function(err, doc) {
        if (doc) {
            doc.remove();
        }
    });
}

exports.getCryptoOption = getCryptoOption;
exports.getNextSequence = getNextSequence;
exports.saveAccountLines = saveAccountLines;
exports.findAllGatewayInfo = findAllGatewayInfo;
exports.updateOrderCurrencies = updateOrderCurrencies;
exports.saveFailedTransaction = saveFailedTransaction;
exports.deleteFailedTransaction = deleteFailedTransaction;