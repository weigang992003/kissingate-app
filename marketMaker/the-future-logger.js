var bunyan = require('bunyan');

require('./date-extend.js');
var mongoManager = require('./mongodb-manager.js');

function Logger() {
    this.logger;
    this.getNewLog();
    setInterval(this.getNewLog, 86400000); //we will get new log each day.
};

Logger.prototype.getNewLog = function() {
    var self = this;

    var date = new Date().format('yyyy-MM-dd-hh-mm-ss.S');
    self.logger = bunyan.createLogger({
        name: 'ripple-app',
        streams: [{
            level: 'info',
            path: './log/ripple-info-' + date + '.js'
        }, {
            level: 'error',
            path: './log/ripple-error-' + date + '.js' // log ERROR and above to a file
        }]
    });
    process.on('uncaughtException', function(err) {
        process.removeListener('uncaughtException', arguments.callee);
        self.logger.error(err);
        process.exit(1);
    });
}

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

exports.TFLogger = new Logger();