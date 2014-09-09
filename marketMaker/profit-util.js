var _ = require('underscore');
var config = require('./config.js');
var aujs = require('./amount-util.js');

var AmountUtil = aujs.AmountUtil;
var au = new AmountUtil();
var transfer_rates = config.transfer_rates;

function ProfitUtil() {}

ProfitUtil.prototype.getProfitRate = function(order, profitRate) {
    var finalProfit = profitRate;
    var transfer_rate = transfer_rates[au.getIssuer(order.TakerGets)];
    if (transfer_rate) {
        finalProfit = finalProfit - transfer_rate;
    }
    var transfer_rate = transfer_rates[au.getIssuer(order.TakerPays)];
    if (transfer_rate) {
        finalProfit = finalProfit - transfer_rate;
    }
    return finalProfit;
};

ProfitUtil.prototype.getMultiProfitRate = function(orders, init_profit_rate) {
    var self = this;
    var finalProfit = init_profit_rate;
    _.each(orders, function(order) {
        finalProfit = self.getProfitRate(order, finalProfit);
    });

    return finalProfit;
}

exports.ProfitUtil = ProfitUtil;