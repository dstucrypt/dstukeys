var locale = require('./locale.js'),
    _label = locale.label;

var Main = function (cb) {
    var ob;

    var big_visible = ko.observable(true);
    var key_controls_visible = ko.observable(false);
    var key_info_visible = ko.observable(false);
    var key_info = ko.observable("");
    var pem_visible = ko.observable(false);
    var pem_text = ko.observable("");
    var error_visible = ko.observable(false);
    var error_text = ko.observable("");
    var visible = ko.observable(false);

    var do_login = function() {
        cb.login();
    }

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
        key_controls_visible: key_controls_visible,
        key_info_visible: key_info_visible,
        key_info: key_info,
        show_pem: show_pem,
        do_save: do_save,
        do_sign: do_sign,
        do_login: do_login,
        label_sign: _label('add_sign'),
        label_store: _label('to_store'),
        set_pem: set_pem,
        pem_text: pem_text,
        pem_visible: pem_visible,
        set_error: set_error,
        error_text: error_text,
        error_visible: error_visible,
        visible: visible,
        big_visible: big_visible,
        intro_0: _label('intro_0'),
        login: _label('login'),
    };
    return ob;
}

exports.Main = Main;
module.exports.Main = Main;
