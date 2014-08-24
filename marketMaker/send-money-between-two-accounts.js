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

 // 0.01/BTC/rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q snapswap


 var asks = ["please input source account:", "please input dest account:", "please input value/curreny/issuer list:"];

 function ask(question) {
     var stdin = process.stdin,
         stdout = process.stdout;

     stdin.resume();
     stdout.write(question);

     stdin.once('data', function(data) {

         data = data.toString().trim();
         if (question == asks[0]) {
             mongodbManager.getAccount(data, function(result) {
                 source = result.account;
                 console.log("source:" + source);
                 crypto.decrypt(result.secret, function(result) {
                     sourceSecret = result;
                     ask(asks[1]);
                 });
             });
         } else if (question == asks[1]) {
             mongodbManager.getAccount(data, function(result) {
                 dest = result.account;
                 console.log("dest:" + dest);
                 ask(asks[2]);
             });
         } else if (question == asks[2]) {
             if (data.length != 0) {
                 remote.connect(function() {
                     _.each(data.split(","), function(amount) {
                         sendMoney(amount);
                     })
                 })
             } else {
                 connectRemote();
             }
         }
     });
 }

 ask(asks[0]);

 var remote = new ripple.Remote(remote_options);
 var Amount = ripple.Amount;

 var source;
 var sourceSecret;
 var dest;

 function connectRemote() {
     remote.connect(function() {
         console.log("remote connected!");
         if (dest) {
             remote.requestAccountLines(dest, function(err, result) {
                 if (err) console.log(err);
                 destLines = _.filter(result.lines, function(line) {
                     return line.limit != 0;
                 });
                 remote.requestAccountLines(source, function(err, result) {
                     if (err) console.log(err);
                     sourceLines = result.lines;
                     getNext();
                 });
             });
         }
     });
 }

 var next = 0;
 var sourceLines;
 var destLines;

 function getNext() {
     if (destLines.length > next) {
         var newLine = destLines[next];
         next = next + 1;

         var needSent = _.find(sourceLines, function(line) {
             return line.currency == newLine.currency && line.account == newLine.account;
         });
         console.log("needSent:", needSent);

         if (needSent && needSent.balance != 0) {
             var amount = needSent.balance + '/' + needSent.currency + '/' + needSent.account;
             emitter.emit('sendMoney', amount);
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
     tx.payment(source, dest, amount);
     tx.setFlags('PartialPayment');

     tx.on('success', function(res) {
         console.log('success');
         emitter.emit('getNext', getNext);
     });
     tx.on('error', function(res) {
         console.log(res);
     });

     if (sourceSecret) {
         tx.secret(sourceSecret);
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