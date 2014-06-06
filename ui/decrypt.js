var jk = require('jkurwa'),
    em_gost = require('em-gost');

var Decrypt = function(cb) {
    var ob;
    var visible = ko.observable(false);
    var error = ko.observable("");
    var close = function() {
        visible(false);
        cb.close();
    };

    ob = {
        close: close,
        visible: visible,
        error: error,
    };

    return ob;
};

var decrypt_buffer = function(u8, keys) {
    var msg_wrap, msg, cert, priv, kek, cek, clear, wcek, data;
    try {
        data = new Buffer(u8, 'raw');
        msg_wrap = new jk.models.Message(data);
    } catch(e) {
        throw new Error("Can't read file format");
    };

    if(msg_wrap.type === 'signedData') {
        msg = msg_wrap.unpack();
    } else {
        msg = msg_wrap;
    }

    try {
        cert = msg.signer();
    } catch(e) {
        try {
            cert = msg_wrap.signer();
        } catch(e) {
            throw new Error("Cant find signer certifiate");
        }
    }

    if(msg.type !== 'envelopedData') {
        throw new Error("File is not encrypted");
    }

    priv = keys.get_signer(); // should pass selected pub key id
   
    // assume only one recipient. can be not so
    kek = priv.sharedKey(cert.pubkey, msg.rki.ukm, em_gost.gost_kdf);
    wcek = msg.rki.recipientEncryptedKeys[0].encryptedKey;

    try {
        cek = new Buffer(em_gost.gost_unwrap(kek, wcek));
    } catch (e) {
        throw new Error("wailed to decrypt cek. key mismatch?");
    }
    return new Buffer(em_gost.gost_decrypt_cfb(msg.enc_contents, cek, msg.enc_params.iv));
};

module.exports = Decrypt;
module.exports.decrypt_buffer = decrypt_buffer;
