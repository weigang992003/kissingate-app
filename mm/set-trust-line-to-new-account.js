 var http = require('http');
 var math = require('mathjs');
 var _ = require('underscore');
 var events = require('events');

 var config = require('./config.js');
 var crypto = require('./crypto-util.js');
 var ripple = require('../src/js/ripple');
 var jsbn = require('../src/js/jsbn/jsbn.js');
 var mongodbManager = require('./the-future-manager.js');

 var Logger = require('./the-future-logger.js').TFLogger;

 Logger.getNewLog('set-trust-line-to-account');

 var emitter = new events.EventEmitter();
 emitter.on('getNext', getNext);
 emitter.on('setTrustLine', setTrustLine);

 var remote_options = remote_options = {
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
     }]
 };

 var remote = new ripple.Remote(remote_options);
 var Amount = ripple.Amount;

 var mother = config.motherAccount;

 var newa;
 var secret;
 mongodbManager.getAccount(1, function(account) {
     newa = account.account;
     crypto.decrypt(account.secret, function(decryptText) {
         secret = decryptText;
     });
 })

 remote.connect(function() {
     if (newa) {
         remote.requestAccountLines(newa, function(err, result) {
             if (err) console.log(err);
             newaLines = result.lines;
             remote.requestAccountLines(mother, function(err, result) {
                 if (err) console.log(err);
                 lines = result.lines;
                 getNext();
             });
         });
     }
 });

 var next = 0;
 var lines;
 var newaLines;

 function getNext() {
     if (lines.length > next) {
         var line = lines[next];
         next = next + 1;
         if (line.limit != 0) {
             var amount = line.limit + '/' + line.currency + '/' + line.account;
             emitter.emit('setTrustLine', amount);
         } else {
             emitter.emit('getNext', getNext);
         }
     } else {
         close();
     }
 }

 function setTrustLine(amount) {
     var created = _.find(newaLines, function(line) {
         return amount == line.limit + '/' + line.currency + '/' + line.account;
     });
     if (created) {
         emitter.emit('getNext', getNext);
         return;
     }

     Logger.log(true, "we set a trust line:" + amount);

     var tx = remote.transaction();

     tx.rippleLineSet(newa, amount);
     tx.setFlags('NoRipple');
     tx.on('success', function(res) {
         emitter.emit('getNext', getNext);
     });
     tx.on('error', function(res) {
         Logger.log(true, res);
     });

     if (secret) {
         tx.secret(secret);
     } else {
         return;
     }
     tx.submit();
 }

 function close() {
     remote.disconnect(function() {
         process.exit(1);
     })
 }