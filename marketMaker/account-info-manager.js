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

var txHisotry = ai.model('txHisotry', txHistorySchema);
var balanceHistory = ai.model('balanceHistory', balanceHistorySchema);

function AccountInfoManager() {}

AccountInfoManager.prototype.saveTH = function(record) {
    var row = new txHisotry(record);
    row.save(record);
};

function merge(th1, th2) {
    if (th1.i_pays_currency != th2.i_gets_currency || th2.i_pays_currency != th1.i_gets_currency) {
        return;
    }

    var th = {};
    th.hashs = _.union(th1.hashs, th2.hashs);
    th.account = th1.account;

    //case1 i_pays_value of th1 bigger then gets_value and i_gets_value of th1 bigger then pays_value of th2
    //1 USD ->6 CNY 3CNY -> 0.5 USD
    //when has profit between th1 and th2, or th1>=th2 or th2>th1
    if (th1.price * th2.price < 1) {
        if (th1.i_pays_value - th2.i_gets_value >= 0 && th1.i_gets_value - th2.i_pays_value >= 0) {
            th.i_pays_currency = th1.i_pays_currency;
            th.i_gets_currency = th1.i_gets_currency;
            th.i_pays_value = th1.i_pays_currency - th2.i_gets_value;
            th.i_gets_value = th1.i_gets_value - th2.i_pays_value;
            th.price = (th.i_pays_value / th.i_gets_value).toExponential();
        } else {
            th.i_pays_currency = th2.i_pays_currency;
            th.i_gets_currency = th2.i_gets_currency;
            th.i_pays_value = th2.i_pays_currency - th1.i_gets_value;
            th.i_gets_value = th2.i_gets_value - th1.i_pays_value;
            th.price = (th.i_pays_value / th.i_gets_value).toExponential();
        }

        return th;
    }
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