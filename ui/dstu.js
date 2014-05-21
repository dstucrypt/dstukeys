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

module.exports.decode_data = decode_data
module.exports.convert_password = convert_password
exports.decode_data = decode_data
exports.convert_password = convert_password
