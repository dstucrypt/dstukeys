var Curve = require('jkurwa'), priv=null,
    dstu = require('./dstu.js'),
    dnd = require('./dnd.js'),
    util = require('./util.js');

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
    var parser = new Curve.Keycoder(),
        parsed = parser.parse(indata),
        decoded;

    if(parsed.format == 'privkey') {
        say("Decoded privatekey found");
        set_priv(parsed);
        return true;
    }

    var password = document.getElementById('pw_in').value;
    if((password === undefined) || password.length == 0) {
        say("Password required to decode data");
        return true;
    }

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
        var keycoder = new Curve.Keycoder();
        document.getElementById('pem_out').innerText = keycoder.to_pem(data);
    }
}

function say(msg) {
    document.getElementById('pem_out').innerText = msg;
}

function file_dropped(u8) {
    var data = decode_import(u8);

    if(data === true) {
        return;
    }

    if(data === undefined) {
        decode_result(false);
    } else {
        decode_result(true, data);
    }
}

function setup() {
    dnd.setup(file_dropped);
}

module.exports.setup = setup;
exports.setup = setup;
