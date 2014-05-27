var locale = require('./locale.js'),
    _label = locale.label,
    _ = locale.gettext;

var Main = function (cb) {
    var ob;

    var dnd_visible = ko.observable(true);
    var pw = ko.observable("");
    var pw_visible = ko.observable(false);
    var pw_error = ko.observable(false);
    var key_controls_visible = ko.observable(false);
    var key_info_visible = ko.observable(false);
    var key_info = ko.observable("");
    var pem_visible = ko.observable(false);
    var pem_text = ko.observable("");
    var error_visible = ko.observable(false);
    var error_text = ko.observable("");
    var visible = ko.observable(false);
    var dnd_state = ko.observable(0);

    var accept_pw = function() {
        var value = pw();
        if (value.length > 0) {
            pw_error(false);
            cb.password(pw());
        } else {
            pw_error(true);
        }
    };
    var show_pem = function() {
        if(pem_visible()) {
            set_pem();
        } else {
            cb.pem();
        }
    };
    var do_save = function() {
        cb.to_storage();
    };
    var do_sign = function() {
        cb.sign_box();
    };

    var set_pem = function(val) {
        if(val === undefined) {
            pem_visible(false);
            pem_text("");
        } else {
            pem_visible(true);
            pem_text(val);
        }
    };

    var set_error = function(val) {
        if(val === undefined) {
            error_visible(false);
        } else {
            error_visible(true);
            error_text(val);
        }
    }

    ob = {
        dnd_visible: dnd_visible,
        pw_visible: pw_visible,
        pw_error: pw_error,
        pw: pw,
        key_controls_visible: key_controls_visible,
        key_info_visible: key_info_visible,
        key_info: key_info,
        accept_pw: accept_pw,
        show_pem: show_pem,
        do_save: do_save,
        do_sign: do_sign,
        label_sign: _label('add_sign'),
        label_store: _label('to_store'),
        set_pem: set_pem,
        pem_text: pem_text,
        pem_visible: pem_visible,
        set_error: set_error,
        error_text: error_text,
        error_visible: error_visible,
        visible: visible,
        dnd_state: dnd_state,
        intro_1: _label('intro_1'),
        dnd_text: _label('dnd', dnd_state),
    };
    return ob;
}

exports.Main = Main;
module.exports.Main = Main;
