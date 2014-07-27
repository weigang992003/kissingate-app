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
}

function setEventIndex(type) {
    var oppositeType = getOppsiteType(type);

    eventIndex = eventIndex + 1;
    eventIndexMap[type] = eventIndex + "";
    eventIndexMap[oppositeType] = eventIndex + "";
}

function getOppsiteType(type) {
    var elements = type.split(":");
    return elements[1] + ":" + elements[0];
}

exports.getEventIndex = getEventIndex;
exports.setEventIndex = setEventIndex;