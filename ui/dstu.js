/*
 *
 * Interface code for emscripten-compiled gost89 (dstu200) code
 *
 * */
var util = require('./util.js');

var convert_password = function(parsed, pw, raw) {
    var vm_out, vm_pw, vm_salt, args, argtypes, ret = null;
    vm_out = allocate(32, 'i8', ALLOC_STACK);
    vm_pw = allocate(intArrayFromString(pw), 'i8', ALLOC_STACK);
    if(parsed.format == 'IIT') {
        args = [vm_pw, pw.length, vm_out];
        argtypes = ['number', 'number', 'number'];

        ret = Module.ccall('iit_convert_password', 'number', argtypes, args);
    }
    if(parsed.format == 'PBES2') {
        args = [vm_pw, pw.length, util.asnbuf(parsed.salt), parsed.salt.length, parsed.iters, vm_out];
        argtypes = ['number', 'number', 'number', 'number', 'number'];
        ret = Module.ccall('pbes2_convert_password', 'number', argtypes, args);
    }
    if(ret == 0) {
        if(raw === true) {
            return vm_out;
        } else {
            return util.read_buf(vm_out, 32);
        }
    } else {
        throw new Error("Failed to convert key");
    }
}
var decode_data = function(parsed, pw) {
    var args, argtypes, bdata, bkey, bmac, rbuf, ret;

    bkey = convert_password(parsed, pw, true);
    if(parsed.format === 'IIT') {
        rbuf = allocate(parsed.body.length + parsed.pad.length, 'i8', ALLOC_STACK);
        args = [
            util.asnbuf([parsed.body, parsed.pad]), parsed.body.length,
            bkey,
            util.asnbuf(parsed.mac),
            rbuf
        ];
        argtypes = ['number', 'number', 'number', 'number'];
        ret = Module.ccall('iit_decode_data', 'number', argtypes, args)
    }
    if(parsed.format == 'PBES2') {
        rbuf = allocate(parsed.body.length, 'i8', ALLOC_STACK);
        args = [
            util.asnbuf(parsed.body), parsed.body.length,
            bkey,
            util.asnbuf(parsed.iv),
            util.asnbuf(parsed.sbox),
            rbuf
        ];
        argtypes = ['number', 'number', 'number', 'number', 'number', 'number'];
        ret = Module.ccall('pbes2_decode_data', 'number', argtypes, args);

    }
    if(ret == 0) {
        return util.read_buf(rbuf, parsed.body.length, 'hex');
    }
}

var compute_hash = function(contents) {
    var args, argtypes, vm_contents, rbuf, err, ret;
    rbuf = allocate(32, 'i8', ALLOC_STACK);
    vm_contents = allocate(intArrayFromString(contents), 'i8', ALLOC_STACK);
    args = [vm_contents, contents.length, rbuf];
    argtypes = ['number', 'number', 'number'];
    err = Module.ccall('compute_hash', 'number', argtypes, args);
    if(err === 0) {
        ret = util.read_buf(rbuf, 32);
        return ret;
    }
    throw new Error("Document hasher failed");
}

var decode_data_wrap = function(data, password, cb) {
    var worker;
    try {
        worker = new Worker(DSTU_WORKER_URL);
    } catch (e) {
        return cb(decode_data(data, password));
    }
    worker.onmessage = function(e) {
        cb(e.data.ret);
    }

    worker.postMessage({ev: 'dstu', data: data, password: password});
};

var onmessage = function(e) {
    var msg = e.data;
    return decode_data(msg.data, msg.password);
};

module.exports.decode_data = decode_data_wrap;
module.exports.convert_password = convert_password;
module.exports.compute_hash = compute_hash
module.exports.onmessage = onmessage;
