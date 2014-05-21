var read_buf = function(ptr, sz) {
    var ret = [], x=0;
    for(var i = 0; i < sz; i++) {
        x = getValue(ptr + i, 'i8');
        if(x < 0) {
            x = 256 + x;
        }
        ret.push(x);
    }
    return ret;
}
var numberHex = function(numbrs, line) {
    var hex = [], h;
    for(var i = 0; i < numbrs.length; i++) {
        h = numbrs[i].toString(16);
        if(h.length == 1) {
            h = "0" + h;
        }
        hex.push(h); 
        if( (i > 1) && (line !== undefined) && ((i%line) == line-1)) {
            hex.push('\n');
        }
    }
    return hex.join("");
}
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
var numberB64 = function(numbrs, line) {
    var ret = [], b1, b2, b3, e1, e2, e3, e4, i=0;
    while(i < numbrs.length) {

        b1 = numbrs[i++];
        b2 = numbrs[i++];
        b3 = numbrs[i++];

        e1 = b1 >> 2;
        e2 = ((b1 & 3) << 4) | (b2 >> 4);
        e3 = ((b2 & 15) << 2) | (b3 >> 6);
        e4 = b3 & 63;

        ret.push(B64.charAt(e1));
        ret.push(B64.charAt(e2));
        ret.push(B64.charAt(e3));
        ret.push(B64.charAt(e4));

        if( (i > 0) && (line !== undefined) && ((i%line) == 0)) {
            ret.push('\n');
        }
    }
    return ret.join("");
}

var asnbuf = function(asn_l) {
    var buf_len = 0, buf, start, end, off = 0,
        start, end;

    if(asn_l.buffer !== undefined) {
        asn_l = [asn_l];
    }

    for(var i = 0; i < asn_l.length; i++) {
        buf_len += asn_l[i].length;
    }

    buf = allocate(buf_len, 'i8', ALLOC_STACK);

    for(var j = 0; j < asn_l.length; j++) {
        var asn = asn_l[j], i;
        for(i = 0; i < asn.length; i++) {
            setValue(buf + i + off, asn[i], 'i8');
        }
        off += i;
    }
    return buf;
}

exports.asnbuf = asnbuf
exports.read_buf = read_buf
exports.numberB64 = numberB64
