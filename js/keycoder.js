var Keycoder = function() {

    var OID_IIT = '1.3.6.1.4.1.19398.1.1.1.2',
    OID_PBES2 = '1.2.840.113549.1.5.13',
    OID_PBKDF2 = '1.2.840.113549.1.5.12',
    OID_GOST_34311_HMAC = '1.2.804.2.1.1.1.1.1.2',
    OID_GOST_28147_CFB = '1.2.804.2.1.1.1.1.1.1.3',
    PEM_KEY_B = '-----BEGIN PRIVATE KEY-----',
    PEM_KEY_E = '-----END PRIVATE KEY-----',
    ob = {
        to_pem: function(b64) {
            return [PEM_KEY_B, b64, PEM_KEY_E].join('\n');
        },
        iit_parse: function(asn1) {
            var head = asn1.sub[0],
                head1 = head.sub[1];
            if(head1.typeName() !== 'SEQUENCE' || head1.sub.length !== 2) {
                throw new Error();
            }
            mac = head1.sub[0];
            pad = head1.sub[1];
            if(mac.typeName() !== 'OCTET_STRING' || pad.typeName() != 'OCTET_STRING') {
                throw new Error(mac.typeName());
            }
            if(mac.length !== 4) {
                throw new Error("Invalid mac len " + mac.length);
            }
            if(pad.length >= 8) {
                throw new Error("Invalid pad len " + pad.length);
            }

            body = asn1.sub[1];
            if(body.typeName() !== 'OCTET_STRING') {
                throw new Error(body.typeName());
            }

            return {
                "format": "IIT",
                "mac": mac,
                "pad": pad,
                "body": body,
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
            var data = indata;
            if(data instanceof String) {
                data = Hex.decode(data);
            }

            var asn1 = ASN1.decode(data), head, head1, body, mac, pad;
            if(asn1.typeName() !== 'SEQUENCE' || asn1.sub.length !== 2) {
                throw new Error();
            }
            head = asn1.sub[0];
            if(head.typeName() !== 'SEQUENCE' || head.sub.length !== 2) {
                throw new Error();
            }
            oid = head.sub[0];
            if(oid.typeName() !== 'OBJECT_IDENTIFIER' ) {
                throw new Error(oid.content());
            }
            if(oid.content() == OID_IIT) {
                return ob.iit_parse(asn1);
            }
            if(oid.content() == OID_PBES2) {
                return ob.pbes2_parse(asn1);
            }
            throw new Error(oid.content());
        },
    };
    return {
        "parse": ob.guess_parse,
        "to_pem": ob.to_pem,
    }
}
