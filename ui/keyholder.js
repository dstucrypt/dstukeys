var Curve = require('jkurwa'),
    b64_encode = Curve.b64_encode,
    dstu = require('./dstu.js');

var Keyholder = function(cb) {
    var ob, keycoder, have, signer, pem,
        ready_sign, have_local, save_cert;

    keycoder = new Curve.Keycoder();
    is_ready_sign = function() {
        return (
                (ob.key !== undefined) &&
                (ob.cert !== undefined) &&
                ob.cert_key_match(ob.key, ob.cert)
        )
    };
    cert_key_match = function(key, cert) {
        var key_curve = ob.get_curve();
        var key_priv = Curve.Priv(key_curve, ob.key.param_d);
        var key_pub = key_priv.pub();

        var cert_pub_point = key_curve.point(cert.pubkey);

        return key_pub.point.equals(cert_pub_point);
    };
    have_key = function(data) {
        data = keycoder.maybe_pem(data);

        try {
            var parsed = keycoder.parse(data);
        } catch(e) {
            cb.feedback({key: false});
            return;
        }

        ob.key_info.format = parsed.format;

        switch(parsed.format) {
        case 'privkey':
            ob.raw_key = data;
            ob.key = parsed;
            cb.feedback({key: true});
            if(ob.cert === undefined) {
                cb.need({cert: true});
            }
            break;
        case 'IIT':
        case 'PBES2':
            ob.encrypted_key = parsed;
            cb.feedback({crypted_key: true})
            cb.need({password: true});
            break;
        case 'x509':
            ob.cert = parsed;
            ob.raw_cert = data;
            cb.feedback({cert: true});
            break;
        default:
            console.log("have something unknown");
        }

    };
    have = function (data) {
        if (data.key !== undefined) {
            have_key(data.key);
        }
        if (data.password !== undefined) {
            if (ob.encrypted_key !== undefined) {
                var decoded = dstu.decode_data(ob.encrypted_key, data.password);
                if ((decoded === undefined) || 
                    (keycoder.is_valid(decoded) !== true)) {
                    cb.feedback({password: false});
                    cb.need({password: true});
                    return;
                }

                cb.feedback({password: true});
                ob.raw_key = decoded;
                have({key: decoded})
            }
        }
    };
    get_curve = function() {
        var p = ob.key;

        return curve = new Curve({
            a: p.curve.a,
            b: p.curve.b,
            m: p.curve.m,
            k1: p.curve.k1,
            k2: 0,
            order: p.curve.order,
            base: p.curve.base,
        });
    };
    signer = function() {
        var p = ob.key;
        var curve = ob.get_curve();

        return new Curve.Priv(curve, p.param_d);
    };
    pem = function(what) {
        var ret = '';
        if(what === undefined) {
            what = {key: true};
        }

        if(what.key === true) {
            ret = keycoder.to_pem(b64_encode(ob.raw_key, 42));
            ret += '\n';
        }

        if(what.cert === true) {
            ret = keycoder.to_pem(b64_encode(ob.raw_cert, 42), 'CERTIFICATE');
            ret += '\n';
        }

        return ret;
    };
    have_local = function() {
        var store = window.localStorage;
        var ret = [];
        var keys;
        var i;
        var idx;
        var data;
        var der;
        var cert;

        if(store === undefined) {
            return ret;
        }

        keys = Object.keys(store);
        for(i=0; i<keys.length; i++) {
            idx = keys[i];
            data = store[idx];
            if(idx.indexOf('cert-') == 0) {
                try {
                    der = keycoder.maybe_pem(data);
                    cert = keycoder.parse(der);
                    if(cert.format !== 'x509') {
                        throw new Error("expected cert");
                    }
                } catch(e) {
                    continue;
                }
                ret.push({
                    "type": "cert",
                    "raw": data,
                    "key": idx,
                    "cert": cert,
                })
            }
        }

        return ret;
    };

    save_cert = function() {
        var data = ob.get_pem({cert: true});
        var serial = ob.cert.subject.serialNumber;

        var store = window.localStorage;
        if(store === undefined) {
            return;
        }

        store['cert-' + serial] = data;
    };

    ob = {
        have: have,
        get_pem: pem,
        get_signer: signer,
        get_curve: get_curve,
        is_ready_sign: is_ready_sign,
        cert_key_match: cert_key_match,
        have_local: have_local,
        save_cert: save_cert,
        key_info: {
        }
    };
    return ob;
};

module.exports = Keyholder;
