var Curve = require('jkurwa'), priv=null,
    dnd = require('./dnd.js'),
    view = require('./ui.js'),
    docview = require('./document.js'),
    Keyholder = require('./keyholder.js'),
    keys,
    doc,
    vm;

var set_priv = function(p) {
    _p = p;
    var curve = new Curve({
        a: p.curve.a,
        b: p.curve.b,
        m: p.curve.m,
        k1: p.curve.k1,
        k2: 0,
        order: p.curve.order,
        base: p.curve.base,
    }),
    priv = new Curve.Priv(curve, p.param_d);

    _c = curve;
    _p = priv;
}

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
        var names = {
            privkey: "standard unencrypted",
            IIT: "proprietarty encrypted",
            PBES2: "standard encrypted",
        };
        vm.key_info("Found key in " + names[keys.key_info.format] + " format");
        vm.dnd_visible(false);
        vm.key_controls_visible(true);
        vm.key_info_visible(true);
    }
    if(evt.key === false) {
        vm.set_error("You dropped some file, but it's not private key (or we maybe we can't read it)");
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

function file_dropped(u8) {
    vm.set_error();
    keys.have({key: u8})
}

function setup() {
    keys = new Keyholder({need: need_cb, feedback: feedback_cb});
    vm = new view.Main({
        password: password_cb,
        pem: pem_cb,
        to_storage: to_storage,
        sign_box: sign_box,
    });
    doc = new docview.Document({});
    dnd.setup(file_dropped);
    ko.applyBindings(vm, document.getElementById("ui"));
    ko.applyBindings(doc, document.getElementById("document"));

    vm.visible(true);
}

module.exports.setup = setup;
exports.setup = setup;
