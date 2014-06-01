
var dstu = require('dstu');
onmessage = function(e) {
    var ret = dstu.onmessage(e);
    postMessage({ev: 'dstu', ret: ret});
}
