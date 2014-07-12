var iso4217 = require('./iso4217.js');
var ripple = require('../src/js/ripple');
var Amount = ripple.Amount;

function rpamount(input, options) {
    var opts = options;

    if ("number" === typeof opts) {
        opts = {
            rel_min_precision: opts
        };
    } else if ("object" !== typeof opts) {
        opts = {};
    }

    if (!input) return "n/a";

    if (opts.xrp_human && input === ("" + parseInt(input, 10))) {
        input = input + ".0";
    }

    // Reference date
    // XXX Should maybe use last ledger close time instead
    if (!opts.reference_date) {
        opts.reference_date = new Date();
    }

    var amount = Amount.from_json(input);
    if (!amount.is_valid()) return "n/a";

    // Currency default precision
    var currency = iso4217[amount.currency().to_human()];
    var cdp = ("undefined" !== typeof currency) ? currency[1] : 4;

    // Certain formatting options are relative to the currency default precision
    if ("number" === typeof opts.rel_precision) {
        opts.precision = cdp + opts.rel_precision;
    }
    if ("number" === typeof opts.rel_min_precision) {
        opts.min_precision = cdp + opts.rel_min_precision;
    }

    // If no precision is given, we'll default to max precision.
    if ("number" !== typeof opts.precision) {
        opts.precision = 16;
    }

    // But we will cut off after five significant decimals
    if ("number" !== typeof opts.max_sig_digits) {
        opts.max_sig_digits = 5;
    }

    var out = amount.to_human(opts);

    // If amount is very small and only has zeros (ex. 0.0000), raise precision
    // to make it useful.
    if (out.length > 1 && 0 === +out && !opts.hard_precision) {
        opts.precision = 20;

        out = amount.to_human(opts);
    }

    return out;
};

module.exports = rpamount;