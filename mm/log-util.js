 var AmountUtil = require('./amount-util.js').AmountUtil;
 var au = new AmountUtil();

 function Logger() {};


 Logger.prototype.logOrder = function(order) {
     var pays_issuer = au.getIssuer(order.TakerPays);
     var gets_issuer = au.getIssuer(order.TakerGets);
     var pays_currency = au.getCurrency(order.TakerPays);
     var gets_currency = au.getCurrency(order.TakerGets);

     console.log("order:" + pays_currency + "(" + pays_issuer + ")->" + gets_currency + "(" + gets_issuer + ")");
 }

 Logger.prototype.logOffer = function(pays, gets) {
     var pays_issuer = au.getIssuer(pays);
     var gets_issuer = au.getIssuer(gets);
     var pays_currency = au.getCurrency(pays);
     var gets_currency = au.getCurrency(gets);

     console.log("order:" + pays_currency + "(" + pays_issuer + ")->" + gets_currency + "(" + gets_issuer + ")");
 }

 exports.CLogger = Logger;