var io = require('socket.io').listen(3000);
var chat = io.of('/chat');

setInterval(emitM, 3000);

function emitM() {
    chat.emit('a message', {
        everyone: 'in',
        '/chat': 'will get'
    }, {
        abc: 'abc'
    });
}