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

exports.ProfitUtil = ProfitUtil;