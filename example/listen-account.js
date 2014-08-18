var _ = require('underscore');

require('../marketMaker/date-extend.js');
var ripple = require('../src/js/ripple');
var config = require('../marketMaker/config.js');
var jsbn = require('../src/js/jsbn/jsbn.js');

var Remote = ripple.Remote;
var Account = ripple.Account;

var account = config.account;
var secret = config.secret;

var remote = new Remote({
    // see the API Reference for available options
    // trace: true,
    trusted: true,
    local_signing: true,
    local_fee: true,
    fee_cushion: 1.5,
    max_fee: 100,
    servers: [{
        host: 's1.ripple.com',
        port: 443,
        secure: true
    }]
});

remote.connect(function() {
    console.log("remote connected!");
    var account = "rf9q1WE2Kdmv9AWtesCaANJyNxnFjp5T7z";
    var acc = remote.addAccount(account);

    acc.on('transaction', function(tx) {
        var srcCurrency;
        var srcGateway;
        var srcValue;

        var dstCurrency;
        var dstGateway;
        var dstValue;

        var getAmount = tx.transaction.Amount;
        if (typeof getAmount == "string") {
            dstCurrency = "XRP";
            dstGateway = "";
            dstValue = getAmount;
        } else {
            dstCurrency = getAmount.currency;
            dstValue = getAmount.value;
        }

        var payAmount = tx.transaction.SendMax;
        if (typeof payAmount == "string") {
            srcCurrency = "XRP";
            srcGateway = "";
            srcValue = payAmount;
        } else {
            srcCurrency = payAmount.currency;
            srcValue = payAmount.value;
        }

        _.each(tx.meta.AffectedNodes, function(affectedNode) {
            var modifiedNode = affectedNode.ModifiedNode;
            if (!modifiedNode) {
                return;
            }
            if (modifiedNode.LedgerEntryType == "RippleState") {
                //here is the rule: finalFields and previsousField always relate LowLimit issuer;
                var finalFields = modifiedNode.FinalFields;
                if (finalFields && finalFields.HighLimit.issuer == account) {
                    if (srcCurrency == finalFields.LowLimit.currency) {
                        srcGateway = finalFields.LowLimit.issuer;
                    };
                    if (dstCurrency == finalFields.LowLimit.currency) {
                        dstGateway = finalFields.LowLimit.issuer;
                    }
                }

                if (finalFields && finalFields.LowLimit.issuer == account) {
                    if (srcCurrency == finalFields.HighLimit.currency) {
                        srcGateway = finalFields.HighLimit.issuer;
                    };
                    if (dstCurrency == finalFields.HighLimit.currency) {
                        dstGateway = finalFields.HighLimit.issuer;
                    }
                }
            }
        });

        console.log({
            srcCurrency: srcCurrency,
            srcGateway: srcGateway,
            srcValue: srcValue,
            dstCurrency: dstCurrency,
            dstGateway: dstGateway,
            dstValue: dstValue
        })
    });
});



function close() {
    remote.disconnect(function() {
        console.log("disconnect");
        process.exit(1);
    })
}
