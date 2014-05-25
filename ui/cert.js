var CertMain = function() {
    var ob;

    var error = ko.observable("");
    var dnd_visible = ko.observable(true);
    var dnd_text = ko.observable("");

    ob = {
        error: error,
        dnd_text: dnd_text,
        dnd_visible: dnd_visible,
    }

    return ob;
};

module.exports.CertMain = CertMain;
