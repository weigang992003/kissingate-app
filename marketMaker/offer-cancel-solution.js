var _ = require('underscore');

var crypto = require('./crypto-util.js');
var ripple = require('../src/js/ripple');
var jsbn = require('../src/js/jsbn/jsbn.js');
var config = require('./config.js');
var tfmjs = require('./the-future-manager.js');
var rsjs = require('./remote-service.js');

var tfm = new tfmjs.TheFutureManager();

var account;
var secret;
console.log("step1:getAccount!")
tfm.getAccount(config.marketMaker, function(result) {
    account = result.account;
    secret = result.secret;
    decrypt(secret);
});

function decrypt(encrypted) {
    console.log("step2:decrypt secret!")
    crypto.decrypt(encrypted, function(result) {
        secret = result;
        tfm.getEnv(function(result) {
            remoteConnect(result.env);
        })
    });
}

function remoteConnect(env) {
    console.log("step3:connect to remote!")
    rsjs.getRemote(env, function(r) {
        remote = r;

        remote.connect(function() {
            if (!secret) {
                console.log("secret not ready!");
                return;
            }
            remote.requestAccountOffers(account, function() {
                var offers = arguments[1].offers; //the second parameters are offers info
                _.each(offers, function(offer) {
                    remote.transaction().offerCancel(account, offer.seq).secret(secret).on('success', function() {
                        console.log('offerCancel');
                    }).submit();

                })
            });
        });
    });
}

function close() {
    remote.disconnect(function() {
        console.log("disconnect");
        process.exit(1);
    })
}