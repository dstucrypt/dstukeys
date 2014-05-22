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
        return true; // TODO: implement me!
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
            cb.need({password: true});
            break;
        case 'x509':
            ob.cert = parsed;
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
    signer = function() {
        var p = ob.key;

        var curve = new Curve({
            a: p.curve.a,
            b: p.curve.b,
            m: p.curve.m,
            k1: p.curve.k1,
            k2: 0,
            order: p.curve.order,
            base: p.curve.base,
        });
        return new Curve.Priv(curve, p.param_d);
    };
    pem = function() {
        return keycoder.to_pem(util.numberB64(ob.raw_key, 42));
    };

    ob = {
        have: have,
        get_pem: pem,
        get_signer: signer,
        is_ready_sign: is_ready_sign,
        cert_key_match: cert_key_match,
        key_info: {
        }
    };
    return ob;
};

module.exports = Keyholder;
