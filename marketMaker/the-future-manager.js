var _ = require('underscore');
var mongoose = require('mongoose');

var tf = mongoose.createConnection('mongodb://localhost/the-future');

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
    rate: String,
    dest_amount: String,
    source_amount: String,
    send_max_rate: String,
    caused_by: String
}, {
    collection: 'failedTransaction'
});

var raccountsSchema = mongoose.Schema({
    account: String,
    secret: String,
    status: Number
}, {
    collection: 'raccounts'
});

var siteCookieSchema = mongoose.Schema({
    cookie: String,
    site: String
}, {
    collection: 'siteCookie'
});

// var incomeSchema = mongoose.Schema({
//     currency: String,
//     income: String
// })

var accountIncomeSchema = mongoose.Schema({
    account: String,
    ledger_index_start: Number,
    incomes: [{
        currency: String,
        income: String
    }]
}, {
    collection: 'accountIncome'
});

var envSchema = mongoose.Schema({
    env: String,
    wspm: String
}, {
    collection: 'env'
});

var crypto = tf.model('crypto', cryptoSchema);
var counters = tf.model('counters', countersSchema);
var accountLinesHistory = tf.model('accountLinesHistory', accountLinesHistorySchema);
var gatewayInfo = tf.model('gatewayInfo', gatewayInfoSchema);
var orderToXrp = tf.model('orderToXrp', orderToXrpSchema);
var failedTransaction = tf.model('failedTransaction', failedTransactionSchema);
var raccounts = tf.model('raccounts', raccountsSchema);
var siteCookie = tf.model('siteCookie', siteCookieSchema);
var accountIncome = tf.model('accountIncome', accountIncomeSchema);
var env = tf.model('env', envSchema);

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

function getFailedTransactionsByAccount(account, callback) {
    failedTransaction.find({
        caused_by: account
    }, "dest_amount source_amount send_max_rate,caused_by", {
        limit: 1000
    }, function(err, result) {
        if (err) return handleError(err);
        return callback(result);
    })
}

function getAllFailedTransactions(callback) {
    failedTransaction.find({
        caused_by: {
            $exists: false
        }
    }, "dest_amount source_amount send_max_rate", {
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

function getCookie(site, callback) {
    siteCookie.findOne({
            site: site
        },
        function(err, result) {
            if (err) return handleError(err);
            callback(result.cookie);
        });
}

function getAccountIncome(account, callback) {
    accountIncome.findOne({
        account: account
    }, function(err, result) {
        if (err) return handleError(err);
        callback(result);
    });
}

function getAccountIncomes(callback) {
    accountIncome.find({}, function(err, results) {
        if (err) return handleError(err);
        callback(results);
    });
}

function saveAccountIncome(record) {
    accountIncome.findOne({
        account: record.account
    }, function(err, result) {
        if (result) {
            result.ledger_index_start = record.ledger_index_start;
            result.incomes = record.incomes;
            result.save();
        } else {
            var row = new accountIncome(record);
            row.save(function(err) {
                console.log(err);
            });
        }
    });
}

function getEnv(callback) {
    env.findOne({}, function(err, result) {
        if (err) return handleError(err);
        callback(result);
    });
}

exports.getEnv = getEnv;
exports.getCookie = getCookie;
exports.getAccount = getAccount;
exports.getCryptoOption = getCryptoOption;
exports.getNextSequence = getNextSequence;
exports.getAccountIncome = getAccountIncome;
exports.getAccountIncomes = getAccountIncomes;
exports.saveAccountIncome = saveAccountIncome;
exports.saveAccountLines = saveAccountLines;
exports.findAllGatewayInfo = findAllGatewayInfo;
exports.updateOrderCurrencies = updateOrderCurrencies;
exports.saveFailedTransaction = saveFailedTransaction;
exports.deleteFailedTransaction = deleteFailedTransaction;
exports.getAllFailedTransactions = getAllFailedTransactions;
exports.deleteFailedTransactionById = deleteFailedTransactionById;
exports.getFailedTransactionsByAccount = getFailedTransactionsByAccount;