var ripple = require('../src/js/ripple');
var jsbn = require('../src/js/jsbn/jsbn.js');

var Remote = ripple.Remote;
var Amount = ripple.Amount;

var _ = require('underscore');

var AmountUtil = require('./amount-util.js').AmountUtil;
var au = new AmountUtil();

var AccountInfoManager = require('./account-info-manager.js').AccountInfoManager;
var aim = new AccountInfoManager();

var config = require('./config.js');
var drops = config.drops;

var ledger_current_index;
var ledger_index_start;
var ledger_index_end;
var account;

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
        host: 's-east.ripple.com',
        port: 443,
        secure: true
    }]
});

function remoteConnect() {
    remote.connect(function() {
        console.log("remote connected!");
        remote.requestLedgerCurrent(function(err, result) {
            if (err) throw new Error(err);
            ledger_current_index = result.ledger_current_index;
            console.log("ledger_current_index:", ledger_current_index);

            aim.getLedgerIndexStart("th", function(result) {
                console.log(result);
                account = result.account;
                ledger_index_start = result.index;
                console.log("ledger_index_start:", ledger_index_start);
                goNext();
            });
        });
    });
}

remoteConnect();

function goNext() {
    if (ledger_index_start >= ledger_current_index) {
        throw new Error("query tx history done!!!");
    }
    ledger_index_end = ledger_index_start + 100;
    ledger_index_end = ledger_index_end > ledger_current_index ? ledger_current_index : ledger_index_end;

    var cmd = {
        'account': account,
        'ledger_index_min': ledger_index_start,
        'ledger_index_max': ledger_index_end,
        "binary": false,
        "count": false,
        "descending": false,
        "offset": 0,
        "forward": false
    }

    console.log(ledger_index_start, ledger_index_end);

    remote.requestAccountTx(cmd, doStatis);
}

function exeStatis(account, transactions, i) {
    if (transactions.length > i) {
        var tx = transactions[i];
        i = i + 1;

        console.log(tx.tx.hash);
        if (tx.tx.Account == account && tx.tx.TransactionType == "OfferCreate") {
            console.log("we are owner of this tx!!");
            var th = {};
            th.hashs = [tx.tx.hash],
            th.account = account;

            _.each(tx.meta.AffectedNodes, function(affectedNode) {
                var modifiedNode = affectedNode.ModifiedNode;
                if (!modifiedNode) {
                    return;
                }

                if (modifiedNode.LedgerEntryType == "Offer") {
                    var finalFields = modifiedNode.FinalFields;
                    if (finalFields) {
                        var previousFields = modifiedNode.PreviousFields;

                        th.i_pays_currency = au.getCurrency(finalFields.TakerPays);
                        th.i_gets_currency = au.getCurrency(finalFields.TakerGets);

                        var new_pays_value = au.getValue(previousFields.TakerPays) - au.getValue(finalFields.TakerPays);
                        if (th.i_pays_value) {
                            th.i_pays_value = th.i_pays_value + new_pays_value;
                        } else {
                            th.i_pays_value = new_pays_value;
                        }

                        var new_gets_value = au.getValue(previousFields.TakerGets) - au.getValue(finalFields.TakerGets);
                        if (th.i_gets_value) {
                            th.i_gets_value = th.i_gets_value + new_gets_value;
                        } else {
                            th.i_gets_value = new_gets_value;
                        }

                    }
                }
            });

            if (th.i_pays_value && th.i_gets_value) {
                if (th.i_pays_currency == "XRP") {
                    th.i_pays_value = th.i_pays_value / drops;
                }
                if (th.i_gets_currency == "XRP") {
                    th.i_gets_value = th.i_gets_value / drops;
                }

                th.price = au.toExp(th.i_pays_value / th.i_gets_value);
                console.log("save th!");
                aim.saveTH(th, function() {
                    exeStatis(account, transactions, i);
                });
            } else {
                console.log("go next tx!");
                exeStatis(account, transactions, i);
            }
            return;
        }

        var th = {};
        th.hashs = [tx.tx.hash],
        th.account = account;
        _.each(tx.meta.AffectedNodes, function(affectedNode) {
            var modifiedNode = affectedNode.ModifiedNode;
            if (!modifiedNode) {
                return;
            }

            if (modifiedNode.LedgerEntryType == "Offer") {
                var finalFields = modifiedNode.FinalFields;
                if (finalFields && finalFields.Account == account) {
                    var previousFields = modifiedNode.PreviousFields;

                    if (!previousFields.TakerPays || !previousFields.TakerGets) {
                        return;
                    }

                    th.i_pays_currency = au.getCurrency(finalFields.TakerGets);
                    th.i_gets_currency = au.getCurrency(finalFields.TakerPays);
                    th.i_pays_value = au.getValue(previousFields.TakerGets) - au.getValue(finalFields.TakerGets);
                    th.i_gets_value = au.getValue(previousFields.TakerPays) - au.getValue(finalFields.TakerPays);
                }
            }
        });

        if (th.i_pays_value && th.i_gets_value) {
            if (th.i_pays_currency == "XRP") {
                th.i_pays_value = th.i_pays_value / drops;
            }
            if (th.i_gets_currency == "XRP") {
                th.i_gets_value = th.i_gets_value / drops;
            }

            th.price = au.toExp(th.i_pays_value / th.i_gets_value);
            console.log("save th!");
            aim.saveTH(th, function() {
                exeStatis(account, transactions, i);
            });
        } else {
            console.log("go next tx!");
            exeStatis(account, transactions, i);
        }
    } else {
        ledger_index_start = ledger_index_end;

        console.log("save ledger_index_start:", ledger_index_start);

        aim.saveLIS({
            action: 'th',
            account: account,
            index: ledger_index_start
        }, function() {
            goNext();
        });
    }
}

function doStatis(err, result) {
    if (err) {
        throw new Error(err);
    }

    exeStatis(result.account, result.transactions, 0);
}





// setTimeout(close, 1000 * 60 * 60);


// function close() {
//     remote.disconnect(function() {
//         console.log("disconnect");
//         process.exit(1);
//     })
// }