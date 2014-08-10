var fs = require('fs');
var http = require('http');
var iconv = require('iconv-lite');
var mongodbManager = require('./the-future-manager.js');

var cookie;
mongodbManager.getCookie('btc38', function(cookie) {
    getBtcHomePage(cookie);
});

function getBtcHomePage(cookie) {
    console.log(cookie);
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.9; rv:30.0) Gecko/20100101 Firefox/30.0',
        "Cookie": cookie
    };

    var options = {
        host: 'm.btc38.com',
        port: 80,
        headers: headers
    };

    http.get(options, function(res) {
        console.log("Got response: " + res.statusCode, res.headers);

        var buffers = [],
            size = 0;
        res.on('data', function(buffer) {
            buffers.push(buffer);
            size += buffer.length;
        });
        res.on('end', function() {
            var buffer = new Buffer(size),
                pos = 0;
            for (var i = 0, l = buffers.length; i < l; i++) {
                buffers[i].copy(buffer, pos);
                pos += buffers[i].length;
            }
            // str = iconv.decode(buffer, 'utf8');

            var str = buffer.toString('utf-8');

            // console.log(buffer.toString('utf-8'));

            fs.writeFile("/tmp/btc38.html", str, function(err) {
                if (err) {
                    console.log(err);
                } else {
                    console.log("The file was saved!");
                    process.exit(1);
                }
            });
        });
    }).on('error', function(e) {
        console.log("Got error: " + e.message);
    });

    options['path'] = '/getTradeInfo.php?coin_name=XRP'
}