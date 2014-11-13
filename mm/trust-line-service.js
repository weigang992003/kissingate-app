var _ = require('underscore');
var Amount = require('../src/js/ripple').Amount;

var io = require('socket.io-client');
var abio = io.connect('http://localhost:3004/ab');

var config = require('./config.js');
var xrpIssuer = config.xrpIssuer;
var profit_min_volumns = config.profit_min_volumns;

function TrustLineService(r, a) {
    this.remote = r;
    this.accountId = a;
    this.lines = [];
    this.account_limits = {};
    this.account_balances = {};
    this.issuerMap = {};

    this.listenBalanceUpdate();
    this.listenAccount();
}

TrustLineService.prototype.listenAccount = function() {
    var self = this;
    var remote = self.remote;
    if (remote) {
        var accountToListen = self.accountId;

        var account = remote.addAccount(accountToListen);

        account.on('transaction', function(tx) {
            _.each(tx.meta.AffectedNodes, function(affectedNode) {
                var modifiedNode = affectedNode.ModifiedNode;
                if (!modifiedNode) {
                    return;
                }

                if (modifiedNode.LedgerEntryType == "AccountRoot") {
                    var finalFields = modifiedNode.FinalFields;
                    if (finalFields && finalFields.Account == accountId) {
                        account_balances[xrpIssuer + "XRP"] = finalFields.Balance;
                    }
                }

                if (modifiedNode.LedgerEntryType == "RippleState") {
                    var finalFields = modifiedNode.FinalFields;
                    if (finalFields && finalFields.HighLimit.issuer == accountId) {
                        account_balances[finalFields.LowLimit.issuer + finalFields.Balance.currency] = 0 - finalFields.Balance.value + "";
                    }

                    if (finalFields && finalFields.LowLimit.issuer == accountId) {
                        account_balances[finalFields.HighLimit.issuer + finalFields.Balance.currency] = finalFields.Balance.value;
                    }
                }
            });
        });
    }
};

TrustLineService.prototype.getLines = function(callback) {
    var self = this;
    var remote = this.remote;
    var accountId = this.accountId;
    var issuerMap = this.issuerMap;
    var account_limits = this.account_limits;
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

                account_limits[line.account + line.currency] = line.limit;
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
            self.account_limits = account_limits;
            self.account_balances = account_balances;

            console.log("get account_limits success!!");

            if (callback) {
                callback(lines);
            }
        });
    });
};

function randomInt(low, high) {
    return Math.floor(Math.random() * (high - low) + low);
}

TrustLineService.prototype.getBalance = function(issuer, currency) {
    //this is for debug purpose
    if (!this.remote || !this.accountId) {
        var value = profit_min_volumns[currency];

        if (currency == "XRP") {
            return randomInt(0, 2) == 0 ? Amount.from_json(value) : Amount.from_json("" + value / 2);
        } else {
            if (value) {
                return randomInt(0, 2) == 0 ? Amount.from_json({
                    'issuer': issuer,
                    'currency': currency,
                    'value': value
                }) : Amount.from_json({
                    'issuer': issuer,
                    'currency': currency,
                    'value': "" + value / 2
                });
            } else {
                return Amount.from_json({
                    'issuer': issuer,
                    'currency': currency,
                    'value': "1000000"
                });
            }
        }
    }

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

TrustLineService.prototype.overLimit = function(issuer, currency) {
    if (currency == "XRP") {
        return false;
    }

    var limit = this.account_limit[issuer + currency];
    var value = this.account_balances[issuer + currency];
    if (limit && value) {
        return value - limit >= 0;
    }

    return true;
};

TrustLineService.prototype.getCapacity = function(issuer, currency) {
    //this is for debug purpose
    if (currency == "XRP") {
        return Amount.from_json("100000000000000");
    }

    if (!this.remote || !this.accountId) {
        if (currency != "XRP") {
            return Amount.from_json({
                'issuer': issuer,
                'currency': currency,
                'value': "1000000000000000"
            });
        }
    }

    var limit = this.account_limits[issuer + currency];
    var value = this.account_balances[issuer + currency];

    if (limit && value && limit - value > 0) {
        return Amount.from_json({
            'issuer': issuer,
            'currency': currency,
            'value': limit - value + ""
        });
    }

    return Amount.from_json({
        'issuer': issuer,
        'currency': currency,
        'value': "0"
    });;
}

exports.TrustLineService = TrustLineService;