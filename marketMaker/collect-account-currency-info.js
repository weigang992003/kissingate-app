var ripple = require('../src/js/ripple');
var jsbn = require('../src/js/jsbn/jsbn.js');

var Remote = ripple.Remote;
var Amount = ripple.Amount;

var _ = require('underscore');
var config = require('./config.js');
var tfmjs = require('./the-future-manager.js');

var AmountUtil = require('./amount-util.js').AmountUtil;
var TrustLineService = require('./trust-line-service.js').TrustLineService;
var AccountInfoManager = require('./account-info-manager.js').AccountInfoManager;

var au = new AmountUtil();
var aim = new AccountInfoManager();

var remote = new Remote({
    // see the API Reference for available options
    // trace: true,
    trusted: true,
    local_signing: true,
    local_fee: true,
    fee_cushion: 1.5,
    max_fee: 100,
    servers: [{
        host: 's-west.ripple.com',
        port: 443,
        secure: true
    }, {
        host: 's-east.ripple.com',
        port: 443,
        secure: true
    }]
});

function remoteConnect() {
    remote.connect(function() {
        tls = new TrustLineService(remote, account);
        tls.getLines(function(lines) {
            console.log(lines);
            lines = _.filter(lines, function(line) {
                return line.limit != 0;
            });

            lines = _.map(lines, function(line) {
                return {
                    currency: line.currency,
                    issuer: line.account
                }
            });

            lines = _.groupBy(lines, function(line) {
                return line.currency;
            });

            currencyInfos = _.map(_.pairs(lines), function(pair) {
                return {
                    currency: pair[0],
                    issuers: _.pluck(pair[1], 'issuer')
                }
            });

            console.log(currencyInfos);

            _.each(currencyInfos, function(currencyInfo) {
                aim.saveCurrencyInfo(currencyInfo);
            })
        });

        remote.on('error', function(error) {
            throw new Error("remote error!");
        });

        remote.on('disconnect', function() {
            remoteConnect(env);
        });
    });
}

var account;
console.log("step1:getAccount!")
tfmjs.getAccount(config.marketMaker, function(result) {
    account = result.account;
    remoteConnect();
});