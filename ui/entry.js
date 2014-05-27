var Curve = require('jkurwa'), priv=null,
    view = require('./ui.js'),
    dstu = require('./dstu.js'),
    docview = require('./document.js'),
    identview = require('./identity.js'),
    Keyholder = require('./keyholder.js'),
    Stored = require("./stored.js").Stored,
    Langs = require('./langs.js').Langs,
    Password = require('./password.js').Password,
    Dnd = require('./dnd_ui.js').Dnd,
    locale = require("./locale.js"),
    _ = locale.gettext,
    cookies = require('cookies-js'),
    keys,
    doc,
    ident,
    stored,
    langs,
    password,
    dnd,
    vm;

var decode_import = function(indata, password) {
        parsed = parser.parse(indata),
        decoded;

    decoded = dstu.decode_data(parsed, password);

    if(decoded == undefined) {
        return;
    }
    if(parser.is_valid(decoded) != true) {
        return;
    }
    return util.numberB64(decoded, 42);
}

function decode_result(status, data) {
    if(status == false) {
        document.getElementById('pem_out').innerText = 'Err';
    } else {
        document.getElementById('pem_out').innerText = keycoder.to_pem(data);
    }
}

function need_cb(evt) {
    if(evt.password === true) {
        dnd.visible(false);
        password.visible(true);
    }
}

function feedback_cb(evt) {
    if(evt.password === false) {
        console.log("password fail");
        password.settle(true);
    }
    if(evt.password === true) {
        password.settle(false);
        password.visible(false);
    }
    if(evt.key === true) {
        dnd.state(1);
    }
    if(evt.key === false) {
        vm.set_error("You dropped some file, but it's not private key (or we maybe we can't read it)");
    }
    if(evt.cert === true) {
        ident.set_ident(keys.cert.subject, keys.cert.extension, keys.cert.pubkey);
        ident.visible(true);
        keys.save_cert();
        dnd.state(0);
    }

    if((evt.key === true) || (evt.cert === true)) {
        if(keys.is_ready_sign()) {
            dnd.visible(false);
            stored.needed(false);
            vm.key_controls_visible(true);
            vm.key_info_visible(true);
        } else {
            dnd.visible(true);
        }
    }
}

function password_cb(value) {
    keys.have({password: value})
}

function pem_cb() {
    var pem_data = keys.get_pem();
    vm.set_pem(pem_data);
}

function to_storage() {
    keys.save_key();
}

function sign_box() {
    dnd.visible(false);
    vm.pem_visible(false);
    vm.error_visible(false);
    vm.key_controls_visible(false);
    vm.key_info_visible(false);
    vm.visible(false);
    doc.visible(true);
}

function sign_cb(contents) {
    var hash = dstu.compute_hash(contents);
    hash = [0].concat(hash);
    var hash_bn = new Curve.Big(hash);
    var priv = keys.get_signer();
    var sign = priv.sign(hash_bn);
    doc.set_sign(hash_bn, sign.s, sign.r);
}

function file_dropped(u8) {
    vm.set_error();
    keys.have({key: u8})
}

function file_selected(data) {
    keys.have({key: data});
}

function read_locale() {
    var code;
    code = cookies.get('dstu_ui_locale');
    if((code === undefined) || (code === null) || (code.length !== 2)) {
        code = 'ua';
        cookies.set('dstu_ui_locale', code);
    }

    return code;
}

var change_locale = function(code) {
    cookies.set('dstu_ui_locale', code);
    locale.set_current(read_locale());
};

var login_cb = function() {
    vm.big_visible(false);
    dnd.visible(true);
};

function setup() {
    locale.set_current(read_locale());
    keys = new Keyholder({need: need_cb, feedback: feedback_cb});
    vm = new view.Main({
        password: password_cb,
        pem: pem_cb,
        to_storage: to_storage,
        sign_box: sign_box,
        login: login_cb,
    });
    doc = new docview.Document({sign_text: sign_cb});
    ident = new identview.Ident();
    stored = new Stored({select: file_selected});
    langs = new Langs(['UA', 'RU']);
    password = new Password(password_cb);
    dnd = new Dnd();
    dnd.stored = stored;
    dnd.setup(file_dropped);
    ko.applyBindings(vm, document.getElementById("ui"));
    ko.applyBindings(doc, document.getElementById("document"));
    ko.applyBindings(ident, document.getElementById("identity"));
    ko.applyBindings(langs, document.getElementById("langs"));
    ko.applyBindings(password, document.getElementById("password"));
    ko.applyBindings(dnd, document.getElementById("dnd"));

    vm.visible(true);

    stored.feed(keys.have_local());
}

module.exports.setup = setup;
module.exports.locale = change_locale;
