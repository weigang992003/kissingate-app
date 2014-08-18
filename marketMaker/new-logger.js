var bunyan = require('bunyan');

require('./date-extend.js');

function Logger(action) {
    var date = new Date().format('yyyy-MM-dd-hh-mm-ss.S');
    this.logger = bunyan.createLogger({
        name: 'ripple-app',
        streams: [{
            level: 'info',
            path: './log/' + action + '-info-' + date + '.js'
        }]
    });
    process.on('uncaughtException', function(err) {
        process.removeListener('uncaughtException', arguments.callee);
        self.logger.error(err);
        process.exit(1);
    });
    return this;
};

Logger.prototype.log = function() {
    var self = this;
    var arguNum = arguments.length;
    if (arguNum == 0) {
        return;
    }
    if (arguments[0]) { //check if we want to log something, this value is boolean type.
        delete arguments[0];

        var date = new Date().format('yyyy-MM-dd-hh-mm-ss-S');
        arguments.time = date;
        self.logger.info(arguments);
    }
};

Logger.prototype.error = function() {
    var self = this;
    var arguNum = arguments.length;
    if (arguNum == 0) {
        return;
    }
    if (arguments[0]) { //check if we want to log something, this value is boolean type.
        delete arguments[0];

        var date = new Date().format('yyyy-MM-dd-hh-mm-ss-S');
        arguments.time = date;
        self.logger.error(arguments);
    }
};

exports.Logger = Logger;