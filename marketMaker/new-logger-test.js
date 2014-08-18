var Logger = require('./new-logger.js').Logger;

var logger = new Logger("test");

logger.log(true, "i am here!");

var logger1 = new Logger("test1");

logger1.log(true, "i am here!!!!");