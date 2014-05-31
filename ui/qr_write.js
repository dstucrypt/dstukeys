var qrcode = require('qrcode-js');

var Qr = function(canvas) {
    var ob;
    var visible = ko.observable(false);
    var qr;

    var write = function(data) {
        var canvas_ctx = canvas.getContext("2d");
        qrcode.errorCorrectLevel = 'Q';
        var base64 = qrcode.toDataURL(data, 10);
        var imageObj = new Image();
        imageObj.onload = function() {
            canvas_ctx.drawImage(this, 0, 0);
        };

        imageObj.src = base64;
    };
    ob = {
        write: write,
        visible: visible,
    };

    return ob;
};

module.exports = Qr;
