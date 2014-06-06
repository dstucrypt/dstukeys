/*jslint plusplus: true */

"use strict";

var out_cb;

function handleFileSelect(evt, cb) {
    var f, i, reader, files, u8;

    evt.stopPropagation();
    evt.preventDefault();

    files = evt.dataTransfer.files; // FileList object.
    // files is a FileList of File objects. List some properties.
    for (i = 0, f; f = files[i]; i++) {
        reader = new FileReader();
        reader.onload = function(evt) {
            u8 = new Uint8Array(evt.target.result);
            cb(u8);
        }
        reader.readAsArrayBuffer(f);
    }
}

function handleDragOver(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
}

function FileSelect() {
    return function (evt) {
        return handleFileSelect(evt, out_cb);
    };
}

function setup(cb) {
    setup_cb(cb);
    // Setup the dnd listeners.
    var dropZone = document.getElementById('drop_zone');
    dropZone.addEventListener('dragover', handleDragOver, false);
    dropZone.addEventListener('drop', FileSelect(cb), false);

}

function setup_cb(cb) {
    out_cb = cb;
};

exports.setup = setup;
exports.setup_cb = setup_cb;
