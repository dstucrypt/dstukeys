var Curve = require('jkurwa'), priv=null,
    dnd = require('./dnd.js'),
    view = require('./ui.js'),
    dstu = require('./dstu.js'),
    docview = require('./document.js'),
    identview = require('./identity.js'),
    Keyholder = require('./keyholder.js'),
    Stored = require("./stored.js").Stored,
    keys,
    doc,
    ident,
    stored,
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
        vm.dnd_visible(false);
        vm.pw_visible(true);
    }
}

function feedback_cb(evt) {
    if(evt.password === false) {
        console.log("password fail");
        vm.pw_error(true);
    }
    if(evt.password === true) {
        console.log("password accepted");
        vm.pw_error(false);
        vm.pw_visible(false);
    }
    if(evt.key === true) {
        vm.dnd_text("Теперь бросайте сертификат");
    }
    if(evt.key === false) {
        vm.set_error("You dropped some file, but it's not private key (or we maybe we can't read it)");
    }
    if(evt.cert === true) {
        ident.set_ident(keys.cert.subject, keys.cert.extension, keys.cert.pubkey);
        ident.visible(true);
        keys.save_cert();
        vm.dnd_text("Теперь бросайте ключ");
    }

    if((evt.key === true) || (evt.cert === true)) {
        if(keys.is_ready_sign()) {
            vm.dnd_visible(false);
            vm.key_controls_visible(true);
            vm.key_info_visible(true);
        } else {
            vm.dnd_visible(true);
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
    vm.dnd_visible(false);
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

function setup() {
    keys = new Keyholder({need: need_cb, feedback: feedback_cb});
    vm = new view.Main({
        password: password_cb,
        pem: pem_cb,
        to_storage: to_storage,
        sign_box: sign_box,
    });
    doc = new docview.Document({sign_text: sign_cb});
    ident = new identview.Ident();
    stored = new Stored({select: file_selected});
    dnd.setup(file_dropped);
    ko.applyBindings(vm, document.getElementById("ui"));
    ko.applyBindings(doc, document.getElementById("document"));
    ko.applyBindings(ident, document.getElementById("identity"));
    ko.applyBindings(stored, document.getElementById("stored"));

    vm.dnd_text("Файлы бросать сюда");
    vm.visible(true);

    stored.feed(keys.have_local());
}

module.exports.setup = setup;
exports.setup = setup;
