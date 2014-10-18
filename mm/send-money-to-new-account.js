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

 Logger.getNewLog('send-money-to-account');

 var emitter = new events.EventEmitter();
 emitter.on('getNext', getNext);
 emitter.on('sendMoney', sendMoney);

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
 var secret;
 mongodbManager.getAccount(config.mother, function(result) {
     crypto.decrypt(result.secret, function(result) {
         secret = result;
     });
 });

 var newa;
 mongodbManager.getAccount(config.tradeFailed, function(accountInfo) {
     newa = accountInfo.account;
 });

 remote.connect(function() {
     if (newa) {
         remote.requestAccountLines(newa, function(err, result) {
             if (err) console.log(err);
             newaLines = _.filter(result.lines, function(line) {
                 return line.limit != 0;
             });
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

         var limit = line.limit + '/' + line.currency + '/' + line.account;
         var needSent = _.find(newaLines, function(nline) {
             return (nline.limit + '/' + nline.currency + '/' + nline.account) == limit;
         });

         if (line.limit != 0 && line.balance != 0 && needSent) {
             var balance = math.round((line.balance / 4), 6);
             if (balance - needSent.balance > 0) {
                 var finalSend = math.round((balance - needSent.balance), 6);
                 var amount = finalSend + '/' + line.currency + '/' + line.account;
                 emitter.emit('sendMoney', amount);
             } else {
                 emitter.emit('getNext', getNext);
             }
         } else {
             emitter.emit('getNext', getNext);
         }
     } else {
         close();
     }
 }

 function sendMoney(amount) {
     Logger.log(true, "amount we sent:" + amount);

     var tx = remote.transaction();
     tx.payment(mother, newa, amount);
     tx.setFlags('PartialPayment');

     tx.on('success', function(res) {
         console.log('success');
         emitter.emit('getNext', getNext);
     });
     tx.on('error', function(res) {
         console.log(res);
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