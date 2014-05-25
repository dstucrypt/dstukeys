var Ident = function() {
    var ob;

    var visible = ko.observable(false);
    var commonName = ko.observable("");
    var title = ko.observable("");
    var ipn = ko.observable("");
    var givenName = ko.observable("");
    var surname = ko.observable("");
    var localityName = ko.observable("");
    var stateOrProvinceName = ko.observable("");
    var organizationName = ko.observable("");
    var organizationalUnitName = ko.observable("");
    var serialNumber = ko.observable("");
    var pubkey = ko.observable("");
    var validFrom = ko.observable("");
    var validTo = ko.observable("");

    var set_ident = function(x509Name, ext, pubkey_bn, valid_on) {
        title(x509Name.title);
        givenName(x509Name.givenName);
        surname(x509Name.surname);
        stateOrProvinceName(x509Name.stateOrProvinceName);
        organizationName(x509Name.organizationName);
        organizationalUnitName(x509Name.organizationalUnitName);
        localityName(x509Name.localityName);
        serialNumber(x509Name.serialNumber);
        commonName(x509Name.commonName);

        if(ext !== undefined) {
            ipn(ext.ipn.EDRPOU);
        }
        if(pubkey_bn !== undefined) {
            pubkey(pubkey_bn.toString(16));
        }
        if(valid_on !== undefined) {
            validFrom(valid_on.from);
            validTo(valid_on.to);
        }
    };

    var located = function() {
        var city = localityName(),
            province = stateOrProvinceName();

        if(!((city.indexOf(".") !== -1) && (city.indexOf(".") + 1) === city.indexOf(" ")))
        {
            city = 'м. ' + city;
        }

        if((province !== undefined) && province.length > 0) {
            return city + ", " + province + " область";
        }

        return city;
    }

    ob = {
        visible: visible,
        commonName: commonName,
        ipn: ipn,
        title: title,
        set_ident: set_ident,
        givenName: givenName,
        surname: surname,
        stateOrProvinceName: stateOrProvinceName,
        organizationName: organizationName,
        organizationalUnitName: organizationalUnitName,
        localityName: localityName,
        serialNumber: serialNumber,
        pubkey: pubkey,
        validFrom: validFrom,
        validTo: validTo,
        located: located,
    };
    return ob;
}

module.exports.Ident = Ident;
