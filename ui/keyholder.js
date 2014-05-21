var Curve = require('jkurwa'),
    util = require('./util.js'),
    dstu = require('./dstu.js');

var Keyholder = function(cb) {
    var ob, keycoder, have;

    keycoder = new Curve.Keycoder();
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

                cb.feedback({password: true, key: true});
                ob.raw_key = decoded;
                have({key: decoded})
            }
        }
    },
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
    },
    pem = function() {
        return keycoder.to_pem(util.numberB64(ob.raw_key, 42));
    };

    ob = {
        have: have,
        get_pem: pem,
        get_signer: signer,
        key_info: {
        }
    };
    return ob;
};

module.exports = Keyholder;
