var aim = require('./account-info-manager');

function AccountListener(remote, accountId) {
    this.remote = remote;
    this.accountId = accountId;
}

AccountListener.prototype.listenOffer = function() {
    var remote = this.remote;
    var accountId = this.accountId;

    var account = remote.addAccount(accountId);

    account.on('transaction', function(tx) {
        _.each(tx.meta.AffectedNodes, function(affectedNode) {
            var modifiedNode = affectedNode.ModifiedNode;
            if (!modifiedNode) {
                return;
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

                    var dst_amount = f_take_pays.value - p_take_pays.value + '/' + f_take_pays.currency + '/' + f_take_pays.issuer;
                    var src_amount = f_take_gets.value - p_take_gets.value + '/' + f_take_gets.currency + '/' + f_take_gets.issuer;

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