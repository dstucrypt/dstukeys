var locale = require('./l10n.js'),
    locale_code = ko.observable(),
    cookies = require('cookies-js'),
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

var save = function(code) {
    cookies.set('dstu_ui_locale', code);
};

var read = function() {
    var code;
    code = cookies.get('dstu_ui_locale');
    if((code === undefined) || (code === null) || (code.length !== 2)) {
        code = 'ua';
        cookies.set('dstu_ui_locale', code);
    }

    return code;
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
module.exports.read = read;
module.exports.save = save;
