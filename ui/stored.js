var locale = require('./locale.js'),
    _label = locale.label;

var StoredEl = function(evt, data) {
    var ob;
    var selected = ko.observable(false);
    var key = ko.observable(false);
    var label = function() {
        var subj = data.cert.subject;
        var is = data.cert.issuer;
        return subj.commonName + ' ' + subj.title + ", " + subj.serialNumber + ' ( ' + is.organizationName + ' )';
    };
    var select = function() {
        selected(true);
        evt.select(data.raw_cert);
        evt.select(data.raw_key);
    };
    var remove = function() {
        var store = window.localStorage;
        if(store === undefined) {
            return;
        }

        store.removeItem(data.idx);
    };
    var state = function() {
        if(selected()) {
            return '[X]';
        }
        if(key()) {
            return '[KEY]';
        }

        return '';
    };
    if(data.have_key === true) {
        key(true);
    }

    ob = {
        "label": label,
        "select": select,
        "state": state,
        "remove": remove,
    };
    return ob;
};

var Stored = function(evt) {
    var ob;
    var items = ko.observableArray();
    var needed = ko.observable(true);
    var feed = function(data) {
        var i, ob;
        for(i=0; ob=data[i]; i++) {
            items.push(new StoredEl(evt, ob));
        }
    };
    var visible = ko.computed(function() {
        var n = needed();
        return items().length > 0 && n;
    }, this);

    ob = {
        feed: feed,
        items: items,
        visible: visible,
        needed: needed,
        avail_certs: _label('avail_certs'),
    };

    return ob;
};

module.exports.Stored = Stored;
