var locale = require('./locale.js');

var LangEl = function(p_code, changed) {
    var ob;
    var code = ko.observable(p_code);
    var selected = ko.observable(false);
    var select = function() {
        changed(p_code.toLowerCase());
        selected(true);
    };
    ob = {
        code: code,
        select: select,
        selcted: selected,
    }
    return ob;
};

var Langs = function(inp, cb) {
    var ob;
    var items = ko.observableArray();;
    var i, code;
   
    var changed = function(code) {
        var item;
        var i;

        for(i=0; item=items[i]; i++) {
            item.selected(false);
        }

        cb.changed(code);
    }
    
    for(i=0; code=inp[i]; i++) {
        items.push(new LangEl(code, changed));
    }
 
    ob = {
        items: items,
    };
    return ob;
}

module.exports.Langs = Langs;
