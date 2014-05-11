var Keycoder = function() {

    var OID = {
        "1 3 6 1 4 1 19398 1 1 1 2": "IIT Store",
        '1.2.840.113549.1.5.13': "PBES2",
        "1.2.840.113549.1.5.12": "PBKDF2",
        '1.2.804.2.1.1.1.1.1.2': "GOST_34311_HMAC",
        '1.2.804.2.1.1.1.1.1.1.3': "GOST_28147_CFB",
        '1.2.804.2.1.1.1.1.3.1.1': "DSTU_4145_LE",
    },
    PEM_KEY_B = '-----BEGIN PRIVATE KEY-----',
    PEM_KEY_E = '-----END PRIVATE KEY-----',
    asn1 = require('asn1'),
    Buffer = require('buffer').Buffer;
    var ob = {
        StoreIIT: asn1.define('StoreIIT', function() {
            this.seq().obj(
                this.key('cryptParam').seq().obj(
                    this.key('cryptType').objid(OID),
                    this.key('cryptParam').seq().obj(
                        this.key('mac').octstr(),
                        this.key('pad').octstr()
                    )
                    ),
                this.key('cryptData').octstr()
            );
        }),
        to_pem: function(b64) {
            return [PEM_KEY_B, b64, PEM_KEY_E].join('\n');
        },
        is_valid : function(indata) {
            return (indata[0] == 0x30) && (indata[1] == 0x82);
        },
        iit_parse: function(data) {

            var asn1 = ob.StoreIIT.decode(data, 'der'), mac, pad;
            mac = asn1.cryptParam.cryptParam.mac;
            pad = asn1.cryptParam.cryptParam.pad;

            if(mac.length !== 4) {
                throw new Error("Invalid mac len " + mac.length);
            }
            if(pad.length >= 8) {
                throw new Error("Invalid pad len " + pad.length);
            }
            if(asn1.cryptParam.cryptType !== 'IIT Store') {
                throw new Error("Invalid storage type");
            }

            return {
                "format": "IIT",
                "mac": mac,
                "pad": pad,
                "body": asn1.cryptData,
            }
        },
        pbes2_parse: function(asn1) {
            var head = asn1.sub[0],
                head1 = head.sub[1],
                pbkdf2 = head1.sub[0],
                cparams = head1.sub[1],
                oid = pbkdf2.sub[0],
                params = pbkdf2.sub[1],
                salt = params.sub[0],
                iters = params.sub[1],
                params1 = params.sub[2],
                hmac_oid = params1.sub[0],
                cipher_oid = cparams.sub[0],
                cparams1 = cparams.sub[1],
                iv = cparams1.sub[0],
                sbox = cparams1.sub[1],
                body = asn1.sub[1];

            if(oid.content() != OID_PBKDF2) {
                throw new Error(oid.content());
            }
            if(hmac_oid.content() != OID_GOST_34311_HMAC) {
                throw new Error(hmac_oid.content());
            }
            if(cipher_oid.content() != OID_GOST_28147_CFB) {
                throw new Error(cipher_oid.content());
            }
            if( (iv.length != 8) || (sbox.length != 64) || (salt.length != 32)) {
                throw new Error("IV len: " + iv.length + ", S-BOX len: " + sbox.length + ", SALT len: " + salt.length);
            }
            return {
                "format": "PBES2",
                "body": body,
                "iv": iv,
                "sbox": sbox,
                "salt": salt,
                "iters": Number(iters.content())
            }
        },
        guess_parse: function(indata) {
            var data = indata, ret;
            data = new Buffer(indata, 'raw');

            try {
                return ob.iit_parse(data);
            } catch (e) {
                console.log("fail" + e);
            }
            throw new Error("Unknown format");
        },
    };
    return {
        "parse": ob.guess_parse,
        "to_pem": ob.to_pem,
        "is_valid": ob.is_valid
    }
}
