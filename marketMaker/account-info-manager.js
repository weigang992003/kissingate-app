var _ = require('underscore');
var mongoose = require('mongoose');

var ai = mongoose.createConnection('mongodb://localhost/account-info');

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

var balanceHistory = ai.model('balanceHistory', balanceHistorySchema);

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