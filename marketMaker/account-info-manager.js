var _ = require('underscore');
var mongoose = require('mongoose');

var ai = mongoose.createConnection('mongodb://localhost/account-info');

var balanceHistorySchema = mongoose.Schema({
    hash: String,
    account: String,
    sequence: Number,
    price: Number,
    dst_amount: String,
    src_amount: String
}, {
    collection: 'balanceHistory'
});

var balanceHistory = ai.model('balanceHistory', balanceHistorySchema);

function saveBH(record) {
    balanceHistory.findOne({
        hash: record.hash,
        account: record.account
    }, function(err, result) {
        if (result) {
            result.dst_amount = add(result.dst_amount, record.dst_amount);
            result.src_amount = add(result.src_amount, record.src_amount);
            result.save();
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
    var amountInfo1 = amount1.split("/");
    var amountInfo2 = amount2.split("/");

    if (amountInfo1[1] == amountInfo2[1] && amountInfo1[2] == amountInfo2[2]) {
        var balance1 = amountInfo1[0];
        var balance2 = amountInfo2[0];
        return balance1 - (-balance2) + "/" + amountInfo1[1] + "/" + amountInfo1[2];
    }
}

exports.saveBH = saveBH;