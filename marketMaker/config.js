exports.drops = 1000000;

exports.motherAccount = "rf9q1WE2Kdmv9AWtesCaANJyNxnFjp5T7z";

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
    // trace: true,
    trusted: true,
    local_signing: true,
    local_fee: true,
    fee_cushion: 1.5,
    max_fee: 100,
    servers: [{
        host: 's1.ripple.com',
        port: 443,
        secure: true
    }]
};

exports.currency_unit = {
    "XRP": "40000000",
    "BTC": "0.00016",
    "USD": "0.200",
    "JPY": "20",
    "CNY": "1.400",
    "FMM": "1.400",
    "EUR": "0.160",
    "CAD": "0.200",
    "ILS": "2.000",
    "CHF": "0.200",
    "NZD": "0.200"
};

exports.mother = -1;
exports.newAccount = 0;
exports.tradeFailed = 1;
exports.marketMaker = 2;

exports.factorWeight = 5;
exports.profitRate = 1;
exports.delayWhenFailure = 60000;
