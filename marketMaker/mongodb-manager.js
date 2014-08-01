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
    source_amount: String,
    send_max_rate: String
}, {
    collection: 'failedTransaction'
});

var raccountsSchema = mongoose.Schema({
    account: String,
    secret: String,
    status: Number
}, {
    collection: 'raccounts'
})


var crypto = mongoose.model('crypto', cryptoSchema);
var counters = mongoose.model('counters', countersSchema);
var accountLinesHistory = mongoose.model('accountLinesHistory', accountLinesHistorySchema);
var gatewayInfo = mongoose.model('gatewayInfo', gatewayInfoSchema);
var orderToXrp = mongoose.model('orderToXrp', orderToXrpSchema);
var failedTransaction = mongoose.model('failedTransaction', failedTransactionSchema);
var raccounts = mongoose.model('raccounts', raccountsSchema);

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

function deleteFailedTransactionById(id) {
    failedTransaction.findOne({
        "id": id
    }, function(err, doc) {
        doc.remove();
    })
}

// function getAllFailedTransactions(callback) {
//     failedTransaction.count({}, function(err, c) {
//         var skip = c > 500 ? c - 500 : 0
//         failedTransaction.find({}, "dest_amount source_amount send_max_rate", {
//             limit: 500,
//             skip: skip
//         }, function(err, result) {
//             if (err) return handleError(err);
//             return callback(result);
//         })
//     })
// }

function getAllFailedTransactions(callback) {
    failedTransaction.find({}, "dest_amount source_amount send_max_rate", {
        limit: 1000
    }, function(err, result) {
        if (err) return handleError(err);
        return callback(result);
    })
}

function getAccount(status, callback) {
    raccounts.findOne({
        status: status
    }, function(err, result) {
        if (err) return handleError(err);
        callback(result);
    });
}


exports.getAccount = getAccount;
exports.getCryptoOption = getCryptoOption;
exports.getNextSequence = getNextSequence;
exports.saveAccountLines = saveAccountLines;
exports.findAllGatewayInfo = findAllGatewayInfo;
exports.updateOrderCurrencies = updateOrderCurrencies;
exports.saveFailedTransaction = saveFailedTransaction;
exports.deleteFailedTransaction = deleteFailedTransaction;
exports.getAllFailedTransactions = getAllFailedTransactions;
exports.deleteFailedTransactionById = deleteFailedTransactionById;
