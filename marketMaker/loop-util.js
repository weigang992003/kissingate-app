var _ = require('underscore');

var indexSet;
var size;
var loop = 0;

function init(p_index_set, p_size) {
    indexSet = p_index_set;
    size = p_size;
}

function next() {
    if (!indexSet || !size) {
        return;
    }

    var first = _.first(indexSet);
    var rest = _.rest(indexSet);
    first = (first + 1) % size;
    if (rest.length == 0) {
        return [first];
    }

    if (first == 0) {
        rest = nextIndexSet(rest, size);
    }

    if (_.isEqual([0], _.union([first], rest))) {
        loop++;
    }

    while (_.contains(rest, first)) {
        rest.unshift(first);
        indexSet = rest;

        indexSet = nextIndexSet(indexSet, size);
        first = _.first(indexSet);
        rest = _.rest(indexSet);
    }

    return _.union([first], rest);
}

exports.init = init;
exports.next = next;