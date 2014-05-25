var dnd = require('./dnd.js'),
    Keyholder = require('./keyholder.js'),
    CertMain = require('./cert.js').CertMain,
    Ident = require('./identity.js').Ident,
    keys,
    ident, issuer_ident,
    view;


var CertController = function() {
    var ob;

    ob = {
    };
    return ob;
};


function file_dropped(u8) {
    view.error(null);
    keys.have({key: u8});
    console.log("dropped");
};


function need_cb(evt) { };


function feedback_cb(evt) {
    console.log(evt);
    if(evt.key === true || evt.crypted_key === true) {
        return view.error("Please, drop certificate, not key");
    }

    if(evt.cert === true) {
        view.dnd_visible(false);
        ident.set_ident(keys.cert.subject, keys.cert.extension, keys.cert.pubkey, keys.cert.valid);
        issuer_ident.set_ident(keys.cert.issuer);
    }
};


var setup = function() {
    keys = new Keyholder({need: need_cb, feedback: feedback_cb});
    view = new CertMain();
    ident = new Ident();
    issuer_ident = new Ident();
    dnd.setup(file_dropped);

    ko.applyBindings(view, document.getElementById("ui"));
    ko.applyBindings(ident, document.getElementById("ident"));
    ko.applyBindings(issuer_ident, document.getElementById("issuer_ident"));

    view.dnd_text("Сбросьте сертификат для просмотра");
};


module.exports.setup = setup;
