exports.drops = 1000000;
exports.maxAmountAllowed = 1;
exports.account = "rf9q1WE2Kdmv9AWtesCaANJyNxnFjp5T7z";
exports.secret = "23060c730623340e67ed484d775c00112a66be4474cb967890da872cb95a0da0";

exports.marketEvent = {
    buy: '-buy-price-change',
    sell: '-sell-price-change'
};

exports.strategyEvents = {
    deal: 'make-a-deal'
};

exports.mongodb_server = {
    host: '127.0.0.1',
    port: '27017',
    server_options: {},
    db_options: {
        w: -1
    }
};

exports.remote_options = {
    // see the API Reference for available options
//    trace: true,
    trusted: true,
    local_signing: true,
    local_fee: true,
    fee_cushion: 1.5,
    max_fee: 100,
    servers: [{
        host: 's1.ripple.com',
        port: 443,
        secure: true
    }, {
        host: 's-west.ripple.com',
        port: 443,
        secure: true
    }, {
        host: 's-east.ripple.com',
        port: 443,
        secure: true
    }]
};
