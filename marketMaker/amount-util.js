var math = require('mathjs');
var _ = require('underscore');
var drops = require('./config.js').drops;
var Amount = require('../src/js/ripple').Amount;
var profit_min_volumns = require('./config.js').profit_min_volumns;


function AmountUtil() {}

AmountUtil.prototype.calPrice = function(pays, gets) {
    if (getCurrency(pays) == "XRP") {
        return math.round(pays / (drops * gets.value), 15);
    }
    if (getCurrency(gets) == "XRP") {
        return math.round(pays.value * drops / gets, 15);
    }
    return math.round(pays.value / gets.value, 15);
};

AmountUtil.prototype.isVolumnAllowed = function(amount) {
    if (amount instanceof Amount) {
        if (amount.is_zero()) {
            return false;
        }
        amount = amount.to_json();
    }

    var currency = getCurrency(amount);

    var min_volumn = profit_min_volumns[currency];

    if (min_volumn) {
        if (currency == "XRP") {
            return min_volumn - amount < 0;
        } else {
            return min_volumn - amount.value < 0;
        }
    }

    return true;
}

AmountUtil.prototype.minAmount = function(amounts) {
    return minAmount(amounts);
}

AmountUtil.prototype.getIssuer = function(amountJson) {
    return getIssuer(amountJson);
};

AmountUtil.prototype.getPrice = function(order, pays_currency, gets_currency) {
    return getPrice(order, pays_currency, gets_currency);
}

AmountUtil.prototype.getCurrency = function(amountJson) {
    return getCurrency(amountJson);
}

AmountUtil.prototype.setValue = function(src_amount, dst_amount) {
    return setValue(src_amount, dst_amount);
}

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

function getPrice(order, pays_currency, gets_currency) {
    if (gets_currency == "XRP") {
        return math.round(order.quality * drops, 15) + "";
    } else if (pays_currency == "XRP") {
        return math.round(order.quality / drops, 15) + "";
    } else {
        return math.round(order.quality - 0, 15) + "";
    }
}

exports.Amount = Amount;
exports.setValue = setValue;
exports.getPrice = getPrice;
exports.minAmount = minAmount;
exports.getIssuer = getIssuer;
exports.AmountUtil = AmountUtil;
exports.getCurrency = getCurrency;