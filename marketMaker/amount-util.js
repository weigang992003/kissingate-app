var _ = require('underscore');

var ripple = require('../src/js/ripple');
var Amount = ripple.Amount;

function minAmount(amounts) {
    if (!amounts || amounts.length == 0) {
        return;
    }
    if (amounts.length == 1) {
        return amounts[0];
    }
    var minAmount = amounts[0];

    _.each(amounts, function(amount) {
        if (minAmount.compareTo(amount) == 1) {
            minAmount = amount;
        }
    })

    return minAmount;
}

function getIssuer(amountJson) {
    return typeof amountJson == "string" ? "rrrrrrrrrrrrrrrrrrrrrhoLvTp" : amountJson.issuer;
}

function getCurrency(amountJson) {
    return typeof amountJson == "string" ? "XRP" : amountJson.currency;
}

function setValue(src_amount, dst_amount) {
    if (src_amount.currency().to_json() == "XRP") {
        return dst_amount;
    }

    var src_amount_json = src_amount.to_json();
    var dst_amount_json = dst_amount.to_json();

    src_amount_json.value = dst_amount_json.value;

    return Amount.from_json(src_amount_json);
}

exports.Amount = Amount;
exports.setValue = setValue;
exports.minAmount = minAmount;
exports.getIssuer = getIssuer;
exports.getCurrency = getCurrency;