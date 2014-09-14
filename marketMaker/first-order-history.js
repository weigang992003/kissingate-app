// {
//     "ModifiedNode": {
//         "FinalFields": {
//             "Account": "rHaLk9zSC1JPmbDiWAgWTgjcEacHzGbqf",
//             "BookDirectory": "49789A0B460DC77A2CED9349C432AEA97352345BA3C7313A5C0C403049B90D00",
//             "BookNode": "0000000000000000",
//             "Flags": 0,
//             "OwnerNode": "0000000000000000",
//             "Sequence": 34380,
//             "TakerGets": {
//                 "currency": "CNY",
//                 "issuer": "rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y",
//                 "value": "4.9709999999826"
//             },
//             "TakerPays": "171413793"
//         },
//         "LedgerEntryType": "Offer",
//         "LedgerIndex": "CB8FF678D3AD4DDEFC897A3F7F49EAB8085862CAAC72AA06C6802DB6A0D0C24C",
//         "PreviousFields": {
//             "TakerGets": {
//                 "currency": "CNY",
//                 "issuer": "rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y",
//                 "value": "5"
//             },
//             "TakerPays": "172413793"
//         },
//         "PreviousTxnID": "9725CDCA1FEABF8F4AFCC7A2601A9F660B2638966A154C04112D5254D8E5FBDE",
//         "PreviousTxnLgrSeq": 8863880
//     }
// }

var http = require('http');
var ripple = require('../src/js/ripple');
var jsbn = require('../src/js/jsbn/jsbn.js');

var Remote = ripple.Remote;
var Amount = ripple.Amount;
var _ = require('underscore');

var au = require('./amount-util.js').AmountUtil();
var config = require('../marketMaker/config.js');
var cryptoUtil = require('../marketMaker/crypto-util.js');
var theFuture = require('./the-future-manager.js');

var AccountInfoManager = require('./account-info-manager.js').AccountInfoManager;
var aim = new AccountInfoManager();

var accountIncomes;
theFuture.getAccountIncomes(function(results) {
    if (results) {
        console.log("accountIncomes:", results);
        accountIncomes = results;
        remoteConnect();
    }
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
        _.each(tx.meta.AffectedNodes, function(affectedNode) {
            var modifiedNode = affectedNode.ModifiedNode;
            if (!modifiedNode) {
                return;
            }
            if (modifiedNode.LedgerEntryType == "Offer") {
                var finalFields = modifiedNode.FinalFields;
                if (finalFields && finalFields.Account == account) {
                    var previousFields = modifiedNode.PreviousFields;
                    var price = au.calPrice(previousFields.TakerPays, previousFields.TakerGets);
                    price = au.toExp(price);

                    var th = {};
                    th.hashs = [tx.tx.hash],
                    th.account = result.account;
                    th.i_pays_currency = au.getCurrency(finalFields.TakerGets);
                    th.i_gets_currency = au.getCurrency(finalFields.TakerPays);
                    th.i_pays_value = au.getValue(previousFields.TakerGets) - au.getValue(finalFields.TakerGets);
                    th.i_gets_value = au.getValue(previousFields.TakerPays) - au.getValue(finalFields.TakerPays);

                    aim.saveTH(th);
                }
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

    _.each(currencies, function(currency) {
        var income = _.find(accountIncome.incomes, function(income) {
            return income.currency == currency;
        });

        if (income) {
            accountIncome.incomes = _.without(accountIncome.incomes, income);
            income.income = (incomes[currency].toFixed(15) - 0) + (income.income - 0);
            income.income = income.income + "";
            accountIncome.incomes.push(income);
        } else {
            accountIncome.incomes.push({
                'currency': currency,
                'income': incomes[currency].toFixed(15)
            })
        }
    });

    console.log(accountIncome.incomes);

    accountIncome.ledger_index_start = ledger_index_end + 1;
    console.log("current ledger_index_start:", accountIncome.ledger_index_start);
    theFuture.saveAccountIncome(accountIncome);

    goNext();

}

setTimeout(close, 1000 * 60 * 60);


function close() {
    remote.disconnect(function() {
        console.log("disconnect");
        process.exit(1);
    })
}