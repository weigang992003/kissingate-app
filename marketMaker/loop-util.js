var size = 0;
var indexSet = [1, 0];

function nextIndexSet(indexSet, size) {
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
        indexSet = rest.unshift(first);
        indexSet = nextIndexSet(indexSet, size);
        var first = _.first(indexSet);
        var rest = _.rest(indexSet);
    }

    return _.union([first], rest);
}