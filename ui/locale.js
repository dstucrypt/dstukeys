var locale = require('./l10n.js'),
    locale_code = ko.observable(),
    label,
    current;

var set_current = function(code) {
    if(locale[code] === undefined) {
        throw new Error("Locale not found");
    }

    current = locale[code];
    locale_code(code);
    locale_code.notifySubscribers();
}

var gettext = function(msgid) {
    locale_code();
    return current[msgid];
}

var label = function(msgid, state_fn) {
    return ko.computed(function() {
        var _msgid;
        if(state_fn !== undefined) {
            _msgid = msgid + '_' + state_fn();
        } else {
            _msgid = msgid;
        }

        return gettext(_msgid);
    }, this)
}

module.exports.gettext = gettext;
module.exports._ = gettext;
module.exports.set_current = set_current;
module.exports.label = label;
