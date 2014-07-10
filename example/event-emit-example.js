var util = require('util');
var events = require('events');

var emitter = new events.EventEmitter();
var index = 0;

var callback = function(data) {
    index = index + 1;
    console.log("index:" + index + data);
    emitter.removeListener('hello-kitty', this);
    // if (emitter.listeners('hello-kitty').length == 0) {
    //     process.exit(1);
    // }
}
var removeL = function() {
    emitter.removeListener('hello-kitty', callback);
    setTimeout(addL, 2000);
    // console.log(util.inspect(server.listeners('hello-kitty')));
}
var addL = function() {
    emitter.addListener('hello-kitty', callback);
}
emitter.on('hello-kitty', callback);

var emith = function() {
    emitter.emit('hello-kitty', 'i love you');
}


setInterval(emith, 1000);

// setTimeout(process.exit(1), 20000);