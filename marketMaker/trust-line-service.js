var _ = require('underscore');
var Amount = require('../src/js/ripple').Amount;

function TrustLineService(r, a) {
    this.remote = r;
    this.accountId = a;
    this.lines = [];
    this.account_balances = [];
}

TrustLineService.prototype.getLines = function(callback) {
    var remote = this.remote;
    var accountId = this.accountId;
    var account_balances = this.account_balances;

    remote.requestAccountLines(accountId, function() {
        lines = arguments[1].lines;
        _.each(lines, function(line) {
            account_balances[line.account + line.currency] = line.balance;
        });

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

exports.TrustLineService = TrustLineService;