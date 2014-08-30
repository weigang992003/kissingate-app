var _ = require('underscore');
var Amount = require('../src/js/ripple').Amount;

function TrustLineService(r, a) {
    this.remote = r;
    this.accountId = a;
    this.lines = [];
    this.account_balances = {};
    this.issuerMap = {};
}

TrustLineService.prototype.getLines = function(callback) {
    var self = this;
    var remote = this.remote;
    var accountId = this.accountId;
    var issuerMap = this.issuerMap;
    var account_balances = this.account_balances;

    remote.requestAccountLines(accountId, function() {
        lines = arguments[1].lines;
        _.each(lines, function(line) {
            if (line.limit == 0) {
                return;
            }

            account_balances[line.account + line.currency] = line.balance;

            var issuers = issuerMap[line.currency];
            if (!issuers) {
                issuers = [];
            }
            if (!_.contains(issuers, line.account)) {
                issuers.push(line.account);
            }
            issuerMap[line.currency] = issuers;
        });

        self.issuerMap = issuerMap;
        self.account_balances = account_balances;

        if (callback) {
            callback(lines);
        }
    });
};

TrustLineService.prototype.getBalance = function(issuer, currency) {
    var value = this.account_balances[issuer + currency];
    return Amount.from_json({
        'issuer': issuer,
        'currency': currency,
        'value': value
    });
}

TrustLineService.prototype.getIssuers = function(currency) {
    return currency == "XRP" ? ["rrrrrrrrrrrrrrrrrrrrrhoLvTp"] : this.issuerMap[currency];
}

exports.TrustLineService = TrustLineService;