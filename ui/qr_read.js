navigator.getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);

var Qr = function(vid, canvas, result) {
    var ob;
    var timer = undefined;
    var engine = require('jsqrcode')();
    var canvas_ctx;
    var stream;
    var visible = ko.observable(false);
    var sources = null;
    var source_n = 0;

    var get_sources = function() {
        try {
            MediaStreamTrack.getSources(got_sources);
        } catch(e) {
        };
    };

    var got_sources = function(sourceInfos) {
        sources = [];
        for (var i = 0; i != sourceInfos.length; ++i) {
            var sourceInfo = sourceInfos[i];
            if (sourceInfo.kind === 'video') {
                if(sourceInfo.facing === "environment") {
                    source_n = sources.length;
                }
                sources.push(sourceInfo.id);
            }
        }
    };

    var read = function() {
        var got;
        canvas_ctx.drawImage(vid, 0, 0);
        try {
            console.log("try decode");
            got = engine.decode(canvas);
            disarm();
            console.log("got result: " + got);
            result(got);
        } catch(e) {
        }
    };

    var disarm = function() {
        stream.stop();
        vid.src = "";
        vid.pause();
        canvas.style.display = 'none';
        timer = clearInterval(timer);
    };

    var arm = function() {
        timer = clearInterval(timer);
        timer = setInterval(read, 500);
    };

    var next = function() {
        source_n++;
        if(source_n >= sources.length) {
            source_n = 0;
        }
        disarm();
        setup();
    };

    var setup = function() {
        var constraints;
        if(sources === null) {
            constraints = {audio: false, video: true};
        } else {
            var v_source = sources[source_n];
            constraints = {
                audio: false,
                video: {
                    optional: [{sourceId: v_source}]
                }
            };
        }
        navigator.getUserMedia(constraints, have_video, failed_video);
    };

    var have_video = function(s) {
        stream = s;
        vid.src = window.webkitURL.createObjectURL(stream);
        canvas_ctx = canvas.getContext("2d");
        //canvas.style.display = 'none';
        arm();
    };
    var failed_video = function(error) {
        console.log("qr fail");
    };


    var start = function() {
        setup();
    };

    ob = {
        start: start,
        visible: visible,
        stop: disarm,
        next: next,
    };

    get_sources();

    return ob;
};

module.exports = Qr;
