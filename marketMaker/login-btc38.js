var headers = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
    'Host': 'm.btc38.com',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.9; rv:30.0) Gecko/20100101 Firefox/30.0'
}

var http = require('http');
var fs = require('fs');
var iconv = require('iconv-lite');

var options = {
    host: 'm.btc38.com',
    port: 80,
    method: 'GET',
    headers: headers
};

// http.get(options, function(res) {
//     console.log("Got response: " + res.statusCode, res.headers);
//     var buffers = [],
//         size = 0;
//     res.on('data', function(buffer) {
//         buffers.push(buffer);
//         size += buffer.length;
//     });
//     res.on('end', function() {
//         var buffer = new Buffer(size),
//             pos = 0;
//         for (var i = 0, l = buffers.length; i < l; i++) {
//             buffers[i].copy(buffer, pos);
//             pos += buffers[i].length;
//         }
//         str = iconv.decode(buffer, 'utf-8');

//         console.log(str);

//         fs.writeFile("/tmp/btc38.html", str, function(err) {
//             if (err) {
//                 console.log(err);
//             } else {
//                 console.log("The file was saved!");
//             }
//         });
//     });
// }).on('error', function(e) {
//     console.log("Got error: " + e.message);
// });

headers = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate",
    "Accept-Language": "en-US,en;q=0.5",
    "Connection": "keep-alive",
    "Host": "xui.ptlogin2.qq.com",
    "Referer": "http://openapi.qzone.qq.com/oauth/show?which=Login&display=pc&response_type=code&client_id=100423789&redirect_uri=http%3a%2f%2fm.btc38.com%2fqq_login_callback.php&state=t",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.9; rv:30.0) Gecko/20100101 Firefox/30.0"
}

options = {
    host: "xui.ptlogin2.qq.com",
    port: 80,
    method: "GET",
    headers: headers,
    path: "/cgi-bin/xlogin?appid=716027609&style=23&login_text=%E6%8E%88%E6%9D%83%E5%B9%B6%E7%99%BB%E5%BD%95&hide_title_bar=1&hide_border=1&target=self&s_url=http%3A%2F%2Fopenapi.qzone.qq.com%2Foauth%2Flogin_jump&pt_3rd_aid=100423789&pt_feedback_link=http%3A%2F%2Fsupport.qq.com%2Fwrite.shtml%3Ffid%3D780%26SSTAG%3Dwww.btc38.com.appid100423789"
}

http.get(options, function(res) {
    var setCookie = res.headers['set-cookie'];
    console.log(setCookie);
}).on('error', function(e) {
    console.log("Got error: " + e.message);
});