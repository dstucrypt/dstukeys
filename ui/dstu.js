/*
 *
 * Interface code for emscripten-compiled gost89 (dstu200) code
 *
 * */

var em_gost = require('em-gost'),
    worker = null;

var decode_data_wrap = function(data, password, cb) {
    try {
        if(worker === null) {
            worker = new Worker(DSTU_WORKER_URL);
        }
    } catch (e) {
        return cb(em_gost.decode_data(data, password));
    }
    worker.onmessage = function(e) {
        cb(e.data.ret);
    }

    worker.postMessage({ev: 'dstu', data: data, password: password});
};

var onmessage = function(e) {
    var msg = e.data;
    return em_gost.decode_data(msg.data, msg.password);
};

// wrap blocking function with worker cb
module.exports.decode_data = decode_data_wrap;

module.exports.onmessage = onmessage;

// reexport nonwrapped
module.exports.convert_password = em_gost.convert_password;
module.exports.compute_hash = em_gost.compute_hash
