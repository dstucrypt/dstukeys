var jk = require('jkurwa'),
    Curve = jk.Curve, priv=null,
    view = require('./ui.js'),
    dstu = require('./dstu.js'),
    docview = require('./document.js'),
    identview = require('./identity.js'),
    Keyholder = require('./keyholder.js'),
    Stored = require("./stored.js").Stored,
    Langs = require('./langs.js').Langs,
    Password = require('./password.js').Password,
    Dnd = require('./dnd_ui.js').Dnd,
    Decrypt = require('./decrypt.js'),
    locale = require("./locale.js"),
    QRReader = require("./qr_read.js"),
    QRWriter = require("./qr_write.js"),
    keys,
    doc,
    ident,
    stored,
    langs,
    password,
    dnd,
    decrypt,
    qr_in,
    qr_out,
    vm;

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
    var pem_data = keys.get_pem({raw_key: true});
    vm.set_pem(pem_data);

    var min = keys.get_mini(true);
    qr_out.write(min);
    qr_out.visible(true);
}

function to_storage() {
    keys.save_key();
}

function hide_all() {
    dnd.visible(false);
    vm.pem_visible(false);
    vm.error_visible(false);
    vm.key_controls_visible(false);
    vm.key_info_visible(false);
    vm.visible(false);
    stored.needed(false);

    decrypt.visible(false);
};

function main_screen() {
    hide_all();
    stored.needed(true);
    vm.key_controls_visible(true);
    vm.visible(true);
};

function sign_box() {
    hide_all();
    doc.visible(true);
};

function decrypt_box() {
    hide_all();
    decrypt.visible(true);
    vm.error_visible(true);
    dnd.setup_cb(message_dropped);
    dnd.state(2);
    dnd.visible(true);
};

function sign_cb(contents) {
    var hash = dstu.compute_hash(contents);
    hash = [0].concat(hash);
    var hash_bn = new jk.Big(hash);
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

var change_locale = function(code) {
    locale.save(code);
    locale.set_current(code);
};

var is_mobile = function() {
    return (typeof window.orientation !== 'undefined');
};

var login_cb = function() {
    vm.big_visible(false);

    if(false && is_mobile()) {
        qr_in.visible(true);
        try {
            qr_in.start();
        } catch(e) {
            qr_in.visible(true);
        }
        return;
    }
    dnd.visible(true);
};

var publish_certificate = function() {
    var ipn, pem, request;

    ipn = keys.cert.extension.ipn.EDRPOU;
    pem = keys.get_pem({cert: true});
    request = {
        ipn: ipn,
        cert: pem,
    };

    $.post('/api/cert.publish', request, function(response){
        console.log("published " + response);
    });
};

var qr_input_cb = function(data) {
    vm.pem_visible(true);
    vm.pem_text(data);

    qr_in.visible(false);
};

var message_dropped = function(u8) {
    var clear;
    decrypt.error("");
    try {
        clear = Decrypt.decrypt_buffer(u8, keys);
    } catch(exc) {
        console.log("exc " + exc.toString());
        return decrypt.error(exc.toString());
    }
    document.location = 'data:application/octet-stream;base64,' + jk.b64_encode(clear);
    main_screen();
};

function setup() {
    qr_in = new QRReader(document.getElementById('vid'),
                document.getElementById('qr-canvas'),
                qr_input_cb);
    qr_out = QRWriter(document.getElementById('qr-out'));
    locale.set_current(locale.read());
    keys = new Keyholder({need: need_cb, feedback: feedback_cb});
    vm = new view.Main({
        password: password_cb,
        pem: pem_cb,
        to_storage: to_storage,
        sign_box: sign_box,
        decrypt_box: decrypt_box,
        login: login_cb,
        cert_pub: publish_certificate,
    });
    doc = new docview.Document({sign_text: sign_cb});
    ident = new identview.Ident();
    stored = new Stored({select: file_selected});
    langs = new Langs(['UA', 'RU'], {changed: change_locale});
    password = new Password(password_cb);
    dnd = new Dnd();
    decrypt = new Decrypt({
        close: main_screen,
    });
    dnd.stored = stored;
    dnd.setup(file_dropped);
    ko.applyBindings(vm, document.getElementById("ui"));
    ko.applyBindings(doc, document.getElementById("document"));
    ko.applyBindings(ident, document.getElementById("identity"));
    ko.applyBindings(langs, document.getElementById("langs"));
    ko.applyBindings(password, document.getElementById("password"));
    ko.applyBindings(dnd, document.getElementById("dnd"));
    ko.applyBindings(decrypt, document.getElementById("decrypt"));
    ko.applyBindings(qr_in, document.getElementById("qr"));
    ko.applyBindings(qr_out, document.getElementById("qr-out"));


    vm.visible(true);

    stored.feed(keys.have_local());
}

module.exports.setup = setup;
module.exports.locale = change_locale;
