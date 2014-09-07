var _ = require('underscore');
var AmountUtil = require('./amount-util.js').AmountUtil;
var TheFutureManager = require('./the-future-manager.js').TheFutureManager;

var au = new AmountUtil();
var tfm = new TheFutureManager();

var firstOrders;

function getFOS(accountId) {
    tfm.getFirstOrders(accountId, function(fos) {
        firstOrders = fos;
    });
}

function FirstOrderUtil(accountId) {
    getFOS(accountId);
};

FirstOrderUtil.prototype.canCreate = function(order) {
    var dst_currency = au.getCurrency(order.TakerGets);
    var src_currency = au.getCurrency(order.TakerPays);

    var orders = _.filter(firstOrders, function(o) {
        return src_currency == o.dst_currency && dst_currency == o.src_currency;
    });

    var hasProfit = false;
    orders.every(function(o) {
        if (o.quality * order.quality < 1) {
            hasProfit = true;
        }
        return !hasProfit;
    });

    return !hasProfit;
};

FirstOrderUtil.prototype.isFirstOrder = function(order) {
    var result = _.find(firstOrders, function(o) {
        return o.seq == order.seq;
    });

    return result ? true : false;
};

FirstOrderUtil.prototype.removeFirstOffer = function(offer, callback) {
    tfm.removeFirstOrder(offer, function(count) {
        if (count > 0) {
            firstOrders = _.map(firstOrders, function(o) {
                return o.seq != offer.seq && o.account != offer.account;
            });
        }
        if (callback) {
            callback();
        }
    });
}

FirstOrderUtil.prototype.createFirstOffer = function(record, callback) {
    tfm.saveFirstOrder(record, function() {
        if (firstOrders) {
            firstOrders.push(record);
        }

        if (callback) {
            callback();
        }
    });
}

exports.FirstOrderUtil = FirstOrderUtil;