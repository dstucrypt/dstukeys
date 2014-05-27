var dnd = require('./dnd.js'),
    locale = require("./locale.js"),
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
};

var file_dloaded = function(r) {
    view.error(null);
    keys.have({key: r})
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

        document.getElementById("pem").innerText = keys.get_pem({cert: true});
    }
};

var query = function() {
    var ret = {}, hash, part, part_s, i;

    hash = window.location.hash.substr(1).split('|');

    for(i=0; part=hash[i]; i++) {
        part_s = part.split('=', 2);
        ret[part_s[0]] = part_s[1];
    }

    return ret;
};

var setup = function() {
    var q;

    locale.set_current(locale.read());

    q = query();

    keys = new Keyholder({need: need_cb, feedback: feedback_cb});
    view = new CertMain();
    ident = new Ident();
    issuer_ident = new Ident();
    dnd.setup(file_dropped);

    ko.applyBindings(view, document.getElementById("ui"));
    ko.applyBindings(ident, document.getElementById("ident"));
    ko.applyBindings(issuer_ident, document.getElementById("issuer_ident"));

    if(q.ipn !== undefined) {
        $.get('/api/cert/ipn/'+q.ipn, file_dloaded);
    } else {
        view.dnd_text("Сбросьте сертификат для просмотра");
    }
};


module.exports.setup = setup;
