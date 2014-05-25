var StoredEl = function(evt, data) {
    var ob;
    var type = ko.observable(data.type);
    var select = function() {
        evt.select(data)
    };

    ob = {
        "type": type,
        "select": select,
    };
    return ob;
};

var Stored = function(evt) {
    var ob;
    var items = ko.observableArray([]);
    var feed = function(data) {
        var i, ob;
        for(i=0; ob=data[i]; i++) {
            items.push(new StoredEl(evt, ob));
        }
    };

    ob = {
        feed: feed,
        items: items,
    };

    return ob;
};

module.exports.Stored = Stored;
