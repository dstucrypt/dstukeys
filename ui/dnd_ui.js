var locale = require('./locale.js'),
    _label = locale.label,
    dnd = require('./dnd.js');

var Dnd = function(cb) {
    var ob;
    var state = ko.observable(0);

    var visible = ko.observable(false);

    ob = {
        visible: visible,
        state: state,
        text: _label('dnd', state),
        intro_1: _label('intro', state),
        title_dnd: _label('title_dnd', state),
        setup: dnd.setup,
        setup_cb: dnd.setup_cb,
    }; 
    return ob;
}

module.exports.Dnd = Dnd;
