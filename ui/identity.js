var Ident = function(cb) {
    var ob;

    var visible = ko.observable(false);
    var commonName = ko.observable("");
    var title = ko.observable("");
    var ipn = ko.observable("");

    var set_ident = function(x509Name, ext) {
        title(x509Name.title);
        commonName(x509Name.commonName);
        ipn(ext.ipn.EDRPOU);
    };

    ob = {
        visible: visible,
        commonName: commonName,
        ipn: ipn,
        title: title,
        set_ident: set_ident,
    };
    return ob;
}

module.exports.Ident = Ident;
