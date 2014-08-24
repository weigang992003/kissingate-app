var _ = require('underscore');

function Loop(init_set) {
    this.init_set = init_set;
    this.cycle = false;
}

Loop.prototype.next = function(indexSet, size) {
    var self = this;

    indexSet = nextIndexSet(indexSet, size);

    var len = indexSet.length;
    if (self.init_set.length == len) {
        var isEqual = true;

        var ranges = _.range(len);
        _.each(ranges, function(range) {
            if (self.init_set[range] != indexSet[range]) {
                isEqual = false;
            }
        });

        if (isEqual) {
            self.cycle = true;
        }
    }

    return indexSet;
}

Loop.prototype.isCycle = function() {
    return this.cycle;
}

Loop.prototype.reset = function() {
    this.cycle = false;
}

function nextIndexSet(indexSet, size) {
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

// var loop = new Loop([1, 0]);
// var is = [1, 0];
// _.each(_.range(6), function() {
//     is = loop.next(is, 3);
//     console.log(is);
//     console.log(loop.isCycle());
// })