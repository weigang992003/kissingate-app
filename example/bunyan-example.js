var bunyan = require('bunyan');

require('../marketMaker/date-extend.js');

var logger = bunyan.createLogger({
    name: 'theFuture',
    streams: [{
        level: 'info',
        path: '../log/ripple-app/info-test.js'
    }]
});

var log = function() {
    var arguNum = arguments.length;
    if (arguNum == 0) {
        return;
    }
    if (arguments[0]) { //check if we want to log something, this value is boolean type.
        delete arguments[0];
        var date = new Date().format('yyyy-MM-dd-hh-mm-ss.S');
        arguments.time = date;
        logger.info(arguments);
    }
};

log(true, 'test');
// {"1":"test","name":"theFuture","hostname":"hzqlmms-MacBook-Pro.local","pid":20165,"level":30,"time":"2014-07-09-22-10-44.494","msg":"","v":0}