var Logger = require('./log-util.js').CLogger;
var logger = new Logger();

var AmountUtil = require('./amount-util.js').AmountUtil;
var au = new AmountUtil();

function CmdUtil() {}


CmdUtil.prototype.buildCmd = function(taker_pays, taker_gets, initParam) {
    var req = {
        cmd: 'book',
        params: []
    }

    var param;
    if (!initParam) {
        param = {
            limit: 1,
            filter: 1,
            cache: 0,
        }
    } else {
        param = initParam;
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

    // logger.logOffer(taker_gets, taker_pays);

    return req;
}

CmdUtil.prototype.buildByIssuerNCurrency = function(pays_issuer, pays_currency, gets_issuer, gets_currency) {
    var cmd = {
        "cmd": "book",
        "params": {
            "pays_currency": [pays_currency],
            "gets_currency": [gets_currency]
        },
        "limit": 1,
        "filter": 1,
        "cache": 0
    }

    if (pays_currency == gets_currency) {
        cmd.filter = 0;
        cmd.params[pays_currency] = [pays_issuer, gets_issuer];
        cmd.params["pays_issuer"] = [pays_issuer];
        cmd.params["gets_issuer"] = [gets_issuer];
    } else {
        cmd.params[pays_currency] = [pays_issuer];
        cmd.params[gets_currency] = [gets_issuer];
    }

    // console.log(cmd);

    return cmd;
}

CmdUtil.prototype.buildByAmount = function(taker_pays, taker_gets) {
    var taker_pays_json = taker_pays.to_json();
    var taker_gets_json = taker_gets.to_json();

    var pays_issuer = au.getIssuer(taker_pays_json);
    var pays_currency = au.getCurrency(taker_pays_json);
    var gets_issuer = au.getIssuer(taker_gets_json);
    var gets_currency = au.getCurrency(taker_gets_json);

    return this.buildByIssuerNCurrency(pays_issuer, pays_currency, gets_issuer, gets_currency);
}

exports.CmdUtil = CmdUtil;