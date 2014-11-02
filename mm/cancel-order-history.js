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
var xrpIssuer = config.xrpIssuer;

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

            aim.getLedgerIndexStart("coh", function(result) {
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
        var cohs = [];

        _.each(tx.meta.AffectedNodes, function(affectedNode) {
            var deletedNode = affectedNode.DeletedNode;
            if (!deletedNode) {
                return;
            }

            var finalFields = deletedNode.FinalFields;
            if (finalFields) {
                if (finalFields.Account == account) {
                    if (au.getValue(finalFields.TakerPays) - 0 > 0) {
                        console.log(deletedNode);

                        var coh = {};
                        coh.hash = tx.tx.hash,
                        coh.account = account;
                        coh.TakerPays = formatAmountJson(finalFields.TakerPays);
                        coh.TakerGets = formatAmountJson(finalFields.TakerGets);
                        cohs.push(coh);
                    }
                }
            }
        });

        if (cohs.length > 0) {
            _.each(cohs, function(coh, j) {
                if (j == cohs.length - 1) {
                    aim.saveCOH(coh, function() {
                        exeStatis(account, transactions, i);
                    });
                } else {
                    aim.saveCOH(coh);
                }
            });
        } else {
            exeStatis(account, transactions, i);
        }
    } else {
        ledger_index_start = ledger_index_end;

        console.log("save ledger_index_start:", ledger_index_start);

        aim.saveLIS({
            action: 'coh',
            account: account,
            index: ledger_index_start
        }, function() {
            goNext();
        });
    }
}

function formatAmountJson(amountJson) {
    if (amountJson.issuer && amountJson.value) {
        return amountJson;
    } else {
        return {
            "issuer": xrpIssuer,
            "currency": "XRP",
            "value": amountJson
        }
    }
}

function doStatis(err, result) {
    if (err) {
        throw new Error(err);
    }

    exeStatis(result.account, result.transactions, 0);
}