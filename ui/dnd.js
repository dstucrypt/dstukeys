/*jslint plusplus: true */

"use strict";

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

function FileSelect(cb) {
    return function (evt) {
        return handleFileSelect(evt, cb);
    };
}

function setup(cb) {
    // Setup the dnd listeners.
    var dropZone = document.getElementById('drop_zone');
    dropZone.addEventListener('dragover', handleDragOver, false);
    dropZone.addEventListener('drop', FileSelect(cb), false);

}

exports.setup = setup;
