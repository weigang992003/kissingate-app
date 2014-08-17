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
        console.log("accountIncomes:", results);
        accountIncomes = results;
        remoteConnect();
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
        host: 's-west.ripple.com',
        port: 443,
        secure: true
    }, {
        host: 's1.ripple.com',
        port: 443,
        secure: true
    }, {
        host: 's-east.ripple.com',
        port: 443,
        secure: true
    }]
});

var accountIndex = -1;
var accountIncome;
var ledger_current_index;
var ledger_index_start;
var ledger_index_end;

function remoteConnect() {
    remote.connect(function() {
        console.log("remote connected!");
        remote.requestLedgerCurrent(function(err, result) {
            if (err) throw new Error(err);
            ledger_current_index = result.ledger_current_index;
            goNextAccount();
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
    if (ledger_index_start > ledger_current_index) {
        goNextAccount();
    }
    ledger_index_end = ledger_index_start + 1000;
    ledger_index_end = ledger_index_end > ledger_current_index ? ledger_current_index : ledger_index_end,

    remote.requestAccountTx({
        'account': accountIncome.account,
        'ledger_index_min': ledger_index_start,
        'ledger_index_max': ledger_index_end,
        "binary": false,
        "count": false,
        "descending": false,
        "offset": 0,
        "forward": false
    }, incomeStatis);
}

function incomeStatis(err, result) {
    var incomes = {};
    var account = accountIncome.account;
    _.each(result.transactions, function(tx) {
        if (tx.tx.TransactionType == "Payment" && tx.tx.Account == account && tx.tx.Destination == account) {
            _.each(tx.meta.AffectedNodes, function(affectedNode) {
                var modifiedNode = affectedNode.ModifiedNode;
                if (!modifiedNode) {
                    return;
                }
                if (modifiedNode.LedgerEntryType == "AccountRoot") {
                    var finalFields = modifiedNode.FinalFields;
                    if (finalFields && finalFields.Account == account) {
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
                    if (finalFields && finalFields.HighLimit.issuer == account) {

                        var currency = finalFields.Balance.currency;

                        var previousFields = modifiedNode.PreviousFields;

                        var income = previousFields.Balance.value - finalFields.Balance.value;
                        if (incomes[currency]) {
                            incomes[currency] = income + incomes[currency];
                        } else {
                            incomes[currency] = income;
                        }
                    }

                    if (finalFields && finalFields.LowLimit.issuer == account) {
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
    if (_.isEmpty(incomes)) {
        accountIncome.ledger_index_start = ledger_index_end + 1;
        theFuture.saveAccountIncome(accountIncome);
        console.log("current ledger_index_start:", accountIncome.ledger_index_start);

        goNext();
        return;

    }
    var currencies = _.keys(incomes);


    var mergeIncomes = [];
    _.each(currencies, function(currency) {
        var income = _.find(accountIncome.incomes, function(income) {
            return income.currency == currency;
        });

        if (income) {
            income.income = (incomes[currency].toFixed(15) - 0) + (income.income - 0);
            income.income = income.income + "";
            mergeIncomes.push(income);
        } else {
            mergeIncomes.push({
                'currency': currency,
                'income': incomes[currency].toFixed(15)
            })
        }
    });
    console.log(mergeIncomes);

    accountIncome.incomes = mergeIncomes;
    accountIncome.ledger_index_start = ledger_index_end + 1;
    console.log("current ledger_index_start:", accountIncome.ledger_index_start);
    theFuture.saveAccountIncome(accountIncome);

    goNext();

}

function close() {
    remote.disconnect(function() {
        console.log("disconnect");
        process.exit(1);
    })
}