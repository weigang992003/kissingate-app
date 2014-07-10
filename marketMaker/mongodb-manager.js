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
})

var accountLinesHistorySchema = mongoose.Schema({
    account: String,
    lines: [accountLineSchema],
    time: Date
}, {
    collection: 'accountLinesHistory'
})

var crypto = mongoose.model('crypto', cryptoSchema);
var counters = mongoose.model('counters', countersSchema);
var accountLinesHistory = mongoose.model('accountLinesHistory', accountLinesHistorySchema);

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
            name: 'logId'
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

exports.getCryptoOption = getCryptoOption;
exports.getNextSequence = getNextSequence;
exports.saveAccountLines = saveAccountLines;