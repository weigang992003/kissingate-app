var Logger = require('./log-util.js').CLogger;
var logger = new Logger();

function CmdUtil() {}


CmdUtil.prototype.buildCmd = function(taker_pays, taker_gets) {
    var req = {
        cmd: 'book',
        params: []
    }

    var param = {
        limit: 1,
        filter: 1,
        cache: 0,
    }

    param[taker_pays.currency] = [taker_pays.issuer];
    param[taker_gets.currency] = [taker_gets.issuer];
    param["pays_currency"] = [taker_pays.currency];
    param["gets_currency"] = [taker_gets.currency];

    if (taker_pays.currency == taker_gets.currency) {
        param["filter"] = 0;
        param["pays_issuer"] = [taker_pays.issuer];
        param["gets_issuer"] = [taker_gets.issuer];
        param[taker_pays.currency] = [taker_pays.issuer, taker_gets.issuer];
    }

    req.params.push(param);

    logger.logOffer(taker_gets, taker_pays);

    return req;
}

exports.CmdUtil = CmdUtil;