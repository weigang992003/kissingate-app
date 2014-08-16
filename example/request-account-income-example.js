var http = require('http');
var ripple = require('../src/js/ripple');
var jsbn = require('../src/js/jsbn/jsbn.js');

var Remote = ripple.Remote;
var Amount = ripple.Amount;
var _ = require('underscore');

var config = require('../marketMaker/config.js');
var cryptoUtil = require('../marketMaker/crypto-util.js');
var account = "rf9q1WE2Kdmv9AWtesCaANJyNxnFjp5T7z";

var remote = new Remote({
    // see the API Reference for available options
    // trace: true,
    trusted: true,
    local_signing: true,
    local_fee: true,
    fee_cushion: 1.5,
    max_fee: 100,
    servers: [{
        host: 's-east.ripple.com',
        port: 443,
        secure: true
    }, {
        host: 's-west.ripple.com',
        port: 443,
        secure: true
    }, {
        host: 's1.ripple.com',
        port: 443,
        secure: true
    }]
});

var incomes = {};
remote.connect(function() {

    remote.requestAccountTx({
        'account': account,
        'ledger_index_min': 8340000, //earliest
        'ledger_index_max': 8341387, //latest
        "binary": false,
        "count": false,
        "descending": false,
        "offset": 0,
        "limit": 10,
        "forward": false
    }, function(err, result) {
        _.each(result.transactions, function(tx) {
            if (tx.tx.TransactionType == "Payment" && tx.tx.Account == account && tx.tx.Destination == account) {
                _.each(tx.meta.AffectedNodes, function(affectedNode) {
                    var modifiedNode = affectedNode.ModifiedNode;
                    if (!modifiedNode) {
                       return;
                    }
                    if (modifiedNode.LedgerEntryType == "AccountRoot") {
                        var finalFields = modifiedNode.FinalFields;
                        if (finalFields.Account == account) {
                            var previousFields = modifiedNode.PreviousFields;
                            var income = finalFields.Balance - previousFields.Balance;
                            if (incomes.XRP) {
                                incomes.XRP = income + incomes.XRP;
                            } else {
                                incomes.XRP = income;
                            }
                        }
                    }
                    if (modifiedNode.LedgerEntryType == "RippleState") {
                        var finalFields = modifiedNode.FinalFields;
                        if (finalFields.HighLimit.issuer == account) {

                            var currency = finalFields.Balance.currency;

                            var previousFields = modifiedNode.PreviousFields;

                            var income = previousFields.Balance.value - finalFields.Balance.value;
                            if (incomes[currency]) {
                                incomes[currency] = income + incomes[currency];
                            } else {
                                incomes[currency] = income;
                            }
                        }

                        if (finalFields.LowLimit.issuer == account) {
                            var currency = finalFields.Balance.currency;

                            var previousFields = modifiedNode.PreviousFields;

                            var income = finalFields.Balance.value - previousFields.Balance.value;
                            if (incomes[currency]) {
                                incomes[currency] = income + incomes[currency];
                            } else {
                                incomes[currency] = income;
                            }
                        }
                    }

                });
            }

        });

        console.log(incomes);
        close();
    });
});

function close() {
    remote.disconnect(function() {
        console.log("disconnect");
        process.exit(1);
    })
}