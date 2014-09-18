var Logger = require('./new-logger.js').Logger;
var fohLogger = new Logger('first-order-history');

var ripple = require('../src/js/ripple');
var jsbn = require('../src/js/jsbn/jsbn.js');

var Remote = ripple.Remote;
var Amount = ripple.Amount;

var _ = require('underscore');
var config = require('../marketMaker/config.js');

var AmountUtil = require('./amount-util.js').AmountUtil;
var AccountInfoManager = require('./account-info-manager.js').AccountInfoManager;

var au = new AmountUtil();
var aim = new AccountInfoManager();

var drops = config.drops;

var ledger_current_index;
var ledger_index_start;
var ledger_index_end;
var account;

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
            lines = _.map(lines, function(line) {
                if (line.limit != 0) {
                    return {
                        currency: line.currency,
                        issuer: line.account
                    }
                }
            })

            lines = _.groupBy(lines, function(line) {
                return line.currency;
            });

            currencyInfos = _.map(_.pairs(lines), function(pair) {
                return {
                    currency: pair[0],
                    issuers: pair[1]
                }
            });
        });

        remote.on('error', function(error) {
            throw new Error("remote error!");
        });

        remote.on('disconnect', function() {
            remoteConnect(env);
        });
    });
}



remoteConnect();