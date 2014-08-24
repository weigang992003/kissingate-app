var _ = require('underscore');

function Loop(init_set) {
    this.init_set = init_set;
    this.cycle = false;
}

Loop.prototype.next = function(indexSet) {
    var self = this;

    var size = indexSet.length;
    result = getNext(indexSet, size);
    if (init_set.length == size) {
        var ranges = _.range(size);
        var isEqual = true;
        _.each(ranges, function(range) {
            if (init_set[range] != indexSet[range]) {
                isEqual = false;
            }
        })
        if (isEqual) {
            self.cycle = true;
        }
    }
    return result;
}

function getNext(indexSet, size) {
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

    while (_.contains(rest, first)) {
        rest.unshift(first);
        indexSet = rest;

        indexSet = nextIndexSet(indexSet, size);
        first = _.first(indexSet);
        rest = _.rest(indexSet);
    }

    return _.union([first], rest);
}

exports.Loop = Loop;