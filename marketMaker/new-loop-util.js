var _ = require('underscore');

function Loop(init_set, size, allowSame) {
    if (!allowSame) {
        if (_.uniq(init_set).length != init_set.length) {
            throw new Error("exist same element in init_set:[" + init_set + "]");
        }
    }
    this.init_set = init_set;
    this.indexSet = init_set;

    this.size = size;
    this.cycle = false;
    this.allowSame = allowSame;
}

Loop.prototype.next = function() {
    var self = this;
    var size = self.size;
    var indexSet = self.indexSet;

    if (self.allowSame) {
        indexSet = simpleNext(indexSet, size);
    } else {
        indexSet = nextIndexSet(indexSet, size);
    }

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

    self.indexSet = indexSet;

    return indexSet;
}

Loop.prototype.isCycle = function() {
    return this.cycle;
}

Loop.prototype.reset = function() {
    this.cycle = false;
}

Loop.prototype.allowSameIndex = function(allow) {
    this.allowSame = allow;
}

Loop.prototype.curIndexSet = function() {
    return this.indexSet;
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

function simpleNext(indexSet, size) {
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
        rest = simpleNext(rest, size);
    }

    return _.flatten([first, rest]);
}


exports.Loop = Loop;

// var loop = new Loop([2, 1, 0], 4, false);
// _.each(_.range(100), function() {
//     console.log(loop.next());
//     console.log(loop.isCycle());
// })