
var ia2hex = function(val) {
    var ret = '', i, c;
    for(i=0; i < val.length; i++) {
        c = val[i].toString(16);
        if(c.length == 1) {
            c = '0' + c;
        }
        ret = ret + c;
    }
    return ret;
}
var Document = function(cb) {
    var ob;

    var visible = ko.observable(false);
    var document_text = ko.observable("");
    var sign = ko.observable("");

    var do_sign = function() {
        cb.sign_text(document_text());
    };

    var set_sign = function(hash_bn, param_s, param_r) {
        var txt = "";
        txt += 'Hash: ' + hash_bn.toString(16);
        txt += ', S: ' + param_s.toString(16);
        txt += ', R: ' + param_r.toString(16);

        sign(txt);
    };

    ob = {
        visible: visible,
        do_sign: do_sign,
        sign: sign,
        set_sign: set_sign,
    };
    return ob;
}

module.exports.Document = Document;
