var _ = require('underscore');
var aim = require('./account-info-manager');
var io = require('socket.io').listen(3004);
var abio = io.of('/ab'); //account balance io

function AccountListener(remote, accountId) {
    this.remote = remote;
    this.accountId = accountId;
}

AccountListener.prototype.listenOffer = function() {
    console.log("start to listen account Offer");
    var remote = this.remote;
    var accountId = this.accountId;

    var account = remote.addAccount(accountId);

    account.on('transaction', function(tx) {
        _.each(tx.meta.AffectedNodes, function(affectedNode) {
            var modifiedNode = affectedNode.ModifiedNode;
            if (!modifiedNode) {
                return;
            }

            if (modifiedNode.LedgerEntryType == "AccountRoot") {
                var finalFields = modifiedNode.FinalFields;
                if (finalFields && finalFields.Account == accountId) {
                    abio.emit("ab", "rrrrrrrrrrrrrrrrrrrrrhoLvTp", "XRP", finalFields.Balance);
                }
            }

            if (modifiedNode.LedgerEntryType == "RippleState") {
                var finalFields = modifiedNode.FinalFields;
                if (finalFields && finalFields.HighLimit.issuer == accountId) {
                    abio.emit("ab", finalFields.LowLimit.issuer, finalFields.Balance.currency, 0 - finalFields.Balance.value + "");
                }

                if (finalFields && finalFields.LowLimit.issuer == accountId) {
                    abio.emit("ab", finalFields.HighLimit.issuer, finalFields.Balance.currency, finalFields.Balance.value);
                }
            }

            if (modifiedNode.LedgerEntryType == "Offer") {
                var balanceHistory = {};
                var finalFields = modifiedNode.FinalFields;
                if (finalFields && finalFields.Account == accountId) {
                    var previsousField = modifiedNode.PreviousFields;

                    var f_take_pays = finalFields.TakerPays;
                    var p_take_pays = previsousField.TakerPays;
                    var f_take_gets = finalFields.TakerGets;
                    var p_take_gets = previsousField.TakerGets;

                    var dst_amount;
                    var src_amount;
                    if (typeof f_take_pays == "string") {
                        dst_amount = f_take_pays - p_take_pays + '/XRP/rrrrrrrrrrrrrrrrrrrrrhoLvTp';
                    } else {
                        dst_amount = f_take_pays.value - p_take_pays.value + '/' + f_take_pays.currency + '/' + f_take_pays.issuer;
                    }

                    if (typeof f_take_gets == "string") {
                        src_amount = f_take_gets - p_take_gets + '/XRP/rrrrrrrrrrrrrrrrrrrrrhoLvTp';
                    } else {
                        src_amount = f_take_gets.value - p_take_gets.value + '/' + f_take_gets.currency + '/' + f_take_gets.issuer;
                    }

                    balanceHistory.account = accountId;
                    balanceHistory.dst_amount = dst_amount;
                    balanceHistory.src_amount = src_amount;
                    balanceHistory.sequence = finalFields.Sequence;

                    aim.saveHB(balanceHistory);
                }
            }
        });
    });
}

exports.AccountListener = AccountListener;