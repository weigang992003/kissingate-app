var fs = require('fs');
var http = require('http');
var mongodbManager = require('./mongodb-manager.js');

mongodbManager.getCookie('xiami', function(cookie) {
    var headers = {
        "Accept":"*/*",
        "Content-Length":0,
        "Host": "www.xiami.com",
        "Referer": "http://www.xiami.com/",
        "X-Requested-With":"XMLHttpRequest",
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.9; rv:30.0) Gecko/20100101 Firefox/30.0',
        "Cookie":cookie
    };

    var options = {
        host: 'www.xiami.com',
        port: 80,
        path: '/task/signin',
        method:"POST",
        headers: headers,
    };

    var req = http.request(options, function(res) {
        res.on('data',function(data){
            console.log("res:"+ data);
            process.exit(1);
        })
    });

    req.on('error', function(e) {
        fs.writeFile("/tmp/xiami-error.log", "Got error: " + e.message, function(err) {
            if (err) {
                console.log(err);
            } 
        });
    });

    req.end();
});