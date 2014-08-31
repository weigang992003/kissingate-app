var _ = require('underscore');

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

function getIssuer(pays_or_gets) {
    return typeof pays_or_gets == "string" ? "rrrrrrrrrrrrrrrrrrrrrhoLvTp" : pays_or_gets.issuer;
}

function getCurrency(pays_or_gets) {
    return typeof pays_or_gets == "string" ? "XRP" : pays_or_gets.currency;
}

exports.minAmount = minAmount;
exports.getIssuer = getIssuer;
exports.getCurrency = getCurrency;