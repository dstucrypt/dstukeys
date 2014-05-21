
var Document = function(cb) {
    var ob;

    var visible = ko.observable(false);
    var document_text = ko.observable("");

    var do_sign = function() {
        console.log("sign text");
    };

    ob = {
        visible: visible,
        do_sign: do_sign,
    };
    return ob;
}

module.exports.Document = Document;
