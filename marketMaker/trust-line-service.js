var _ = require('underscore');
var Amount = require('../src/js/ripple').Amount;

var io = require('socket.io-client');
var abio = io.connect('http://localhost:3004/ab');

var config = require('./config.js');
var xrpIssuer = config.xrpIssuer;

function TrustLineService(r, a) {
    this.remote = r;
    this.accountId = a;
    this.lines = [];
    this.account_balances = {};
    this.issuerMap = {};

    this.listenBalanceUpdate();
}

TrustLineService.prototype.getLines = function(callback) {
    var self = this;
    var remote = this.remote;
    var accountId = this.accountId;
    var issuerMap = this.issuerMap;
    var account_balances = this.account_balances;

    remote.requestAccountBalance(accountId, function(err, balance) {
        if (err) {
            throw new Error("error happen when we get account root!");
        }
        account_balances[xrpIssuer + "XRP"] = balance.to_text();

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
    });
};

TrustLineService.prototype.getBalance = function(issuer, currency) {
    var value = this.account_balances[issuer + currency];
    if (value && currency == "XRP") {
        return Amount.from_json(value + "");
    }

    if (value) {
        return Amount.from_json({
            'issuer': issuer,
            'currency': currency,
            'value': value
        });
    }
}

TrustLineService.prototype.setBalance = function(issuer, currency, balance) {
    this.account_balances[issuer + currency] = balance;
};

TrustLineService.prototype.getIssuers = function(currency) {
    return currency == "XRP" ? [xrpIssuer] : this.issuerMap[currency];
}

TrustLineService.prototype.listenBalanceUpdate = function() {
    var self = this;
    abio.on('ab', function(issuer, currency, balance) {
        console.log(issuer, currency, balance);
        self.setBalance(issuer, currency, balance);
    });
};

exports.TrustLineService = TrustLineService;