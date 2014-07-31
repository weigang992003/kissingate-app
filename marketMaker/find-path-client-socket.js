var socketIO = require('socket.io-client');
var txio = new socketIO('http://localhost:3000/fp');

txio.on('connect', function() {
    txio.on('profit', function(alt1, alt2, factor, send_max_rate) {
        console.log(alt1);
        console.log(alt2);
        console.log(factor);
        console.log(send_max_rate);
    })
});