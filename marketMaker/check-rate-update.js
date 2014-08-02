function checkIfRateUpdated(type, alt1, alt2, factor, send_max_rate) {
    var src_1_currencies = [];
    if (typeof alt1.source_amount == "string") {
        src_1_currencies.push({
            currency: 'XRP',
            issuer: 'rrrrrrrrrrrrrrrrrrrrrhoLvTp'
        })
    } else {
        src_1_currencies.push(alt1.source_amount);
    }

    var src_2_currencies = [];
    if (typeof alt2.source_amount == "string") {
        src_2_currencies.push({
            currency: 'XRP',
            issuer: 'rrrrrrrrrrrrrrrrrrrrrhoLvTp'
        })
    } else {
        src_2_currencies.push(alt2.source_amount);
    }

    var betterPath1 = false;
    var betterPath2 = false;

    var pathFind1 = new PathFind(remote, account, account, Amount.from_json(alt1.dest_amount), src_1_currencies);
    pathFind1.on('update', function(res) {
        var raw = res.alternatives[0];
        if (raw) {
            var rate = Amount.from_json(raw.source_amount).ratio_human(Amount.from_json(alt1.dest_amount)).to_human().replace(',', '');
            var currentRate = parseFloat(rate);
            var rate1 = parseFloat(alt1.rate);
            if (currentRate <= rate1) {
                betterPath1 = true;
                emitter.once('goPay', goPay);
                emitter.emit('goPay', type, alt1, alt2, factor, send_max_rate, betterPath1, betterPath2)
            }
        }
    });

    var pathFind2 = new PathFind(remote, account, account, Amount.from_json(alt2.dest_amount), src_2_currencies);
    pathFind2.on('update', function(res) {
        var raw = res.alternatives[0];
        if (raw) {
            var rate = Amount.from_json(raw.source_amount).ratio_human(Amount.from_json(alt2.dest_amount)).to_human().replace(',', '');
            var currentRate = parseFloat(rate);
            var rate2 = parseFloat(alt2.rate);
            if (currentRate <= rate2) {
                betterPath2 = true;
                emitter.once('goPay', goPay);
                emitter.emit('goPay', type, alt1, alt2, factor, send_max_rate, betterPath1, betterPath2)
            }
        }
    });

    pathFind1.create();
    pathFind2.create();
}

function goPay(type, alt1, alt2, factor, send_max_rate, betterPath1, betterPath2) {
    if (betterPath1 && betterPath2) {
        var currencyPair = type.split(":");
        if (_.contains(currencies, currencyPair[0]) && _.contains(currencies, currencyPair[1])) {
            console.log(currencies);
            currencies = _.without(currencies, currencyPair[0], currencyPair[1]);
            payment(type, alt1, alt2, factor, send_max_rate);
        }
    }
}