var StoredEl = function(evt, data) {
    var ob;
    var type = ko.observable(data.type);
    var selected = ko.observable(false);
    var label = function() {
        var subj = data.cert.subject;
        var is = data.cert.issuer;
        return subj.commonName + ' ' + subj.title + ", " + subj.serialNumber + ' ( ' + is.organizationName + ' )';
    };
    var select = function() {
        selected(true);
        evt.select(data.raw)
    };
    var remove = function() {
        var store = window.localStorage;
        if(store === undefined) {
            return;
        }

        store.removeItem(data.key);
    };
    var state = function() {
        if(selected()) {
            return '[X]';
        }

        return '';
    };

    ob = {
        "type": type,
        "label": label,
        "select": select,
        "state": state,
        "remove": remove,
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
