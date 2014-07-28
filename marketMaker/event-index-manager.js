var _ = require('underscore');

var eventIndex = 0;
var eventIndexMap = {};

function getEventIndex(type) {
    var oppositeType = getOppsiteType(type);

    if (eventIndexMap[type]) {
        return eventIndexMap[type];
    }

    if (eventIndexMap[oppositeType]) {
        return eventIndexMap[oppositeType];
    }

    eventIndex = eventIndex + 1;
    eventIndexMap[type] = eventIndex + "";
    eventIndexMap[oppositeType] = eventIndex + "";
    return eventIndex + "";
}

function getOppsiteType(type) {
    var elements = type.split(":");
    return elements[1] + ":" + elements[0];
}

function getAllEvents() {
    return _.values(eventIndexMap);
}

exports.getAllEvents = getAllEvents;
exports.getEventIndex = getEventIndex;
exports.getOppsiteType = getOppsiteType;