var Curve = require('jkurwa'),
    util = require('./util.js'),
    dstu = require('./dstu.js');

var Keyholder = function(cb) {
    var ob, keycoder, have, signer, pem,
        ready_sign;

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
        var ret;
        if(what === undefined) {
            what = {key: true};
        }

        if(what.key === true) {
            ret = keycoder.to_pem(util.numberB64(ob.raw_key, 42));
            ret += '\n';
        }

        if(what.cert === true) {
            ret = keycoder.to_pem(util.numberB64(ob.raw_cert, 42), 'CERTIFICATE');
            ret += '\n';
        }

        return ret;
    };

    ob = {
        have: have,
        get_pem: pem,
        get_signer: signer,
        get_curve: get_curve,
        is_ready_sign: is_ready_sign,
        cert_key_match: cert_key_match,
        key_info: {
        }
    };
    return ob;
};

module.exports = Keyholder;
