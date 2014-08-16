var http = require('http');
var ripple = require('../src/js/ripple');
var jsbn = require('../src/js/jsbn/jsbn.js');

var Remote = ripple.Remote;
var Amount = ripple.Amount;
var _ = require('underscore');

var config = require('../marketMaker/config.js');
var cryptoUtil = require('../marketMaker/crypto-util.js');
var theFuture = require('./the-future-manager.js');


var accountIncomes;
theFuture.getAccountIncomes(function(results) {
    if (results) {
        accountIncomes = results;
    }
});

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
var accountIndex = -1;
var accountIncome;
var ledger_current_index;
var ledger_index_start;
var ledger_index_end;

function remoteConnect() {
    remote.connect(function() {
        var ledger_current_index;
        remote.requestLedgerCurrent(function(err, result) {
            if (err) throw new Error(err);
            ledger_current_index = result.result.ledger_current_index;
        });
    });
}

function goNextAccount() {
    accountIndex++;
    if (accountIncomes.length > accountIndex) {
        accountIncome = accountIncomes[accountIndex];
        goNext();
    } else {
        close();
    }
}

function goNext() {
    ledger_index_start = accountIncome.ledger_index_start;
    ledger_index_end = ledger_index_start + 100;

    remote.requestAccountTx({
        'account': accountIncome.account,
        'ledger_index_min': ledger_index_start,
        'ledger_index_max': ledger_index_end > ledger_current_index ? ledger_current_index : ledger_index_end,
        "binary": false,
        "count": false,
        "descending": false,
        "offset": 0,
        "forward": false
    }, incomeStatis);
}

function incomeStatis(err, result) {
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
    accountIncome.ledger_index_start = ledger_index_start;
    _.each(accountIncome.incomes, function(income) {
        var newIncome = _.find(incomes, function(newIncome) {
            return newIncome.currency == income.currency;
        });
        if (newIncome) {
            income.income = income.income + newIncome.income;
        }
    })
    goNext();

}

function close() {
    remote.disconnect(function() {
        console.log("disconnect");
        process.exit(1);
    })
}