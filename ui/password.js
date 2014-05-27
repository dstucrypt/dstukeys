var locale = require('./locale.js'),
    _label = locale.label;

var Password = function(have_cb) {
    var ob;

    var password = ko.observable("");
    var visible = ko.observable(false);
    var error = ko.observable(false);
    var busy = ko.observable(false);

    var accept_pw = function() {
        var value = password();
        if (value.length > 0) {
            error(false);
            busy(true);
            have_cb(value);
        } else {
            error(true);
        }
    };

    var settle = function(ret) {
        password("");
        error(ret);
        busy(false);
    };

    ob = {
        password: password, 
        visible: visible,
        accept: accept_pw,
        error: error,
        value: password,
        settle: settle,
        busy: busy,
        crypted_key: _label('crypted_key'),
        crypted_key_0: _label('crypted_key_0'),
        crypted_key_1: _label('crypted_key_1'),
        label_decrypt: _label('label_decrypt'),
    };

    return ob;
}

module.exports.Password = Password;
