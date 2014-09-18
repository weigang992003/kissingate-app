var _ = require('underscore');
var mongoose = require('mongoose');

var ai = mongoose.createConnection('mongodb://localhost/account-info');

var AmountUtil = require('./amount-util.js').AmountUtil;
var au = new AmountUtil();

var balanceHistorySchema = mongoose.Schema({
    hash: String,
    account: String,
    sequence: Number,
    price: Number,
    dst_amount: {
        issuer: String,
        currency: String,
        value: Number
    },
    src_amount: {
        issuer: String,
        currency: String,
        value: Number
    }
}, {
    collection: 'balanceHistory'
});

var txHistorySchema = mongoose.Schema({
    hashs: [String],
    account: String,
    price: Number,
    i_pays_currency: String,
    i_gets_currency: String,
    i_pays_value: String,
    i_gets_value: String
}, {
    collection: 'txHisotry'
});

var ledgerIndexStartSchema = mongoose.Schema({
    action: String,
    account: String,
    index: Number
}, {
    collection: 'ledgerIndexStart'
});

var currencyInfoSchema = mongoose.Schema({
    currency: String,
    issuers: [String]
}, {
    collection: 'currencyInfo'
});

var txHisotry = ai.model('txHisotry', txHistorySchema);
var currencyInfo = ai.model('currencyInfo', currencyInfoSchema);
var balanceHistory = ai.model('balanceHistory', balanceHistorySchema);
var ledgerIndexStart = ai.model('ledgerIndexStart', ledgerIndexStartSchema);

function AccountInfoManager() {}

AccountInfoManager.prototype.saveTH = function(record, callback) {
    txHisotry.findOne({
        account: record.account,
        i_pays_currency: record.i_pays_currency,
        i_gets_currency: record.i_gets_currency
    }, function(err, result) {
        if (result) {
            result.i_pays_value = result.i_pays_value - (-record.i_pays_value);
            result.i_gets_value = result.i_gets_value - (-record.i_gets_value);
            result.hashs = _.union(result.hashs, record.hashs);
            result.price = au.toExp(result.i_pays_value / result.i_gets_value);
            result.save(function(err) {
                if (err) {
                    throw new Error(err);
                } else if (callback) {
                    callback();
                }

            });
        } else {
            var row = new txHisotry(record);
            row.save(function(err) {
                if (err) {
                    throw new Error(err);
                } else if (callback) {
                    callback();
                }
            });
        }
    })
};

AccountInfoManager.prototype.removeTH = function(record) {
    txHisotry.findOne({
        account: record.account,
        i_pays_currency: record.i_pays_currency,
        i_gets_currency: record.i_gets_currency
    }, function(err, result) {
        if (result) {
            result.remove();
        }
    })
}

AccountInfoManager.prototype.getLedgerIndexStart = function(action, callback) {
    ledgerIndexStart.findOne({
        'action': action
    }, function(err, result) {
        if (err) {
            throw new Error(err);
        }

        if (result && callback) {
            callback(result);
        }
    });
};

AccountInfoManager.prototype.saveLIS = function(record, callback) {
    ledgerIndexStart.findOne({
        action: record.action,
        account: record.account
    }, function(err, result) {
        if (result) {
            result.index = record.index;
            result.save();
        } else {
            var row = new ledgerIndexStart(record);
            row.save(function(err) {
                throw new Error(err);
            });
        }

        if (callback) {
            callback();
        }
    });
}

AccountInfoManager.prototype.getTH = function(account, i_pays_currency, i_gets_currency, callback) {
    txHisotry.findOne({
        account: account,
        i_pays_currency: i_pays_currency,
        i_gets_currency: i_gets_currency
    }, function(err, result) {
        if (err) {
            throw new Error(err);
        }

        if (result && callback) {
            callback(result);
        }
    })
}

AccountInfoManager.prototype.getTHByAccount = function(account, callback) {
    txHisotry.find({
        account: account
    }, function(err, results) {
        if (err) {
            throw new Error(err);
        }

        if (results && callback) {
            callback(results);
        }
    })
}

AccountInfoManager.prototype.saveCurrencyInfo = function(record, callback) {
    var row = new currencyInfo(record);
    currencyInfo.findOne({
        currency: record.currency
    }, function(err, result) {
        if (result) {
            result.issuers = record.issuers;
            result.save(function(err) {
                if (!err && callback) {
                    callback();
                }
            });
        } else {
            row.save();
        }
    })
}

function saveBH(record, minus) {
    balanceHistory.findOne({
        hash: record.hash,
        account: record.account
    }, function(err, result) {
        if (result) {
            if (!minus) {
                var dst_result = add(result.dst_amount, record.dst_amount);
                if (dst_result) {
                    result.dst_amount = dst_result;
                }
                var src_result = add(result.src_amount, record.src_amount);
                if (src_result) {
                    result.src_amount = src_result;
                }
                result.save();
            } else {
                var dst_result = minus(result.dst_amount, record.dst_amount);
                if (dst_result) {
                    result.dst_amount = dst_result;
                }
                var src_result = minus(result.src_amount, record.src_amount);
                if (src_result) {
                    result.src_amount = src_result;
                }
                result.save();
            }

        } else {
            var row = new balanceHistory(record);
            row.save(function(err) {
                if (err) {
                    console.log(err);
                }
            });
        }
    });
}


function add(amount1, amount2) {
    if (amount1.issuer == amount2.issuer && amount1.currency == amount2.currency) {
        return {
            issuer: amount1.issuer,
            currency: amount1.currency,
            value: amount1.value - (-amount2.value)
        }
    }
}

function minus(src_amount, reduce_amount) {
    if (src_amount.issuer == reduce_amount.issuer && src_amount.currency == reduce_amount.currency) {
        return {
            issuer: src_amount.issuer,
            currency: src_amount.currency,
            value: src_amount.value - reduce_amount.value
        }
    }
}

exports.saveBH = saveBH;
exports.AccountInfoManager = AccountInfoManager;

// var aim = new AccountInfoManager();
// aim.getTH('rf9q1WE2Kdmv9AWtesCaANJyNxnFjp5T7z', 'XRPT', 'USDT', function(result) {
//     console.log(result);
//     result.remove();
// });