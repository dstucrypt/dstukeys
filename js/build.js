require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({"RxwtOC":[function(require,module,exports){
var asn1 = exports;

// Optional bignum
try {
  asn1.bignum = require('bignum');
} catch (e) {
  asn1.bignum = null;
}

asn1.define = require('./asn1/api').define;
asn1.base = require('./asn1/base');
asn1.constants = require('./asn1/constants');
asn1.decoders = require('./asn1/decoders');
asn1.encoders = require('./asn1/encoders');

},{"./asn1/api":3,"./asn1/base":5,"./asn1/constants":9,"./asn1/decoders":11,"./asn1/encoders":13,"bignum":14}],"asn1.js":[function(require,module,exports){
module.exports=require('RxwtOC');
},{}],3:[function(require,module,exports){
var asn1 = require('../asn1');
var util = require('util');
var vm = require('vm');

var api = exports;

api.define = function define(name, body) {
  return new Entity(name, body);
};

function Entity(name, body) {
  this.name = name;
  this.body = body;

  this.decoders = {};
  this.encoders = {};
};

Entity.prototype._createNamed = function createNamed(base) {
  var named = vm.runInThisContext('(function ' + this.name + '(entity) {\n' +
    '  this._initNamed(entity);\n' +
    '})');
  util.inherits(named, base);
  named.prototype._initNamed = function initnamed(entity) {
    base.call(this, entity);
  };

  return new named(this);
};

Entity.prototype.decode = function decode(data, enc, options) {
  // Lazily create decoder
  if (!this.decoders.hasOwnProperty(enc))
    this.decoders[enc] = this._createNamed(asn1.decoders[enc]);
  return this.decoders[enc].decode(data, options);
};

Entity.prototype.encode = function encode(data, enc, /* internal */ reporter) {
  // Lazily create encoder
  if (!this.encoders.hasOwnProperty(enc))
    this.encoders[enc] = this._createNamed(asn1.encoders[enc]);
  return this.encoders[enc].encode(data, reporter);
};

},{"../asn1":"RxwtOC","util":74,"vm":75}],4:[function(require,module,exports){
var assert = require('assert');
var util = require('util');
var Reporter = require('../base').Reporter;
var Buffer = require('buffer').Buffer;

function DecoderBuffer(base, options) {
  Reporter.call(this, options);
  if (!Buffer.isBuffer(base)) {
    this.error('Input not Buffer');
    return;
  }

  this.base = base;
  this.offset = 0;
  this.length = base.length;
}
util.inherits(DecoderBuffer, Reporter);
exports.DecoderBuffer = DecoderBuffer;

DecoderBuffer.prototype.save = function save() {
  return { offset: this.offset };
};

DecoderBuffer.prototype.restore = function restore(save) {
  // Return skipped data
  var res = new DecoderBuffer(this.base);
  res.offset = save.offset;
  res.length = this.offset;

  this.offset = save.offset;

  return res;
};

DecoderBuffer.prototype.isEmpty = function isEmpty() {
  return this.offset === this.length;
};

DecoderBuffer.prototype.readUInt8 = function readUInt8(fail) {
  if (this.offset + 1 <= this.length)
    return this.base.readUInt8(this.offset++, true);
  else
    return this.error(fail || 'DecoderBuffer overrun');
}

DecoderBuffer.prototype.skip = function skip(bytes, fail) {
  if (!(this.offset + bytes <= this.length))
    return this.error(fail || 'DecoderBuffer overrun');

  var res = new DecoderBuffer(this.base);

  // Share reporter state
  res._reporterState = this._reporterState;

  res.offset = this.offset;
  res.length = this.offset + bytes;
  this.offset += bytes;
  return res;
}

DecoderBuffer.prototype.raw = function raw(save) {
  return this.base.slice(save ? save.offset : this.offset, this.length);
}

function EncoderBuffer(value, reporter) {
  if (Array.isArray(value)) {
    this.length = 0;
    this.value = value.map(function(item) {
      if (!(item instanceof EncoderBuffer))
        item = new EncoderBuffer(item);
      this.length += item.length;
      return item;
    }, this);
  } else if (typeof value === 'number') {
    if (!(0 <= value && value <= 0xff))
      return reporter.error('non-byte EncoderBuffer value');
    this.value = value;
    this.length = 1;
  } else if (typeof value === 'string') {
    this.value = value;
    this.length = Buffer.byteLength(value);
  } else if (Buffer.isBuffer(value)) {
    this.value = value;
    this.length = value.length;
  } else {
    return reporter.error('Unsupporter type: ' + typeof value);
  }
}
exports.EncoderBuffer = EncoderBuffer;

EncoderBuffer.prototype.join = function join(out, offset) {
  if (!out)
    out = new Buffer(this.length);
  if (!offset)
    offset = 0;

  if (this.length === 0)
    return out;

  if (Array.isArray(this.value)) {
    this.value.forEach(function(item) {
      item.join(out, offset);
      offset += item.length;
    });
  } else {
    if (typeof this.value === 'number')
      out[offset] = this.value;
    else if (typeof this.value === 'string')
      out.write(this.value, offset);
    else if (Buffer.isBuffer(this.value))
      this.value.copy(out, offset);
    offset += this.length;
  }

  return out;
};

},{"../base":5,"assert":64,"buffer":"VTj7jY","util":74}],5:[function(require,module,exports){
var base = exports;

base.Reporter = require('./reporter').Reporter;
base.DecoderBuffer = require('./buffer').DecoderBuffer;
base.EncoderBuffer = require('./buffer').EncoderBuffer;
base.Node = require('./node');

},{"./buffer":4,"./node":6,"./reporter":7}],6:[function(require,module,exports){
var assert = require('assert');
var Reporter = require('../base').Reporter;
var EncoderBuffer = require('../base').EncoderBuffer;

// Supported tags
var tags = [
  'seq', 'seqof', 'set', 'setof', 'octstr', 'bitstr', 'objid', 'bool',
  'gentime', 'utctime', 'null_', 'enum', 'int'
];

// Public methods list
var methods = [
  'key', 'obj', 'use', 'optional', 'explicit', 'implicit', 'def', 'choice',
  'any'
].concat(tags);

// Overrided methods list
var overrided = [
  '_peekTag', '_decodeTag', '_use',
  '_decodeStr', '_decodeObjid', '_decodeTime',
  '_decodeNull', '_decodeInt', '_decodeBool', '_decodeList',

  '_encodeComposite', '_encodeStr', '_encodeObjid', '_encodeTime',
  '_encodeNull', '_encodeInt', '_encodeBool'
];

function Node(enc, parent) {
  var state = {};
  this._baseState = state;

  state.enc = enc;

  state.parent = parent || null;
  state.children = null;

  // State
  state.tag = null;
  state.args = null;
  state.reverseArgs = null;
  state.choice = null;
  state.optional = false;
  state.any = false;
  state.obj = false;
  state.use = null;
  state.key = null;
  state['default'] = null;
  state.explicit = null;
  state.implicit = null;

  // Should create new instance on each method
  if (!state.parent) {
    state.children = [];
    this._wrap();
  }
}
module.exports = Node;

Node.prototype._wrap = function wrap() {
  var state = this._baseState;
  methods.forEach(function(method) {
    this[method] = function _wrappedMethod() {
      var clone = new this.constructor(this);
      state.children.push(clone);
      return clone[method].apply(clone, arguments);
    };
  }, this);
};

Node.prototype._init = function init(body) {
  var state = this._baseState;

  assert(state.parent === null);
  body.call(this);

  // Filter children
  state.children = state.children.filter(function(child) {
    return child._baseState.parent === this;
  }, this);
  assert.equal(state.children.length, 1, 'Root node can have only one child');
};

Node.prototype._useArgs = function useArgs(args) {
  var state = this._baseState;

  // Filter children and args
  var children = args.filter(function(arg) {
    return arg instanceof this.constructor;
  }, this);
  args = args.filter(function(arg) {
    return !(arg instanceof this.constructor);
  }, this);

  if (children.length !== 0) {
    assert(state.children === null);
    state.children = children;

    // Replace parent to maintain backward link
    children.forEach(function(child) {
      child._baseState.parent = this;
    }, this);
  }
  if (args.length !== 0) {
    assert(state.args === null);
    state.args = args;
    state.reverseArgs = args.map(function(arg) {
      if (typeof arg !== 'object' || arg.constructor !== Object)
        return arg;

      var res = {};
      Object.keys(arg).forEach(function(key) {
        if (key == (key | 0))
          key |= 0;
        var value = arg[key];
        res[value] = key;
      });
      return res;
    });
  }
};

//
// Overrided methods
//

overrided.forEach(function(method) {
  Node.prototype[method] = function _overrided() {
    var state = this._baseState;
    throw new Error(method + ' not implemented for encoding: ' + state.enc);
  };
});

//
// Public methods
//

tags.forEach(function(tag) {
  Node.prototype[tag] = function _tagMethod() {
    var state = this._baseState;
    var args = Array.prototype.slice.call(arguments);

    assert(state.tag === null);
    state.tag = tag;

    this._useArgs(args);

    return this;
  };
});

Node.prototype.use = function use(item) {
  var state = this._baseState;

  assert(state.use === null);
  state.use = item;

  return this;
};

Node.prototype.optional = function optional() {
  var state = this._baseState;

  state.optional = true;

  return this;
};

Node.prototype.def = function def(val) {
  var state = this._baseState;

  assert(state['default'] === null);
  state['default'] = val;
  state.optional = true;

  return this;
};

Node.prototype.explicit = function explicit(num) {
  var state = this._baseState;

  assert(state.explicit === null && state.implicit === null);
  state.explicit = num;

  return this;
};

Node.prototype.implicit = function implicit(num) {
  var state = this._baseState;

  assert(state.explicit === null && state.implicit === null);
  state.implicit = num;

  return this;
};

Node.prototype.obj = function obj() {
  var state = this._baseState;
  var args = Array.prototype.slice.call(arguments);

  state.obj = true;

  if (args.length !== 0)
    this._useArgs(args);

  return this;
};

Node.prototype.key = function key(key) {
  var state = this._baseState;

  assert(state.key === null);
  state.key = key;

  return this;
};

Node.prototype.any = function any() {
  var state = this._baseState;

  state.any = true;

  return this;
};

Node.prototype.choice = function choice(obj) {
  var state = this._baseState;

  assert(state.choice === null);
  state.choice = obj;
  this._useArgs(Object.keys(obj).map(function(key) {
    return obj[key];
  }));

  return this;
};

//
// Decoding
//

Node.prototype._decode = function decode(input) {
  var state = this._baseState;

  // Decode root node
  if (state.parent === null)
    return input.wrapResult(state.children[0]._decode(input));

  var result = state['default'];
  var present = true;

  var prevKey;
  if (state.key !== null)
    prevKey = input.enterKey(state.key);

  // Check if tag is there
  if (state.optional) {
    present = this._peekTag(
      input,
      state.explicit !== null ? state.explicit :
          state.implicit !== null ? state.implicit :
              state.tag || 0
    );
    if (input.isError(present))
      return present;
  }

  // Push object on stack
  var prevObj;
  if (state.obj && present)
    prevObj = input.enterObject();

  if (present) {
    // Unwrap explicit values
    if (state.explicit !== null) {
      var explicit = this._decodeTag(input, state.explicit);
      if (input.isError(explicit))
        return explicit;
      input = explicit;
    }

    // Unwrap implicit and normal values
    if (state.use === null && state.choice === null) {
      if (state.any)
        var save = input.save();
      var body = this._decodeTag(
        input,
        state.implicit !== null ? state.implicit : state.tag,
        state.any
      );
      if (input.isError(body))
        return body;

      if (state.any)
        result = input.raw(save);
      else
        input = body;
    }

    // Select proper method for tag
    if (state.any)
      result = result;
    else if (state.choice === null)
      result = this._decodeGeneric(state.tag, input);
    else
      result = this._decodeChoice(input);

    if (input.isError(result))
      return result;

    // Decode children
    if (!state.any && state.choice === null && state.children !== null) {
      var fail = state.children.some(function decodeChildren(child) {
        // NOTE: We are ignoring errors here, to let parser continue with other
        // parts of encoded data
        child._decode(input);
      });
      if (fail)
        return err;
    }
  }

  // Pop object
  if (state.obj && present)
    result = input.leaveObject(prevObj);

  // Set key
  if (state.key !== null)
    input.leaveKey(prevKey, state.key, result);

  return result;
};

Node.prototype._decodeGeneric = function decodeGeneric(tag, input) {
  var state = this._baseState;

  if (tag === 'seq' || tag === 'set')
    return null;
  if (tag === 'seqof' || tag === 'setof')
    return this._decodeList(input, tag, state.args[0]);
  else if (tag === 'octstr' || tag === 'bitstr')
    return this._decodeStr(input, tag);
  else if (tag === 'objid' && state.args)
    return this._decodeObjid(input, state.args[0], state.args[1]);
  else if (tag === 'objid')
    return this._decodeObjid(input, null, null);
  else if (tag === 'gentime' || tag === 'utctime')
    return this._decodeTime(input, tag);
  else if (tag === 'null_')
    return this._decodeNull(input);
  else if (tag === 'bool')
    return this._decodeBool(input);
  else if (tag === 'int' || tag === 'enum')
    return this._decodeInt(input, state.args && state.args[0]);
  else if (state.use !== null)
    return this._use(input, state.use);
  else
    return input.error('unknown tag: ' + tag);

  return null;
};

Node.prototype._decodeChoice = function decodeChoice(input) {
  var state = this._baseState;
  var result = null;
  var match = false;

  Object.keys(state.choice).some(function(key) {
    var save = input.save();
    var node = state.choice[key];
    try {
      var value = node._decode(input);
      if (input.isError(value))
        return false;

      result = { type: key, value: value };
      match = true;
    } catch (e) {
      input.restore(save);
      return false;
    }
    return true;
  }, this);

  if (!match)
    return input.error('Choice not matched');

  return result;
};

//
// Encoding
//

Node.prototype._createEncoderBuffer = function createEncoderBuffer(data) {
  return new EncoderBuffer(data, this.reporter);
};

Node.prototype._encode = function encode(data, reporter) {
  var state = this._baseState;

  // Decode root node
  if (state.parent === null)
    return state.children[0]._encode(data, reporter || new Reporter());

  var result = null;
  var present = true;

  // Set reporter to share it with a child class
  this.reporter = reporter;

  // Check if data is there
  if (state.optional && data === undefined) {
    if (state['default'] !== null)
      data = state['default']
    else
      return;
  }

  // For error reporting
  var prevKey;

  // Encode children first
  var content = null;
  var primitive = false;
  if (state.any) {
    // Anything that was given is translated to buffer
    result = this._createEncoderBuffer(data);
  } else if (state.children) {
    content = state.children.map(function(child) {
      if (child._baseState.key === null)
        return reporter.error('Child should have a key');
      var prevKey = reporter.enterKey(child._baseState.key);

      if (typeof data !== 'object')
        return reporter.error('Child expected, but input is not object');

      var res = child._encode(data[child._baseState.key], reporter);
      reporter.leaveKey(prevKey);

      return res;
    }, this).filter(function(child) {
      return child;
    });

    content = this._createEncoderBuffer(content);
  } else {
    if (state.choice === null) {
      if (state.tag === 'seqof' || state.tag === 'setof') {
        // TODO(indutny): this should be thrown on DSL level
        if (!(state.args && state.args.length === 1))
          return reporter.error('Too many args for : ' + state.tag);

        if (!Array.isArray(data))
          return reporter.error('seqof/setof, but data is not Array');

        content = this._createEncoderBuffer(data.map(function(item) {
          return this._use(state.args[0], item);
        }, this));
      } else if (state.use !== null) {
        result = this._use(state.use, data);
      } else {
        content = this._encodePrimitive(state.tag, data);
        primitive = true;
      }
    } else {
      result = this._encodeChoice(data, reporter);
    }
  }

  // Encode data itself
  var result;
  if (!state.any && state.choice === null) {
    var tag = state.implicit !== null ? state.implicit : state.tag;

    if (tag === null) {
      if (state.use === null)
        reporter.error('Tag could be ommited only for .use()');
    } else {
      result = this._encodeComposite(tag, primitive, 'universal', content);
    }
  }

  // Wrap in explicit
  if (state.explicit !== null)
    result = this._encodeComposite(state.explicit, false, 'context', result);

  return result;
};

Node.prototype._encodeChoice = function encodeChoice(data, reporter) {
  var state = this._baseState;

  var node = state.choice[data.type];
  return node._encode(data.value, reporter);
};

Node.prototype._encodePrimitive = function encodePrimitive(tag, data) {
  var state = this._baseState;

  if (tag === 'octstr' || tag === 'bitstr')
    return this._encodeStr(data, tag);
  else if (tag === 'objid' && state.args)
    return this._encodeObjid(data, state.reverseArgs[0], state.args[1]);
  else if (tag === 'objid')
    return this._encodeObjid(data, null, null);
  else if (tag === 'gentime' || tag === 'utctime')
    return this._encodeTime(data, tag);
  else if (tag === 'null_')
    return this._encodeNull();
  else if (tag === 'int' || tag === 'enum')
    return this._encodeInt(data, state.args && state.reverseArgs[0]);
  else if (tag === 'bool')
    return this._encodeBool(data);
  else
    throw new Error('Unsupported tag: ' + tag);
};

},{"../base":5,"assert":64}],7:[function(require,module,exports){
var util = require('util');

function Reporter(options) {
  this._reporterState = {
    obj: null,
    path: [],
    options: options || {},
    errors: []
  };
}
exports.Reporter = Reporter;

Reporter.prototype.isError = function isError(obj) {
  return obj instanceof ReporterError;
};

Reporter.prototype.enterKey = function enterKey(key) {
  return this._reporterState.path.push(key);
};

Reporter.prototype.leaveKey = function leaveKey(index, key, value) {
  var state = this._reporterState;

  state.path = state.path.slice(0, index - 1);
  if (state.obj !== null)
    state.obj[key] = value;
};

Reporter.prototype.enterObject = function enterObject() {
  var state = this._reporterState;

  var prev = state.obj;
  state.obj = {};
  return prev;
};

Reporter.prototype.leaveObject = function leaveObject(prev) {
  var state = this._reporterState;

  var now = state.obj;
  state.obj = prev;
  return now;
};

Reporter.prototype.error = function error(msg) {
  var err;
  var state = this._reporterState;

  var inherited = msg instanceof ReporterError;
  if (inherited) {
    err = msg;
  } else {
    err = new ReporterError(state.path.map(function(elem) {
      return '[' + JSON.stringify(elem) + ']';
    }).join(''), msg.message || msg, msg.stack);
  }

  if (!state.options.partial)
    throw err;

  if (!inherited)
    state.errors.push(err);

  return err;
};

Reporter.prototype.wrapResult = function wrapResult(result) {
  var state = this._reporterState;
  if (!state.options.partial)
    return result;

  return {
    result: this.isError(result) ? null : result,
    errors: state.errors
  };
};

function ReporterError(path, msg) {
  this.path = path;
  this.rethrow(msg);
};
util.inherits(ReporterError, Error);

ReporterError.prototype.rethrow = function rethrow(msg) {
  this.message = msg + ' at: ' + (this.path || '(shallow)');
  Error.captureStackTrace(this, ReporterError);

  return this;
};

},{"util":74}],8:[function(require,module,exports){
var constants = require('../constants');

exports.tagClass = {
  0: 'universal',
  1: 'application',
  2: 'context',
  3: 'private'
};
exports.tagClassByName = constants._reverse(exports.tagClass);

exports.tag = {
  0x00: 'end',
  0x01: 'bool',
  0x02: 'int',
  0x03: 'bitstr',
  0x04: 'octstr',
  0x05: 'null_',
  0x06: 'objid',
  0x07: 'objDesc',
  0x08: 'external',
  0x09: 'real',
  0x0a: 'enum',
  0x0b: 'embed',
  0x0c: 'utf8str',
  0x0d: 'relativeOid',
  0x10: 'seq',
  0x11: 'set',
  0x12: 'numstr',
  0x13: 'printstr',
  0x14: 't61str',
  0x15: 'videostr',
  0x16: 'ia5str',
  0x17: 'utctime',
  0x18: 'gentime',
  0x19: 'graphstr',
  0x1a: 'iso646str',
  0x1b: 'genstr',
  0x1c: 'unistr',
  0x1d: 'charstr',
  0x1e: 'bmpstr'
};
exports.tagByName = constants._reverse(exports.tag);

},{"../constants":9}],9:[function(require,module,exports){
var constants = exports;

// Helper
constants._reverse = function reverse(map) {
  var res = {};

  Object.keys(map).forEach(function(key) {
    // Convert key to integer if it is stringified
    if ((key | 0) == key)
      key = key | 0;

    var value = map[key];
    res[value] = key;
  });

  return res;
};

constants.der = require('./der');

},{"./der":8}],10:[function(require,module,exports){
var util = require('util');

var asn1 = require('../../asn1');
var base = asn1.base;
var bignum = asn1.bignum;

// Import DER constants
var der = asn1.constants.der;

function DERDecoder(entity) {
  this.enc = 'der';
  this.name = entity.name;
  this.entity = entity;

  // Construct base tree
  this.tree = new DERNode();
  this.tree._init(entity.body);
};
module.exports = DERDecoder;

DERDecoder.prototype.decode = function decode(data, options) {
  if (!(data instanceof base.DecoderBuffer))
    data = new base.DecoderBuffer(data, options);

  return this.tree._decode(data, options);
};

// Tree methods

function DERNode(parent) {
  base.Node.call(this, 'der', parent);
}
util.inherits(DERNode, base.Node);

DERNode.prototype._peekTag = function peekTag(buffer, tag) {
  if (buffer.isEmpty())
    return false;

  var state = buffer.save();
  var decodedTag = derDecodeTag(buffer, 'Failed to peek tag: "' + tag + '"');
  if (buffer.isError(decodedTag))
    return decodedTag;

  buffer.restore(state);

  return decodedTag.tag === tag || decodedTag.tagStr === tag;
};

DERNode.prototype._decodeTag = function decodeTag(buffer, tag, any) {
  var decodedTag = derDecodeTag(buffer,
                                'Failed to decode tag of "' + tag + '"');
  if (buffer.isError(decodedTag))
    return decodedTag;

  var len = derDecodeLen(buffer,
                         decodedTag.primitive,
                         'Failed to get length of "' + tag + '"');

  // Failure
  if (buffer.isError(len))
    return len;

  if (!any &&
      decodedTag.tag !== tag &&
      decodedTag.tagStr !== tag &&
      decodedTag.tagStr + 'of' !== tag) {
    return buffer.error('Failed to match tag: "' + tag + '"');
  }

  if (decodedTag.primitive || len !== null)
    return buffer.skip(len, 'Failed to match body of: "' + tag + '"');

  // Indefinite length... find END tag
  var state = buffer.start();
  var res = this._skipUntilEnd(
      buffer,
      'Failed to skip indefinite length body: "' + this.tag + '"');
  if (buffer.isError(res))
    return res;

  return buffer.cut(state);
};

DERNode.prototype._skipUntilEnd = function skipUntilEnd(buffer, fail) {
  while (true) {
    var tag = derDecodeTag(buffer, fail);
    if (buffer.isError(tag))
      return tag;
    var len = derDecodeLen(buffer, tag.primitive, fail);
    if (buffer.isError(len))
      return len;

    var res;
    if (tag.primitive || len !== null)
      res = buffer.skip(len)
    else
      res = this._skipUntilEnd(buffer, fail);

    // Failure
    if (buffer.isError(res))
      return res;

    if (tag.tagStr === 'end')
      break;
  }
};

DERNode.prototype._decodeList = function decodeList(buffer, tag, decoder) {
  var result = [];
  while (!buffer.isEmpty()) {
    var possibleEnd = this._peekTag(buffer, 'end');
    if (buffer.isError(possibleEnd))
      return possibleEnd;

    var res = decoder.decode(buffer, 'der');
    if (buffer.isError(res) && possibleEnd)
      break;
    result.push(res);
  }
  return result;
};

DERNode.prototype._decodeStr = function decodeStr(buffer, tag) {
  if (tag === 'octstr') {
    return buffer.raw();
  } else if (tag === 'bitstr') {
    var unused = buffer.readUInt8();
    if (buffer.isError(unused))
      return unused;

    return { unused: unused, data: buffer.raw() };
  } else {
    return this.error('Decoding of string type: ' + tag + ' unsupported');
  }
};

DERNode.prototype._decodeObjid = function decodeObjid(buffer, values, relative) {
  var identifiers = [];
  var ident = 0;
  while (!buffer.isEmpty()) {
    var subident = buffer.readUInt8();
    ident <<= 7;
    ident |= subident & 0x7f;
    if ((subident & 0x80) === 0) {
      identifiers.push(ident);
      ident = 0;
    }
  }
  if (subident & 0x80)
    identifiers.push(ident);

  var first = (identifiers[0] / 40) | 0;
  var second = identifiers[0] % 40;

  if (relative)
    result = identifiers;
  else
    result = [first, second].concat(identifiers.slice(1));

  if (values)
    result = values[result.join(' ')];

  return result;
};

DERNode.prototype._decodeTime = function decodeTime(buffer, tag) {
  var str = buffer.raw().toString();
  if (tag === 'gentime') {
    var year = str.slice(0, 4) | 0;
    var mon = str.slice(4, 6) | 0;
    var day = str.slice(6, 8) | 0;
    var hour = str.slice(8, 10) | 0;
    var min = str.slice(10, 12) | 0;
    var sec = str.slice(12, 14) | 0;
  } else if (tag === 'utctime') {
    var year = str.slice(0, 2) | 0;
    var mon = str.slice(2, 4) | 0;
    var day = str.slice(4, 6) | 0;
    var hour = str.slice(6, 8) | 0;
    var min = str.slice(8, 10) | 0;
    var sec = str.slice(10, 12) | 0;
    if (year < 70)
      year = 2000 + year;
    else
      year = 1900 + year;
  } else {
    return this.error('Decoding ' + tag + ' time is not supported yet');
  }

  return Date.UTC(year, mon - 1, day, hour, min, sec, 0);
};

DERNode.prototype._decodeNull = function decodeNull(buffer) {
  return null;
};

DERNode.prototype._decodeBool = function decodeBool(buffer) {
  var res = buffer.readUInt8();
  if (buffer.isError(res))
    return res;
  else
    return res !== 0;
};

DERNode.prototype._decodeInt = function decodeInt(buffer, values) {
  var res = 0;

  // Bigint, return as it is (assume big endian)
  var raw = buffer.raw();
  if (raw.length > 3) {
    if (bignum !== null)
      raw = bignum.fromBuffer(raw, { endian: 'big' });
    return raw;
  }

  while (!buffer.isEmpty()) {
    res <<= 8;
    var i = buffer.readUInt8();
    if (buffer.isError(i))
      return i;
    res |= i;
  }

  if (values)
    res = values[res] || res;

  return res;
};

DERNode.prototype._use = function use(buffer, decoder) {
  return decoder.decode(buffer, 'der');
};

// Utility methods

function derDecodeTag(buf, fail) {
  var tag = buf.readUInt8(fail);
  if (buf.isError(tag))
    return tag;

  var cls = der.tagClass[tag >> 6];
  var primitive = (tag & 0x20) === 0;

  // Multi-octet tag - load
  if ((tag & 0x1f) === 0x1f) {
    var oct = tag;
    tag = 0;
    while ((oct & 0x80) === 0x80) {
      oct = buf.readUInt8(fail);
      if (buf.isError(oct))
        return oct;

      tag <<= 7;
      tag |= oct & 0x7f;
    }
  } else {
    tag &= 0x1f;
  }
  var tagStr = der.tag[tag];

  return {
    cls: cls,
    primitive: primitive,
    tag: tag,
    tagStr: tagStr
  };
}

function derDecodeLen(buf, primitive, fail) {
  var len = buf.readUInt8(fail);
  if (buf.isError(len))
    return len;

  // Indefinite form
  if (!primitive && len === 0x80)
    return null;

  // Definite form
  if ((len & 0x80) === 0) {
    // Short form
    return len;
  }

  // Long form
  var num = len & 0x7f;
  if (num >= 4)
    return buf.error('length octect is too long');

  len = 0;
  for (var i = 0; i < num; i++) {
    len <<= 8;
    var j = buf.readUInt8(fail);
    if (buf.isError(j))
      return j;
    len |= j;
  }

  return len;
}

},{"../../asn1":"RxwtOC","util":74}],11:[function(require,module,exports){
var decoders = exports;

decoders.der = require('./der');

},{"./der":10}],12:[function(require,module,exports){
var util = require('util');
var Buffer = require('buffer').Buffer;

var asn1 = require('../../asn1');
var base = asn1.base;
var bignum = asn1.bignum;

// Import DER constants
var der = asn1.constants.der;

function DEREncoder(entity) {
  this.enc = 'der';
  this.name = entity.name;
  this.entity = entity;

  // Construct base tree
  this.tree = new DERNode();
  this.tree._init(entity.body);
};
module.exports = DEREncoder;

DEREncoder.prototype.encode = function encode(data, reporter) {
  return this.tree._encode(data, reporter).join();
};

// Tree methods

function DERNode(parent) {
  base.Node.call(this, 'der', parent);
}
util.inherits(DERNode, base.Node);

DERNode.prototype._encodeComposite = function encodeComposite(tag,
                                                              primitive,
                                                              cls,
                                                              content) {
  var encodedTag = encodeTag(tag, primitive, cls, this.reporter);

  // Short form
  if (content.length < 0x80) {
    var header = new Buffer(2);
    header[0] = encodedTag;
    header[1] = content.length;
    return this._createEncoderBuffer([ header, content ]);
  }

  // Long form
  // Count octets required to store length
  var lenOctets = 1;
  for (var i = content.length; i >= 0x100; i >>= 8)
    lenOctets++;

  var header = new Buffer(1 + 1 + lenOctets);
  header[0] = encodedTag;
  header[1] = 0x80 | lenOctets;

  for (var i = 1 + lenOctets, j = content.length; j > 0; i--, j >>= 8)
    header[i] = j & 0xff;

  return this._createEncoderBuffer([ header, content ]);
};

DERNode.prototype._encodeStr = function encodeStr(str, tag) {
  if (tag === 'octstr')
    return this._createEncoderBuffer(str);
  else if (tag === 'bitstr')
    return this._createEncoderBuffer([ str.unused | 0, str.data ]);
  return this.reporter.error('Encoding of string type: ' + tag +
                             ' unsupported');
};

DERNode.prototype._encodeObjid = function encodeObjid(id, values, relative) {
  if (typeof id === 'string') {
    if (!values)
      return this.reporter.error('string objid given, but no values map found');
    if (!values.hasOwnProperty(id))
      return this.reporter.error('objid not found in values map');
    id = values[id].split(/\s+/g);
    for (var i = 0; i < id.length; i++)
      id[i] |= 0;
  }

  if (!Array.isArray(id)) {
    return this.reporter.error('objid() should be either array or string, ' +
                               'got: ' + JSON.stringify(id));
  }

  if (!relative) {
    if (id[1] >= 40)
      return this.reporter.error('Second objid identifier OOB');
    id.splice(0, 2, id[0] * 40 + id[1]);
  }

  // Count number of octets
  var size = 0;
  for (var i = 0; i < id.length; i++) {
    var ident = id[i];
    for (size++; ident >= 0x80; ident >>= 7)
      size++;
  }

  var objid = new Buffer(size);
  var offset = objid.length - 1;
  for (var i = id.length - 1; i >= 0; i--) {
    var ident = id[i];
    objid[offset--] = ident & 0x7f;
    while ((ident >>= 7) > 0)
      objid[offset--] = 0x80 | (ident & 0x7f);
  }

  return this._createEncoderBuffer(objid);
};

function two(num) {
  if (num <= 10)
    return '0' + num;
  else
    return num;
}

DERNode.prototype._encodeTime = function encodeTime(time, tag) {
  var str;
  var date = new Date(time);

  if (tag === 'gentime') {
    str = [
      date.getFullYear(),
      two(date.getUTCMonth() + 1),
      two(date.getUTCDate()),
      two(date.getUTCHours()),
      two(date.getUTCMinutes()),
      two(date.getUTCSeconds()),
      'Z'
    ].join('');
  } else if (tag === 'utctime') {
    str = [
      date.getFullYear() % 100,
      two(date.getUTCMonth() + 1),
      two(date.getUTCDate()),
      two(date.getUTCHours()),
      two(date.getUTCMinutes()),
      two(date.getUTCSeconds()),
      'Z'
    ].join('');
  } else {
    this.reporter.error('Encoding ' + tag + ' time is not supported yet');
  }

  return this._encodeStr(str, 'octstr');
};

DERNode.prototype._encodeNull = function encodeNull() {
  return this._createEncoderBuffer('');
};

DERNode.prototype._encodeInt = function encodeInt(num, values) {
  if (typeof num === 'string') {
    if (!values)
      return this.reporter.error('String int or enum given, but no values map');
    if (!values.hasOwnProperty(num)) {
      return this.reporter.error('Values map doesn\'t contain: ' +
                                 JSON.stringify(num));
    }
    num = values[num];
  }

  // Bignum, assume big endian
  if (bignum !== null && num instanceof bignum)
    num = num.toBuffer({ endian: 'big' });

  if (Buffer.isBuffer(num)) {
    var size = num.length;
    if (num.length === 0)
      size++;

    var out = new Buffer(size);
    num.copy(out);
    if (num.length === 0)
      out[0] = 0
    return this._createEncoderBuffer(out);
  }

  if (num < 0x100)
    return this._createEncoderBuffer(num);

  var size = 1;
  for (var i = num; i >= 0x100; i >>= 8)
    size++;

  var out = new Buffer(size);
  for (var i = out.length - 1; i >= 0; i--) {
    out[i] = num & 0xff;
    num >>= 8;
  }

  return this._createEncoderBuffer(out);
};

DERNode.prototype._encodeBool = function encodeBool(value) {
  return this._createEncoderBuffer(value ? 0xff : 0);
};

DERNode.prototype._use = function use(encoder, data) {
  return encoder.encode(data, 'der', this.reporter);
};

// Utility methods

function encodeTag(tag, primitive, cls, reporter) {
  var res;

  if (tag === 'seqof')
    tag = 'seq';
  else if (tag === 'setof')
    tag = 'set';

  if (der.tagByName.hasOwnProperty(tag))
    res = der.tagByName[tag];
  else if (typeof tag === 'number' && (tag | 0) === tag)
    res = tag;
  else
    return reporter.error('Unknown tag: ' + tag);

  if (res >= 0x1f)
    return reporter.error('Multi-octet tag encoding unsupported');

  if (!primitive)
    res |= 0x20;

  res |= (der.tagClassByName[cls || 'universal'] << 6);

  return res;
}

},{"../../asn1":"RxwtOC","buffer":"VTj7jY","util":74}],13:[function(require,module,exports){
var encoders = exports;

encoders.der = require('./der');

},{"./der":12}],14:[function(require,module,exports){
(function (Buffer){
try {
    var cc = new require('./build/Debug/bignum');
} catch(e) {
    var cc = new require('./build/Release/bignum');
}
var BigNum = cc.BigNum;

module.exports = BigNum;

BigNum.conditionArgs = function(num, base) {
    if (typeof num !== 'string') num = num.toString(base || 10);

    if (num.match(/e\+/)) { // positive exponent
        if (!Number(num).toString().match(/e\+/)) {
        return {
            num: Math.floor(Number(num)).toString(),
            base: 10
        };
    }
    else {
        var pow = Math.ceil(Math.log(num) / Math.log(2));
        var n = (num / Math.pow(2, pow)).toString(2)
            .replace(/^0/,'');
        var i = n.length - n.indexOf('.');
        n = n.replace(/\./,'');

        for (; i <= pow; i++) n += '0';
           return {
               num : n,
               base : 2,
           };
        }
    }
    else if (num.match(/e\-/)) { // negative exponent
        return {
            num : Math.floor(Number(num)).toString(),
            base : base || 10
        };
    }
    else {
        return {
            num : num,
            base : base || 10,
        };
    }
};

cc.setJSConditioner(BigNum.conditionArgs);

BigNum.prototype.inspect = function () {
    return '<BigNum ' + this.toString(10) + '>';
};

BigNum.prototype.toString = function (base) {
    var value;
    if (base) {
        value = this.tostring(base);
    } else {
        value = this.tostring();
    }
    if (base > 10 && "string" === typeof value) {
      value = value.toLowerCase();
    }
    return value;
};

BigNum.prototype.toNumber = function () {
    return parseInt(this.toString(), 10);
};

[ 'add', 'sub', 'mul', 'div', 'mod' ].forEach(function (op) {
    BigNum.prototype[op] = function (num) {
        if (num instanceof BigNum) {
            return this['b'+op](num);
        }
        else if (typeof num === 'number') {
            if (num >= 0) {
                return this['u'+op](num);
            }
            else if (op === 'add') {
                return this.usub(-num);
            }
            else if (op === 'sub') {
                return this.uadd(-num);
            }
            else {
                var x = BigNum(num);
                return this['b'+op](x);
            }
        }
        else if (typeof num === 'string') {
            var x = BigNum(num);
            return this['b'+op](x);
        }
        else {
            throw new TypeError('Unspecified operation for type '
                + (typeof num) + ' for ' + op);
        }
    };
});

BigNum.prototype.abs = function () {
    return this.babs();
};

BigNum.prototype.neg = function () {
    return this.bneg();
};

BigNum.prototype.powm = function (num, mod) {
    var m, res;

    if ((typeof mod) === 'number' || (typeof mod) === 'string') {
        m = BigNum(mod);
    }
    else if (mod instanceof BigNum) {
        m = mod;
    }

    if ((typeof num) === 'number') {
        return this.upowm(num, m);
    }
    else if ((typeof num) === 'string') {
        var n = BigNum(num);
        return this.bpowm(n, m);
    }
    else if (num instanceof BigNum) {
        return this.bpowm(num, m);
    }
};

BigNum.prototype.mod = function (num, mod) {
    var m, res;

    if ((typeof mod) === 'number' || (typeof mod) === 'string') {
        m = BigNum(mod);
    }
    else if (mod instanceof BigNum) {
        m = mod;
    }

    if ((typeof num) === 'number') {
        return this.umod(num, m);
    }
    else if ((typeof num) === 'string') {
        var n = BigNum(num);
        return this.bmod(n, m);
    }
    else if (num instanceof BigNum) {
        return this.bmod(num, m);
    }
};


BigNum.prototype.pow = function (num) {
    if (typeof num === 'number') {
        if (num >= 0) {
            return this.upow(num);
        }
        else {
            return BigNum.prototype.powm.call(this, num, this);
        }
    }
    else {
        var x = parseInt(num.toString(), 10);
        return BigNum.prototype.pow.call(this, x);
    }
};

BigNum.prototype.shiftLeft = function (num) {
    if (typeof num === 'number') {
        if (num >= 0) {
            return this.umul2exp(num);
        }
        else {
            return this.shiftRight(-num);
        }
    }
    else {
        var x = parseInt(num.toString(), 10);
        return BigNum.prototype.shiftLeft.call(this, x);
    }
};

BigNum.prototype.shiftRight = function (num) {
    if (typeof num === 'number') {
        if (num >= 0) {
            return this.udiv2exp(num);
        }
        else {
            return this.shiftLeft(-num);
        }
    }
    else {
        var x = parseInt(num.toString(), 10);
        return BigNum.prototype.shiftRight.call(this, x);
    }
};

BigNum.prototype.cmp = function (num) {
    if (num instanceof BigNum) {
        return this.bcompare(num);
    }
    else if (typeof num === 'number') {
        if (num < 0) {
            return this.scompare(num);
        }
        else {
            return this.ucompare(num);
        }
    }
    else {
        var x = BigNum(num);
        return this.bcompare(x);
    }
};

BigNum.prototype.gt = function (num) {
    return this.cmp(num) > 0;
};

BigNum.prototype.ge = function (num) {
    return this.cmp(num) >= 0;
};

BigNum.prototype.eq = function (num) {
    return this.cmp(num) === 0;
};

BigNum.prototype.ne = function (num) {
    return this.cmp(num) !== 0;
};

BigNum.prototype.lt = function (num) {
    return this.cmp(num) < 0;
};

BigNum.prototype.le = function (num) {
    return this.cmp(num) <= 0;
};

'and or xor'.split(' ').forEach(function (name) {
    BigNum.prototype[name] = function (num) {
        if (num instanceof BigNum) {
            return this['b' + name](num);
        }
        else {
            var x = BigNum(num);
            return this['b' + name](x);
        }
    };
});

BigNum.prototype.sqrt = function() {
    return this.bsqrt();
};

BigNum.prototype.root = function(num) {
    if (num instanceof BigNum) {
        return this.broot(num);
    }
    else {
        var x = BigNum(num);
        return this.broot(num);
    }
};

BigNum.prototype.rand = function (to) {
    if (to === undefined) {
        if (this.toString() === '1') {
            return BigNum(0);
        }
        else {
            return this.brand0();
        }
    }
    else {
        var x = to instanceof BigNum
            ? to.sub(this)
            : BigNum(to).sub(this);
        return x.brand0().add(this);
    }
};

BigNum.prototype.invertm = function (mod) {
    if (mod instanceof BigNum) {
        return this.binvertm(mod);
    }
    else {
        var x = BigNum(mod);
        return this.binvertm(x);
    }
};

BigNum.prime = function (bits, safe) {
  if ("undefined" === typeof safe) {
    safe = true;
  }

  // Force uint32
  bits >>>= 0;

  return BigNum.uprime0(bits, !!safe);
};

BigNum.prototype.probPrime = function (reps) {
    var n = this.probprime(reps || 10);
    return { 1 : true, 0 : false }[n];
};

BigNum.prototype.nextPrime = function () {
    var num = this;
    do {
        num = num.add(1);
    } while (!num.probPrime());
    return num;
};

BigNum.fromBuffer = function (buf, opts) {
    if (!opts) opts = {};

    var endian = { 1 : 'big', '-1' : 'little' }[opts.endian]
        || opts.endian || 'big'
    ;

    var size = opts.size === 'auto' ? Math.ceil(buf.length) : (opts.size || 1);

    if (buf.length % size !== 0) {
        throw new RangeError('Buffer length (' + buf.length + ')'
            + ' must be a multiple of size (' + size + ')'
        );
    }

    var hex = [];
    for (var i = 0; i < buf.length; i += size) {
        var chunk = [];
        for (var j = 0; j < size; j++) {
            chunk.push(buf[
                i + (endian === 'big' ? j : (size - j - 1))
            ]);
        }

        hex.push(chunk
            .map(function (c) {
                return (c < 16 ? '0' : '') + c.toString(16);
            })
            .join('')
        );
    }

    return BigNum(hex.join(''), 16);
};

BigNum.prototype.toBuffer = function (opts) {
    if (typeof opts === 'string') {
        if (opts !== 'mpint') return 'Unsupported Buffer representation';

        var abs = this.abs();
        var buf = abs.toBuffer({ size : 1, endian : 'big' });
        var len = buf.length === 1 && buf[0] === 0 ? 0 : buf.length;
        if (buf[0] & 0x80) len ++;

        var ret = new Buffer(4 + len);
        if (len > 0) buf.copy(ret, 4 + (buf[0] & 0x80 ? 1 : 0));
        if (buf[0] & 0x80) ret[4] = 0;

        ret[0] = len & (0xff << 24);
        ret[1] = len & (0xff << 16);
        ret[2] = len & (0xff << 8);
        ret[3] = len & (0xff << 0);

        // two's compliment for negative integers:
        var isNeg = this.lt(0);
        if (isNeg) {
            for (var i = 4; i < ret.length; i++) {
                ret[i] = 0xff - ret[i];
            }
        }
        ret[4] = (ret[4] & 0x7f) | (isNeg ? 0x80 : 0);
        if (isNeg) ret[ret.length - 1] ++;

        return ret;
    }

    if (!opts) opts = {};

    var endian = { 1 : 'big', '-1' : 'little' }[opts.endian]
        || opts.endian || 'big'
    ;

    var hex = this.toString(16);
    if (hex.charAt(0) === '-') throw new Error(
        'converting negative numbers to Buffers not supported yet'
    );

    var size = opts.size === 'auto' ? Math.ceil(hex.length / 2) : (opts.size || 1);

    var len = Math.ceil(hex.length / (2 * size)) * size;
    var buf = new Buffer(len);

    // zero-pad the hex string so the chunks are all `size` long
    while (hex.length < 2 * len) hex = '0' + hex;

    var hx = hex
        .split(new RegExp('(.{' + (2 * size) + '})'))
        .filter(function (s) { return s.length > 0 })
    ;

    hx.forEach(function (chunk, i) {
        for (var j = 0; j < size; j++) {
            var ix = i * size + (endian === 'big' ? j : size - j - 1);
            buf[ix] = parseInt(chunk.slice(j*2,j*2+2), 16);
        }
    });

    return buf;
};

Object.keys(BigNum.prototype).forEach(function (name) {
    if (name === 'inspect' || name === 'toString') return;

    BigNum[name] = function (num) {
        var args = [].slice.call(arguments, 1);

        if (num instanceof BigNum) {
            return num[name].apply(num, args);
        }
        else {
            var bigi = BigNum(num);
            return bigi[name].apply(bigi, args);
        }
    };
});

}).call(this,require("buffer").Buffer)
},{"buffer":"VTj7jY"}],"4U1mNF":[function(require,module,exports){
/*!
 * Cookies.js - 0.4.0
 *
 * Copyright (c) 2014, Scott Hamper
 * Licensed under the MIT license,
 * http://www.opensource.org/licenses/MIT
 */
(function (undefined) {
    'use strict';

    var Cookies = function (key, value, options) {
        return arguments.length === 1 ?
            Cookies.get(key) : Cookies.set(key, value, options);
    };

    // Allows for setter injection in unit tests
    Cookies._document = document;
    Cookies._navigator = navigator;

    Cookies.defaults = {
        path: '/'
    };

    Cookies.get = function (key) {
        if (Cookies._cachedDocumentCookie !== Cookies._document.cookie) {
            Cookies._renewCache();
        }

        return Cookies._cache[key];
    };

    Cookies.set = function (key, value, options) {
        options = Cookies._getExtendedOptions(options);
        options.expires = Cookies._getExpiresDate(value === undefined ? -1 : options.expires);

        Cookies._document.cookie = Cookies._generateCookieString(key, value, options);

        return Cookies;
    };

    Cookies.expire = function (key, options) {
        return Cookies.set(key, undefined, options);
    };

    Cookies._getExtendedOptions = function (options) {
        return {
            path: options && options.path || Cookies.defaults.path,
            domain: options && options.domain || Cookies.defaults.domain,
            expires: options && options.expires || Cookies.defaults.expires,
            secure: options && options.secure !== undefined ?  options.secure : Cookies.defaults.secure
        };
    };

    Cookies._isValidDate = function (date) {
        return Object.prototype.toString.call(date) === '[object Date]' && !isNaN(date.getTime());
    };

    Cookies._getExpiresDate = function (expires, now) {
        now = now || new Date();
        switch (typeof expires) {
            case 'number': expires = new Date(now.getTime() + expires * 1000); break;
            case 'string': expires = new Date(expires); break;
        }

        if (expires && !Cookies._isValidDate(expires)) {
            throw new Error('`expires` parameter cannot be converted to a valid Date instance');
        }

        return expires;
    };

    Cookies._generateCookieString = function (key, value, options) {
        key = key.replace(/[^#$&+\^`|]/g, encodeURIComponent);
        key = key.replace(/\(/g, '%28').replace(/\)/g, '%29');
        value = (value + '').replace(/[^!#$&-+\--:<-\[\]-~]/g, encodeURIComponent);
        options = options || {};

        var cookieString = key + '=' + value;
        cookieString += options.path ? ';path=' + options.path : '';
        cookieString += options.domain ? ';domain=' + options.domain : '';
        cookieString += options.expires ? ';expires=' + options.expires.toUTCString() : '';
        cookieString += options.secure ? ';secure' : '';

        return cookieString;
    };

    Cookies._getCookieObjectFromString = function (documentCookie) {
        var cookieObject = {};
        var cookiesArray = documentCookie ? documentCookie.split('; ') : [];

        for (var i = 0; i < cookiesArray.length; i++) {
            var cookieKvp = Cookies._getKeyValuePairFromCookieString(cookiesArray[i]);

            if (cookieObject[cookieKvp.key] === undefined) {
                cookieObject[cookieKvp.key] = cookieKvp.value;
            }
        }

        return cookieObject;
    };

    Cookies._getKeyValuePairFromCookieString = function (cookieString) {
        // "=" is a valid character in a cookie value according to RFC6265, so cannot `split('=')`
        var separatorIndex = cookieString.indexOf('=');

        // IE omits the "=" when the cookie value is an empty string
        separatorIndex = separatorIndex < 0 ? cookieString.length : separatorIndex;

        return {
            key: decodeURIComponent(cookieString.substr(0, separatorIndex)),
            value: decodeURIComponent(cookieString.substr(separatorIndex + 1))
        };
    };

    Cookies._renewCache = function () {
        Cookies._cache = Cookies._getCookieObjectFromString(Cookies._document.cookie);
        Cookies._cachedDocumentCookie = Cookies._document.cookie;
    };

    Cookies._areEnabled = function () {
        var testKey = 'cookies.js';
        var areEnabled = Cookies.set(testKey, 1).get(testKey) === '1';
        Cookies.expire(testKey);
        return areEnabled;
    };

    Cookies.enabled = Cookies._areEnabled();

    // AMD support
    if (typeof define === 'function' && define.amd) {
        define(function () { return Cookies; });
    // CommonJS and Node.js module support.
    } else if (typeof exports !== 'undefined') {
        // Support Node.js specific `module.exports` (which can be a function)
        if (typeof module !== 'undefined' && module.exports) {
            exports = module.exports = Cookies;
        }
        // But always support CommonJS module 1.1.1 spec (`exports` cannot be a function)
        exports.Cookies = Cookies;
    } else {
        window.Cookies = Cookies;
    }
})();
},{}],"cookies-js":[function(require,module,exports){
module.exports=require('4U1mNF');
},{}],17:[function(require,module,exports){
(function (process){
try {
  navigator.appName;
} catch(e) {
  if (typeof(process) !== 'undefined') {
    navigator = {};
  } else {
    throw e;
  }
};

// Copyright (c) 2005  Tom Wu
// All Rights Reserved.
// See "LICENSE" for details.

// Basic JavaScript BN library - subset useful for RSA encryption.

// Bits per digit
var dbits;

// JavaScript engine analysis
var canary = 0xdeadbeefcafe;
var j_lm = ((canary&0xffffff)==0xefcafe);

// (public) Constructor
function BigInteger(a,b,c) {
  if(a != null)
    if("number" == typeof a) this.fromNumber(a,b,c);
    else if(b == null && "string" != typeof a) this.fromString(a,256);
    else this.fromString(a,b);
}

// return new, unset BigInteger
function nbi() { return new BigInteger(null); }

// am: Compute w_j += (x*this_i), propagate carries,
// c is initial carry, returns final carry.
// c < 3*dvalue, x < 2*dvalue, this_i < dvalue
// We need to select the fastest one that works in this environment.

// am1: use a single mult and divide to get the high bits,
// max digit bits should be 26 because
// max internal value = 2*dvalue^2-2*dvalue (< 2^53)
function am1(i,x,w,j,c,n) {
  while(--n >= 0) {
    var v = x*this[i++]+w[j]+c;
    c = Math.floor(v/0x4000000);
    w[j++] = v&0x3ffffff;
  }
  return c;
}
// am2 avoids a big mult-and-extract completely.
// Max digit bits should be <= 30 because we do bitwise ops
// on values up to 2*hdvalue^2-hdvalue-1 (< 2^31)
function am2(i,x,w,j,c,n) {
  var xl = x&0x7fff, xh = x>>15;
  while(--n >= 0) {
    var l = this[i]&0x7fff;
    var h = this[i++]>>15;
    var m = xh*l+h*xl;
    l = xl*l+((m&0x7fff)<<15)+w[j]+(c&0x3fffffff);
    c = (l>>>30)+(m>>>15)+xh*h+(c>>>30);
    w[j++] = l&0x3fffffff;
  }
  return c;
}
// Alternately, set max digit bits to 28 since some
// browsers slow down when dealing with 32-bit numbers.
function am3(i,x,w,j,c,n) {
  var xl = x&0x3fff, xh = x>>14;
  while(--n >= 0) {
    var l = this[i]&0x3fff;
    var h = this[i++]>>14;
    var m = xh*l+h*xl;
    l = xl*l+((m&0x3fff)<<14)+w[j]+c;
    c = (l>>28)+(m>>14)+xh*h;
    w[j++] = l&0xfffffff;
  }
  return c;
}
if(j_lm && (navigator.appName == "Microsoft Internet Explorer")) {
  BigInteger.prototype.am = am2;
  dbits = 30;
}
else if(j_lm && (navigator.appName != "Netscape")) {
  BigInteger.prototype.am = am1;
  dbits = 26;
}
else { // Mozilla/Netscape seems to prefer am3
  BigInteger.prototype.am = am3;
  dbits = 28;
}

BigInteger.prototype.DB = dbits;
BigInteger.prototype.DM = ((1<<dbits)-1);
BigInteger.prototype.DV = (1<<dbits);

var BI_FP = 52;
BigInteger.prototype.FV = Math.pow(2,BI_FP);
BigInteger.prototype.F1 = BI_FP-dbits;
BigInteger.prototype.F2 = 2*dbits-BI_FP;

// Digit conversions
var BI_RM = "0123456789abcdefghijklmnopqrstuvwxyz";
var BI_RC = new Array();
var rr,vv;
rr = "0".charCodeAt(0);
for(vv = 0; vv <= 9; ++vv) BI_RC[rr++] = vv;
rr = "a".charCodeAt(0);
for(vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;
rr = "A".charCodeAt(0);
for(vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;

function int2char(n) { return BI_RM.charAt(n); }
function intAt(s,i) {
  var c = BI_RC[s.charCodeAt(i)];
  return (c==null)?-1:c;
}

// (protected) copy this to r
function bnpCopyTo(r) {
  for(var i = this.t-1; i >= 0; --i) r[i] = this[i];
  r.t = this.t;
  r.s = this.s;
}

// (protected) set from integer value x, -DV <= x < DV
function bnpFromInt(x) {
  this.t = 1;
  this.s = (x<0)?-1:0;
  if(x > 0) this[0] = x;
  else if(x < -1) this[0] = x+this.DV;
  else this.t = 0;
}

// return bigint initialized to value
function nbv(i) { var r = nbi(); r.fromInt(i); return r; }

// (protected) set from string and radix
function bnpFromString(s,b) {
  var k;
  if(b == 16) k = 4;
  else if(b == 8) k = 3;
  else if(b == 256) k = 8; // byte array
  else if(b == 2) k = 1;
  else if(b == 32) k = 5;
  else if(b == 4) k = 2;
  else { this.fromRadix(s,b); return; }
  this.t = 0;
  this.s = 0;
  var i = s.length, mi = false, sh = 0;
  while(--i >= 0) {
    var x = (k==8)?s[i]&0xff:intAt(s,i);
    if(x < 0) {
      if(s.charAt(i) == "-") mi = true;
      continue;
    }
    mi = false;
    if(sh == 0)
      this[this.t++] = x;
    else if(sh+k > this.DB) {
      this[this.t-1] |= (x&((1<<(this.DB-sh))-1))<<sh;
      this[this.t++] = (x>>(this.DB-sh));
    }
    else
      this[this.t-1] |= x<<sh;
    sh += k;
    if(sh >= this.DB) sh -= this.DB;
  }
  if(k == 8 && (s[0]&0x80) != 0) {
    this.s = -1;
    if(sh > 0) this[this.t-1] |= ((1<<(this.DB-sh))-1)<<sh;
  }
  this.clamp();
  if(mi) BigInteger.ZERO.subTo(this,this);
}

// (protected) clamp off excess high words
function bnpClamp() {
  var c = this.s&this.DM;
  while(this.t > 0 && this[this.t-1] == c) --this.t;
}

// (public) return string representation in given radix
function bnToString(b) {
  if(this.s < 0) return "-"+this.negate().toString(b);
  var k;
  if(b == 16) k = 4;
  else if(b == 8) k = 3;
  else if(b == 2) k = 1;
  else if(b == 32) k = 5;
  else if(b == 4) k = 2;
  else return this.toRadix(b);
  var km = (1<<k)-1, d, m = false, r = "", i = this.t;
  var p = this.DB-(i*this.DB)%k;
  if(i-- > 0) {
    if(p < this.DB && (d = this[i]>>p) > 0) { m = true; r = int2char(d); }
    while(i >= 0) {
      if(p < k) {
        d = (this[i]&((1<<p)-1))<<(k-p);
        d |= this[--i]>>(p+=this.DB-k);
      }
      else {
        d = (this[i]>>(p-=k))&km;
        if(p <= 0) { p += this.DB; --i; }
      }
      if(d > 0) m = true;
      if(m) r += int2char(d);
    }
  }
  return m?r:"0";
}

// (public) -this
function bnNegate() { var r = nbi(); BigInteger.ZERO.subTo(this,r); return r; }

// (public) |this|
function bnAbs() { return (this.s<0)?this.negate():this; }

// (public) return + if this > a, - if this < a, 0 if equal
function bnCompareTo(a) {
  var r = this.s-a.s;
  if(r != 0) return r;
  var i = this.t;
  r = i-a.t;
  if(r != 0) return (this.s<0)?-r:r;
  while(--i >= 0) if((r=this[i]-a[i]) != 0) return r;
  return 0;
}

// returns bit length of the integer x
function nbits(x) {
  var r = 1, t;
  if((t=x>>>16) != 0) { x = t; r += 16; }
  if((t=x>>8) != 0) { x = t; r += 8; }
  if((t=x>>4) != 0) { x = t; r += 4; }
  if((t=x>>2) != 0) { x = t; r += 2; }
  if((t=x>>1) != 0) { x = t; r += 1; }
  return r;
}

// (public) return the number of bits in "this"
function bnBitLength() {
  if(this.t <= 0) return 0;
  return this.DB*(this.t-1)+nbits(this[this.t-1]^(this.s&this.DM));
}

// (protected) r = this << n*DB
function bnpDLShiftTo(n,r) {
  var i;
  for(i = this.t-1; i >= 0; --i) r[i+n] = this[i];
  for(i = n-1; i >= 0; --i) r[i] = 0;
  r.t = this.t+n;
  r.s = this.s;
}

// (protected) r = this >> n*DB
function bnpDRShiftTo(n,r) {
  for(var i = n; i < this.t; ++i) r[i-n] = this[i];
  r.t = Math.max(this.t-n,0);
  r.s = this.s;
}

// (protected) r = this << n
function bnpLShiftTo(n,r) {
  var bs = n%this.DB;
  var cbs = this.DB-bs;
  var bm = (1<<cbs)-1;
  var ds = Math.floor(n/this.DB), c = (this.s<<bs)&this.DM, i;
  for(i = this.t-1; i >= 0; --i) {
    r[i+ds+1] = (this[i]>>cbs)|c;
    c = (this[i]&bm)<<bs;
  }
  for(i = ds-1; i >= 0; --i) r[i] = 0;
  r[ds] = c;
  r.t = this.t+ds+1;
  r.s = this.s;
  r.clamp();
}

// (protected) r = this >> n
function bnpRShiftTo(n,r) {
  r.s = this.s;
  var ds = Math.floor(n/this.DB);
  if(ds >= this.t) { r.t = 0; return; }
  var bs = n%this.DB;
  var cbs = this.DB-bs;
  var bm = (1<<bs)-1;
  r[0] = this[ds]>>bs;
  for(var i = ds+1; i < this.t; ++i) {
    r[i-ds-1] |= (this[i]&bm)<<cbs;
    r[i-ds] = this[i]>>bs;
  }
  if(bs > 0) r[this.t-ds-1] |= (this.s&bm)<<cbs;
  r.t = this.t-ds;
  r.clamp();
}

// (protected) r = this - a
function bnpSubTo(a,r) {
  var i = 0, c = 0, m = Math.min(a.t,this.t);
  while(i < m) {
    c += this[i]-a[i];
    r[i++] = c&this.DM;
    c >>= this.DB;
  }
  if(a.t < this.t) {
    c -= a.s;
    while(i < this.t) {
      c += this[i];
      r[i++] = c&this.DM;
      c >>= this.DB;
    }
    c += this.s;
  }
  else {
    c += this.s;
    while(i < a.t) {
      c -= a[i];
      r[i++] = c&this.DM;
      c >>= this.DB;
    }
    c -= a.s;
  }
  r.s = (c<0)?-1:0;
  if(c < -1) r[i++] = this.DV+c;
  else if(c > 0) r[i++] = c;
  r.t = i;
  r.clamp();
}

// (protected) r = this * a, r != this,a (HAC 14.12)
// "this" should be the larger one if appropriate.
function bnpMultiplyTo(a,r) {
  var x = this.abs(), y = a.abs();
  var i = x.t;
  r.t = i+y.t;
  while(--i >= 0) r[i] = 0;
  for(i = 0; i < y.t; ++i) r[i+x.t] = x.am(0,y[i],r,i,0,x.t);
  r.s = 0;
  r.clamp();
  if(this.s != a.s) BigInteger.ZERO.subTo(r,r);
}

// (protected) r = this^2, r != this (HAC 14.16)
function bnpSquareTo(r) {
  var x = this.abs();
  var i = r.t = 2*x.t;
  while(--i >= 0) r[i] = 0;
  for(i = 0; i < x.t-1; ++i) {
    var c = x.am(i,x[i],r,2*i,0,1);
    if((r[i+x.t]+=x.am(i+1,2*x[i],r,2*i+1,c,x.t-i-1)) >= x.DV) {
      r[i+x.t] -= x.DV;
      r[i+x.t+1] = 1;
    }
  }
  if(r.t > 0) r[r.t-1] += x.am(i,x[i],r,2*i,0,1);
  r.s = 0;
  r.clamp();
}

// (protected) divide this by m, quotient and remainder to q, r (HAC 14.20)
// r != q, this != m.  q or r may be null.
function bnpDivRemTo(m,q,r) {
  var pm = m.abs();
  if(pm.t <= 0) return;
  var pt = this.abs();
  if(pt.t < pm.t) {
    if(q != null) q.fromInt(0);
    if(r != null) this.copyTo(r);
    return;
  }
  if(r == null) r = nbi();
  var y = nbi(), ts = this.s, ms = m.s;
  var nsh = this.DB-nbits(pm[pm.t-1]);	// normalize modulus
  if(nsh > 0) { pm.lShiftTo(nsh,y); pt.lShiftTo(nsh,r); }
  else { pm.copyTo(y); pt.copyTo(r); }
  var ys = y.t;
  var y0 = y[ys-1];
  if(y0 == 0) return;
  var yt = y0*(1<<this.F1)+((ys>1)?y[ys-2]>>this.F2:0);
  var d1 = this.FV/yt, d2 = (1<<this.F1)/yt, e = 1<<this.F2;
  var i = r.t, j = i-ys, t = (q==null)?nbi():q;
  y.dlShiftTo(j,t);
  if(r.compareTo(t) >= 0) {
    r[r.t++] = 1;
    r.subTo(t,r);
  }
  BigInteger.ONE.dlShiftTo(ys,t);
  t.subTo(y,y);	// "negative" y so we can replace sub with am later
  while(y.t < ys) y[y.t++] = 0;
  while(--j >= 0) {
    // Estimate quotient digit
    var qd = (r[--i]==y0)?this.DM:Math.floor(r[i]*d1+(r[i-1]+e)*d2);
    if((r[i]+=y.am(0,qd,r,j,0,ys)) < qd) {	// Try it out
      y.dlShiftTo(j,t);
      r.subTo(t,r);
      while(r[i] < --qd) r.subTo(t,r);
    }
  }
  if(q != null) {
    r.drShiftTo(ys,q);
    if(ts != ms) BigInteger.ZERO.subTo(q,q);
  }
  r.t = ys;
  r.clamp();
  if(nsh > 0) r.rShiftTo(nsh,r);	// Denormalize remainder
  if(ts < 0) BigInteger.ZERO.subTo(r,r);
}

// (public) this mod a
function bnMod(a) {
  var r = nbi();
  this.abs().divRemTo(a,null,r);
  if(this.s < 0 && r.compareTo(BigInteger.ZERO) > 0) a.subTo(r,r);
  return r;
}

// Modular reduction using "classic" algorithm
function Classic(m) { this.m = m; }
function cConvert(x) {
  if(x.s < 0 || x.compareTo(this.m) >= 0) return x.mod(this.m);
  else return x;
}
function cRevert(x) { return x; }
function cReduce(x) { x.divRemTo(this.m,null,x); }
function cMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }
function cSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

Classic.prototype.convert = cConvert;
Classic.prototype.revert = cRevert;
Classic.prototype.reduce = cReduce;
Classic.prototype.mulTo = cMulTo;
Classic.prototype.sqrTo = cSqrTo;

// (protected) return "-1/this % 2^DB"; useful for Mont. reduction
// justification:
//         xy == 1 (mod m)
//         xy =  1+km
//   xy(2-xy) = (1+km)(1-km)
// x[y(2-xy)] = 1-k^2m^2
// x[y(2-xy)] == 1 (mod m^2)
// if y is 1/x mod m, then y(2-xy) is 1/x mod m^2
// should reduce x and y(2-xy) by m^2 at each step to keep size bounded.
// JS multiply "overflows" differently from C/C++, so care is needed here.
function bnpInvDigit() {
  if(this.t < 1) return 0;
  var x = this[0];
  if((x&1) == 0) return 0;
  var y = x&3;		// y == 1/x mod 2^2
  y = (y*(2-(x&0xf)*y))&0xf;	// y == 1/x mod 2^4
  y = (y*(2-(x&0xff)*y))&0xff;	// y == 1/x mod 2^8
  y = (y*(2-(((x&0xffff)*y)&0xffff)))&0xffff;	// y == 1/x mod 2^16
  // last step - calculate inverse mod DV directly;
  // assumes 16 < DB <= 32 and assumes ability to handle 48-bit ints
  y = (y*(2-x*y%this.DV))%this.DV;		// y == 1/x mod 2^dbits
  // we really want the negative inverse, and -DV < y < DV
  return (y>0)?this.DV-y:-y;
}

// Montgomery reduction
function Montgomery(m) {
  this.m = m;
  this.mp = m.invDigit();
  this.mpl = this.mp&0x7fff;
  this.mph = this.mp>>15;
  this.um = (1<<(m.DB-15))-1;
  this.mt2 = 2*m.t;
}

// xR mod m
function montConvert(x) {
  var r = nbi();
  x.abs().dlShiftTo(this.m.t,r);
  r.divRemTo(this.m,null,r);
  if(x.s < 0 && r.compareTo(BigInteger.ZERO) > 0) this.m.subTo(r,r);
  return r;
}

// x/R mod m
function montRevert(x) {
  var r = nbi();
  x.copyTo(r);
  this.reduce(r);
  return r;
}

// x = x/R mod m (HAC 14.32)
function montReduce(x) {
  while(x.t <= this.mt2)	// pad x so am has enough room later
    x[x.t++] = 0;
  for(var i = 0; i < this.m.t; ++i) {
    // faster way of calculating u0 = x[i]*mp mod DV
    var j = x[i]&0x7fff;
    var u0 = (j*this.mpl+(((j*this.mph+(x[i]>>15)*this.mpl)&this.um)<<15))&x.DM;
    // use am to combine the multiply-shift-add into one call
    j = i+this.m.t;
    x[j] += this.m.am(0,u0,x,i,0,this.m.t);
    // propagate carry
    while(x[j] >= x.DV) { x[j] -= x.DV; x[++j]++; }
  }
  x.clamp();
  x.drShiftTo(this.m.t,x);
  if(x.compareTo(this.m) >= 0) x.subTo(this.m,x);
}

// r = "x^2/R mod m"; x != r
function montSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

// r = "xy/R mod m"; x,y != r
function montMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }

Montgomery.prototype.convert = montConvert;
Montgomery.prototype.revert = montRevert;
Montgomery.prototype.reduce = montReduce;
Montgomery.prototype.mulTo = montMulTo;
Montgomery.prototype.sqrTo = montSqrTo;

// (protected) true iff this is even
function bnpIsEven() { return ((this.t>0)?(this[0]&1):this.s) == 0; }

// (protected) this^e, e < 2^32, doing sqr and mul with "r" (HAC 14.79)
function bnpExp(e,z) {
  if(e > 0xffffffff || e < 1) return BigInteger.ONE;
  var r = nbi(), r2 = nbi(), g = z.convert(this), i = nbits(e)-1;
  g.copyTo(r);
  while(--i >= 0) {
    z.sqrTo(r,r2);
    if((e&(1<<i)) > 0) z.mulTo(r2,g,r);
    else { var t = r; r = r2; r2 = t; }
  }
  return z.revert(r);
}

// (public) this^e % m, 0 <= e < 2^32
function bnModPowInt(e,m) {
  var z;
  if(e < 256 || m.isEven()) z = new Classic(m); else z = new Montgomery(m);
  return this.exp(e,z);
}

// protected
BigInteger.prototype.copyTo = bnpCopyTo;
BigInteger.prototype.fromInt = bnpFromInt;
BigInteger.prototype.fromString = bnpFromString;
BigInteger.prototype.clamp = bnpClamp;
BigInteger.prototype.dlShiftTo = bnpDLShiftTo;
BigInteger.prototype.drShiftTo = bnpDRShiftTo;
BigInteger.prototype.lShiftTo = bnpLShiftTo;
BigInteger.prototype.rShiftTo = bnpRShiftTo;
BigInteger.prototype.subTo = bnpSubTo;
BigInteger.prototype.multiplyTo = bnpMultiplyTo;
BigInteger.prototype.squareTo = bnpSquareTo;
BigInteger.prototype.divRemTo = bnpDivRemTo;
BigInteger.prototype.invDigit = bnpInvDigit;
BigInteger.prototype.isEven = bnpIsEven;
BigInteger.prototype.exp = bnpExp;

// public
BigInteger.prototype.toString = bnToString;
BigInteger.prototype.negate = bnNegate;
BigInteger.prototype.abs = bnAbs;
BigInteger.prototype.compareTo = bnCompareTo;
BigInteger.prototype.bitLength = bnBitLength;
BigInteger.prototype.mod = bnMod;
BigInteger.prototype.modPowInt = bnModPowInt;

// "constants"
BigInteger.ZERO = nbv(0);
BigInteger.ONE = nbv(1);
// Copyright (c) 2005-2009  Tom Wu
// All Rights Reserved.
// See "LICENSE" for details.

// Extended JavaScript BN functions, required for RSA private ops.

// Version 1.1: new BigInteger("0", 10) returns "proper" zero
// Version 1.2: square() API, isProbablePrime fix

// (public)
function bnClone() { var r = nbi(); this.copyTo(r); return r; }

// (public) return value as integer
function bnIntValue() {
  if(this.s < 0) {
    if(this.t == 1) return this[0]-this.DV;
    else if(this.t == 0) return -1;
  }
  else if(this.t == 1) return this[0];
  else if(this.t == 0) return 0;
  // assumes 16 < DB < 32
  return ((this[1]&((1<<(32-this.DB))-1))<<this.DB)|this[0];
}

// (public) return value as byte
function bnByteValue() { return (this.t==0)?this.s:(this[0]<<24)>>24; }

// (public) return value as short (assumes DB>=16)
function bnShortValue() { return (this.t==0)?this.s:(this[0]<<16)>>16; }

// (protected) return x s.t. r^x < DV
function bnpChunkSize(r) { return Math.floor(Math.LN2*this.DB/Math.log(r)); }

// (public) 0 if this == 0, 1 if this > 0
function bnSigNum() {
  if(this.s < 0) return -1;
  else if(this.t <= 0 || (this.t == 1 && this[0] <= 0)) return 0;
  else return 1;
}

// (protected) convert to radix string
function bnpToRadix(b) {
  if(b == null) b = 10;
  if(this.signum() == 0 || b < 2 || b > 36) return "0";
  var cs = this.chunkSize(b);
  var a = Math.pow(b,cs);
  var d = nbv(a), y = nbi(), z = nbi(), r = "";
  this.divRemTo(d,y,z);
  while(y.signum() > 0) {
    r = (a+z.intValue()).toString(b).substr(1) + r;
    y.divRemTo(d,y,z);
  }
  return z.intValue().toString(b) + r;
}

// (protected) convert from radix string
function bnpFromRadix(s,b) {
  this.fromInt(0);
  if(b == null) b = 10;
  var cs = this.chunkSize(b);
  var d = Math.pow(b,cs), mi = false, j = 0, w = 0;
  for(var i = 0; i < s.length; ++i) {
    var x = intAt(s,i);
    if(x < 0) {
      if(s.charAt(i) == "-" && this.signum() == 0) mi = true;
      continue;
    }
    w = b*w+x;
    if(++j >= cs) {
      this.dMultiply(d);
      this.dAddOffset(w,0);
      j = 0;
      w = 0;
    }
  }
  if(j > 0) {
    this.dMultiply(Math.pow(b,j));
    this.dAddOffset(w,0);
  }
  if(mi) BigInteger.ZERO.subTo(this,this);
}

// (protected) alternate constructor
function bnpFromNumber(a,b,c) {
  if("number" == typeof b) {
    // new BigInteger(int,int,RNG)
    if(a < 2) this.fromInt(1);
    else {
      this.fromNumber(a,c);
      if(!this.testBit(a-1))	// force MSB set
        this.bitwiseTo(BigInteger.ONE.shiftLeft(a-1),op_or,this);
      if(this.isEven()) this.dAddOffset(1,0); // force odd
      while(!this.isProbablePrime(b)) {
        this.dAddOffset(2,0);
        if(this.bitLength() > a) this.subTo(BigInteger.ONE.shiftLeft(a-1),this);
      }
    }
  }
  else {
    // new BigInteger(int,RNG)
    var x = new Array(), t = a&7;
    x.length = (a>>3)+1;
    b.nextBytes(x);
    if(t > 0) x[0] &= ((1<<t)-1); else x[0] = 0;
    this.fromString(x,256);
  }
}

// (public) convert to bigendian byte array
function bnToByteArray() {
  var i = this.t, r = new Array();
  r[0] = this.s;
  var p = this.DB-(i*this.DB)%8, d, k = 0;
  if(i-- > 0) {
    if(p < this.DB && (d = this[i]>>p) != (this.s&this.DM)>>p)
      r[k++] = d|(this.s<<(this.DB-p));
    while(i >= 0) {
      if(p < 8) {
        d = (this[i]&((1<<p)-1))<<(8-p);
        d |= this[--i]>>(p+=this.DB-8);
      }
      else {
        d = (this[i]>>(p-=8))&0xff;
        if(p <= 0) { p += this.DB; --i; }
      }
      if((d&0x80) != 0) d |= -256;
      if(k == 0 && (this.s&0x80) != (d&0x80)) ++k;
      if(k > 0 || d != this.s) r[k++] = d;
    }
  }
  return r;
}

function bnEquals(a) { return(this.compareTo(a)==0); }
function bnMin(a) { return(this.compareTo(a)<0)?this:a; }
function bnMax(a) { return(this.compareTo(a)>0)?this:a; }

// (protected) r = this op a (bitwise)
function bnpBitwiseTo(a,op,r) {
  var i, f, m = Math.min(a.t,this.t);
  for(i = 0; i < m; ++i) r[i] = op(this[i],a[i]);
  if(a.t < this.t) {
    f = a.s&this.DM;
    for(i = m; i < this.t; ++i) r[i] = op(this[i],f);
    r.t = this.t;
  }
  else {
    f = this.s&this.DM;
    for(i = m; i < a.t; ++i) r[i] = op(f,a[i]);
    r.t = a.t;
  }
  r.s = op(this.s,a.s);
  r.clamp();
}

// (public) this & a
function op_and(x,y) { return x&y; }
function bnAnd(a) { var r = nbi(); this.bitwiseTo(a,op_and,r); return r; }

// (public) this | a
function op_or(x,y) { return x|y; }
function bnOr(a) { var r = nbi(); this.bitwiseTo(a,op_or,r); return r; }

// (public) this ^ a
function op_xor(x,y) { return x^y; }
function bnXor(a) { var r = nbi(); this.bitwiseTo(a,op_xor,r); return r; }

// (public) this & ~a
function op_andnot(x,y) { return x&~y; }
function bnAndNot(a) { var r = nbi(); this.bitwiseTo(a,op_andnot,r); return r; }

// (public) ~this
function bnNot() {
  var r = nbi();
  for(var i = 0; i < this.t; ++i) r[i] = this.DM&~this[i];
  r.t = this.t;
  r.s = ~this.s;
  return r;
}

// (public) this << n
function bnShiftLeft(n) {
  var r = nbi();
  if(n < 0) this.rShiftTo(-n,r); else this.lShiftTo(n,r);
  return r;
}

// (public) this >> n
function bnShiftRight(n) {
  var r = nbi();
  if(n < 0) this.lShiftTo(-n,r); else this.rShiftTo(n,r);
  return r;
}

// return index of lowest 1-bit in x, x < 2^31
function lbit(x) {
  if(x == 0) return -1;
  var r = 0;
  if((x&0xffff) == 0) { x >>= 16; r += 16; }
  if((x&0xff) == 0) { x >>= 8; r += 8; }
  if((x&0xf) == 0) { x >>= 4; r += 4; }
  if((x&3) == 0) { x >>= 2; r += 2; }
  if((x&1) == 0) ++r;
  return r;
}

// (public) returns index of lowest 1-bit (or -1 if none)
function bnGetLowestSetBit() {
  for(var i = 0; i < this.t; ++i)
    if(this[i] != 0) return i*this.DB+lbit(this[i]);
  if(this.s < 0) return this.t*this.DB;
  return -1;
}

// return number of 1 bits in x
function cbit(x) {
  var r = 0;
  while(x != 0) { x &= x-1; ++r; }
  return r;
}

// (public) return number of set bits
function bnBitCount() {
  var r = 0, x = this.s&this.DM;
  for(var i = 0; i < this.t; ++i) r += cbit(this[i]^x);
  return r;
}

// (public) true iff nth bit is set
function bnTestBit(n) {
  var j = Math.floor(n/this.DB);
  if(j >= this.t) return(this.s!=0);
  return((this[j]&(1<<(n%this.DB)))!=0);
}

// (protected) this op (1<<n)
function bnpChangeBit(n,op) {
  var r = BigInteger.ONE.shiftLeft(n);
  this.bitwiseTo(r,op,r);
  return r;
}

// (public) this | (1<<n)
function bnSetBit(n) { return this.changeBit(n,op_or); }

// (public) this & ~(1<<n)
function bnClearBit(n) { return this.changeBit(n,op_andnot); }

// (public) this ^ (1<<n)
function bnFlipBit(n) { return this.changeBit(n,op_xor); }

// (protected) r = this + a
function bnpAddTo(a,r) {
  var i = 0, c = 0, m = Math.min(a.t,this.t);
  while(i < m) {
    c += this[i]+a[i];
    r[i++] = c&this.DM;
    c >>= this.DB;
  }
  if(a.t < this.t) {
    c += a.s;
    while(i < this.t) {
      c += this[i];
      r[i++] = c&this.DM;
      c >>= this.DB;
    }
    c += this.s;
  }
  else {
    c += this.s;
    while(i < a.t) {
      c += a[i];
      r[i++] = c&this.DM;
      c >>= this.DB;
    }
    c += a.s;
  }
  r.s = (c<0)?-1:0;
  if(c > 0) r[i++] = c;
  else if(c < -1) r[i++] = this.DV+c;
  r.t = i;
  r.clamp();
}

// (public) this + a
function bnAdd(a) { var r = nbi(); this.addTo(a,r); return r; }

// (public) this - a
function bnSubtract(a) { var r = nbi(); this.subTo(a,r); return r; }

// (public) this * a
function bnMultiply(a) { var r = nbi(); this.multiplyTo(a,r); return r; }

// (public) this^2
function bnSquare() { var r = nbi(); this.squareTo(r); return r; }

// (public) this / a
function bnDivide(a) { var r = nbi(); this.divRemTo(a,r,null); return r; }

// (public) this % a
function bnRemainder(a) { var r = nbi(); this.divRemTo(a,null,r); return r; }

// (public) [this/a,this%a]
function bnDivideAndRemainder(a) {
  var q = nbi(), r = nbi();
  this.divRemTo(a,q,r);
  return new Array(q,r);
}

// (protected) this *= n, this >= 0, 1 < n < DV
function bnpDMultiply(n) {
  this[this.t] = this.am(0,n-1,this,0,0,this.t);
  ++this.t;
  this.clamp();
}

// (protected) this += n << w words, this >= 0
function bnpDAddOffset(n,w) {
  if(n == 0) return;
  while(this.t <= w) this[this.t++] = 0;
  this[w] += n;
  while(this[w] >= this.DV) {
    this[w] -= this.DV;
    if(++w >= this.t) this[this.t++] = 0;
    ++this[w];
  }
}

// A "null" reducer
function NullExp() {}
function nNop(x) { return x; }
function nMulTo(x,y,r) { x.multiplyTo(y,r); }
function nSqrTo(x,r) { x.squareTo(r); }

NullExp.prototype.convert = nNop;
NullExp.prototype.revert = nNop;
NullExp.prototype.mulTo = nMulTo;
NullExp.prototype.sqrTo = nSqrTo;

// (public) this^e
function bnPow(e) { return this.exp(e,new NullExp()); }

// (protected) r = lower n words of "this * a", a.t <= n
// "this" should be the larger one if appropriate.
function bnpMultiplyLowerTo(a,n,r) {
  var i = Math.min(this.t+a.t,n);
  r.s = 0; // assumes a,this >= 0
  r.t = i;
  while(i > 0) r[--i] = 0;
  var j;
  for(j = r.t-this.t; i < j; ++i) r[i+this.t] = this.am(0,a[i],r,i,0,this.t);
  for(j = Math.min(a.t,n); i < j; ++i) this.am(0,a[i],r,i,0,n-i);
  r.clamp();
}

// (protected) r = "this * a" without lower n words, n > 0
// "this" should be the larger one if appropriate.
function bnpMultiplyUpperTo(a,n,r) {
  --n;
  var i = r.t = this.t+a.t-n;
  r.s = 0; // assumes a,this >= 0
  while(--i >= 0) r[i] = 0;
  for(i = Math.max(n-this.t,0); i < a.t; ++i)
    r[this.t+i-n] = this.am(n-i,a[i],r,0,0,this.t+i-n);
  r.clamp();
  r.drShiftTo(1,r);
}

// Barrett modular reduction
function Barrett(m) {
  // setup Barrett
  this.r2 = nbi();
  this.q3 = nbi();
  BigInteger.ONE.dlShiftTo(2*m.t,this.r2);
  this.mu = this.r2.divide(m);
  this.m = m;
}

function barrettConvert(x) {
  if(x.s < 0 || x.t > 2*this.m.t) return x.mod(this.m);
  else if(x.compareTo(this.m) < 0) return x;
  else { var r = nbi(); x.copyTo(r); this.reduce(r); return r; }
}

function barrettRevert(x) { return x; }

// x = x mod m (HAC 14.42)
function barrettReduce(x) {
  x.drShiftTo(this.m.t-1,this.r2);
  if(x.t > this.m.t+1) { x.t = this.m.t+1; x.clamp(); }
  this.mu.multiplyUpperTo(this.r2,this.m.t+1,this.q3);
  this.m.multiplyLowerTo(this.q3,this.m.t+1,this.r2);
  while(x.compareTo(this.r2) < 0) x.dAddOffset(1,this.m.t+1);
  x.subTo(this.r2,x);
  while(x.compareTo(this.m) >= 0) x.subTo(this.m,x);
}

// r = x^2 mod m; x != r
function barrettSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

// r = x*y mod m; x,y != r
function barrettMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }

Barrett.prototype.convert = barrettConvert;
Barrett.prototype.revert = barrettRevert;
Barrett.prototype.reduce = barrettReduce;
Barrett.prototype.mulTo = barrettMulTo;
Barrett.prototype.sqrTo = barrettSqrTo;

// (public) this^e % m (HAC 14.85)
function bnModPow(e,m) {
  var i = e.bitLength(), k, r = nbv(1), z;
  if(i <= 0) return r;
  else if(i < 18) k = 1;
  else if(i < 48) k = 3;
  else if(i < 144) k = 4;
  else if(i < 768) k = 5;
  else k = 6;
  if(i < 8)
    z = new Classic(m);
  else if(m.isEven())
    z = new Barrett(m);
  else
    z = new Montgomery(m);

  // precomputation
  var g = new Array(), n = 3, k1 = k-1, km = (1<<k)-1;
  g[1] = z.convert(this);
  if(k > 1) {
    var g2 = nbi();
    z.sqrTo(g[1],g2);
    while(n <= km) {
      g[n] = nbi();
      z.mulTo(g2,g[n-2],g[n]);
      n += 2;
    }
  }

  var j = e.t-1, w, is1 = true, r2 = nbi(), t;
  i = nbits(e[j])-1;
  while(j >= 0) {
    if(i >= k1) w = (e[j]>>(i-k1))&km;
    else {
      w = (e[j]&((1<<(i+1))-1))<<(k1-i);
      if(j > 0) w |= e[j-1]>>(this.DB+i-k1);
    }

    n = k;
    while((w&1) == 0) { w >>= 1; --n; }
    if((i -= n) < 0) { i += this.DB; --j; }
    if(is1) {	// ret == 1, don't bother squaring or multiplying it
      g[w].copyTo(r);
      is1 = false;
    }
    else {
      while(n > 1) { z.sqrTo(r,r2); z.sqrTo(r2,r); n -= 2; }
      if(n > 0) z.sqrTo(r,r2); else { t = r; r = r2; r2 = t; }
      z.mulTo(r2,g[w],r);
    }

    while(j >= 0 && (e[j]&(1<<i)) == 0) {
      z.sqrTo(r,r2); t = r; r = r2; r2 = t;
      if(--i < 0) { i = this.DB-1; --j; }
    }
  }
  return z.revert(r);
}

// (public) gcd(this,a) (HAC 14.54)
function bnGCD(a) {
  var x = (this.s<0)?this.negate():this.clone();
  var y = (a.s<0)?a.negate():a.clone();
  if(x.compareTo(y) < 0) { var t = x; x = y; y = t; }
  var i = x.getLowestSetBit(), g = y.getLowestSetBit();
  if(g < 0) return x;
  if(i < g) g = i;
  if(g > 0) {
    x.rShiftTo(g,x);
    y.rShiftTo(g,y);
  }
  while(x.signum() > 0) {
    if((i = x.getLowestSetBit()) > 0) x.rShiftTo(i,x);
    if((i = y.getLowestSetBit()) > 0) y.rShiftTo(i,y);
    if(x.compareTo(y) >= 0) {
      x.subTo(y,x);
      x.rShiftTo(1,x);
    }
    else {
      y.subTo(x,y);
      y.rShiftTo(1,y);
    }
  }
  if(g > 0) y.lShiftTo(g,y);
  return y;
}

// (protected) this % n, n < 2^26
function bnpModInt(n) {
  if(n <= 0) return 0;
  var d = this.DV%n, r = (this.s<0)?n-1:0;
  if(this.t > 0)
    if(d == 0) r = this[0]%n;
    else for(var i = this.t-1; i >= 0; --i) r = (d*r+this[i])%n;
  return r;
}

// (public) 1/this % m (HAC 14.61)
function bnModInverse(m) {
  var ac = m.isEven();
  if((this.isEven() && ac) || m.signum() == 0) return BigInteger.ZERO;
  var u = m.clone(), v = this.clone();
  var a = nbv(1), b = nbv(0), c = nbv(0), d = nbv(1);
  while(u.signum() != 0) {
    while(u.isEven()) {
      u.rShiftTo(1,u);
      if(ac) {
        if(!a.isEven() || !b.isEven()) { a.addTo(this,a); b.subTo(m,b); }
        a.rShiftTo(1,a);
      }
      else if(!b.isEven()) b.subTo(m,b);
      b.rShiftTo(1,b);
    }
    while(v.isEven()) {
      v.rShiftTo(1,v);
      if(ac) {
        if(!c.isEven() || !d.isEven()) { c.addTo(this,c); d.subTo(m,d); }
        c.rShiftTo(1,c);
      }
      else if(!d.isEven()) d.subTo(m,d);
      d.rShiftTo(1,d);
    }
    if(u.compareTo(v) >= 0) {
      u.subTo(v,u);
      if(ac) a.subTo(c,a);
      b.subTo(d,b);
    }
    else {
      v.subTo(u,v);
      if(ac) c.subTo(a,c);
      d.subTo(b,d);
    }
  }
  if(v.compareTo(BigInteger.ONE) != 0) return BigInteger.ZERO;
  if(d.compareTo(m) >= 0) return d.subtract(m);
  if(d.signum() < 0) d.addTo(m,d); else return d;
  if(d.signum() < 0) return d.add(m); else return d;
}

var lowprimes = [2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97,101,103,107,109,113,127,131,137,139,149,151,157,163,167,173,179,181,191,193,197,199,211,223,227,229,233,239,241,251,257,263,269,271,277,281,283,293,307,311,313,317,331,337,347,349,353,359,367,373,379,383,389,397,401,409,419,421,431,433,439,443,449,457,461,463,467,479,487,491,499,503,509,521,523,541,547,557,563,569,571,577,587,593,599,601,607,613,617,619,631,641,643,647,653,659,661,673,677,683,691,701,709,719,727,733,739,743,751,757,761,769,773,787,797,809,811,821,823,827,829,839,853,857,859,863,877,881,883,887,907,911,919,929,937,941,947,953,967,971,977,983,991,997];
var lplim = (1<<26)/lowprimes[lowprimes.length-1];

// (public) test primality with certainty >= 1-.5^t
function bnIsProbablePrime(t) {
  var i, x = this.abs();
  if(x.t == 1 && x[0] <= lowprimes[lowprimes.length-1]) {
    for(i = 0; i < lowprimes.length; ++i)
      if(x[0] == lowprimes[i]) return true;
    return false;
  }
  if(x.isEven()) return false;
  i = 1;
  while(i < lowprimes.length) {
    var m = lowprimes[i], j = i+1;
    while(j < lowprimes.length && m < lplim) m *= lowprimes[j++];
    m = x.modInt(m);
    while(i < j) if(m%lowprimes[i++] == 0) return false;
  }
  return x.millerRabin(t);
}

// (protected) true if probably prime (HAC 4.24, Miller-Rabin)
function bnpMillerRabin(t) {
  var n1 = this.subtract(BigInteger.ONE);
  var k = n1.getLowestSetBit();
  if(k <= 0) return false;
  var r = n1.shiftRight(k);
  t = (t+1)>>1;
  if(t > lowprimes.length) t = lowprimes.length;
  var a = nbi();
  for(var i = 0; i < t; ++i) {
    //Pick bases at random, instead of starting at 2
    a.fromInt(lowprimes[Math.floor(Math.random()*lowprimes.length)]);
    var y = a.modPow(r,this);
    if(y.compareTo(BigInteger.ONE) != 0 && y.compareTo(n1) != 0) {
      var j = 1;
      while(j++ < k && y.compareTo(n1) != 0) {
        y = y.modPowInt(2,this);
        if(y.compareTo(BigInteger.ONE) == 0) return false;
      }
      if(y.compareTo(n1) != 0) return false;
    }
  }
  return true;
}

// protected
BigInteger.prototype.chunkSize = bnpChunkSize;
BigInteger.prototype.toRadix = bnpToRadix;
BigInteger.prototype.fromRadix = bnpFromRadix;
BigInteger.prototype.fromNumber = bnpFromNumber;
BigInteger.prototype.bitwiseTo = bnpBitwiseTo;
BigInteger.prototype.changeBit = bnpChangeBit;
BigInteger.prototype.addTo = bnpAddTo;
BigInteger.prototype.dMultiply = bnpDMultiply;
BigInteger.prototype.dAddOffset = bnpDAddOffset;
BigInteger.prototype.multiplyLowerTo = bnpMultiplyLowerTo;
BigInteger.prototype.multiplyUpperTo = bnpMultiplyUpperTo;
BigInteger.prototype.modInt = bnpModInt;
BigInteger.prototype.millerRabin = bnpMillerRabin;

// public
BigInteger.prototype.clone = bnClone;
BigInteger.prototype.intValue = bnIntValue;
BigInteger.prototype.byteValue = bnByteValue;
BigInteger.prototype.shortValue = bnShortValue;
BigInteger.prototype.signum = bnSigNum;
BigInteger.prototype.toByteArray = bnToByteArray;
BigInteger.prototype.equals = bnEquals;
BigInteger.prototype.min = bnMin;
BigInteger.prototype.max = bnMax;
BigInteger.prototype.and = bnAnd;
BigInteger.prototype.or = bnOr;
BigInteger.prototype.xor = bnXor;
BigInteger.prototype.andNot = bnAndNot;
BigInteger.prototype.not = bnNot;
BigInteger.prototype.shiftLeft = bnShiftLeft;
BigInteger.prototype.shiftRight = bnShiftRight;
BigInteger.prototype.getLowestSetBit = bnGetLowestSetBit;
BigInteger.prototype.bitCount = bnBitCount;
BigInteger.prototype.testBit = bnTestBit;
BigInteger.prototype.setBit = bnSetBit;
BigInteger.prototype.clearBit = bnClearBit;
BigInteger.prototype.flipBit = bnFlipBit;
BigInteger.prototype.add = bnAdd;
BigInteger.prototype.subtract = bnSubtract;
BigInteger.prototype.multiply = bnMultiply;
BigInteger.prototype.divide = bnDivide;
BigInteger.prototype.remainder = bnRemainder;
BigInteger.prototype.divideAndRemainder = bnDivideAndRemainder;
BigInteger.prototype.modPow = bnModPow;
BigInteger.prototype.modInverse = bnModInverse;
BigInteger.prototype.pow = bnPow;
BigInteger.prototype.gcd = bnGCD;
BigInteger.prototype.isProbablePrime = bnIsProbablePrime;

// JSBN-specific extension
BigInteger.prototype.square = bnSquare;

// BigInteger interfaces not implemented in jsbn:

// BigInteger(int signum, byte[] magnitude)
// double doubleValue()
// float floatValue()
// int hashCode()
// long longValue()
// static BigInteger valueOf(long val)
module.exports = BigInteger

}).call(this,require("UPikzY"))
},{"UPikzY":72}],18:[function(require,module,exports){
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
var b64_encode = function(numbrs, line) {
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

function b64_decode(input) {
    var output, output_len;
    var chr1, chr2, chr3 = "";
    var enc1, enc2, enc3, enc4 = "";
    var i = 0, o = 0;
 
    // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
    var base64test = /[^A-Za-z0-9\+\/\=]/g;
    if (base64test.exec(input)) {
       throw new Error("invalid b64 input");
    }

    input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
    output_len = Math.floor((input.length + 2) * 3 / 4);
    output = new Uint8Array(output_len);
    
    do {
        enc1 = B64.indexOf(input.charAt(i++));
        enc2 = B64.indexOf(input.charAt(i++));
        enc3 = B64.indexOf(input.charAt(i++));
        enc4 = B64.indexOf(input.charAt(i++));

        chr1 = (enc1 << 2) | (enc2 >> 4);
        chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        chr3 = ((enc3 & 3) << 6) | enc4;
 
        output[o++] = chr1;
        output[o++] = chr2;
        output[o++] = chr3;
 
    } while (i < input.length);

    return output;
}


module.exports.b64_encode = b64_encode;
module.exports.b64_decode = b64_decode;

},{}],"jkurwa":[function(require,module,exports){
module.exports=require('B9c0rZ');
},{}],"B9c0rZ":[function(require,module,exports){
/*jslint plusplus: true */
/*jslint bitwise: true */

'use strict';

var Big = require('./3rtparty/jsbn.packed.js'),
    Keycoder = require('./keycoder.js'),
    base64 = require('./base64.js'),
    rfc3280 = require('./rfc3280.js'),
    dstszi2010 = require('./dstszi2010.js'),
    ZERO = new Big("0"),
    ONE = new Big("1");

var fmod = function (val, modulus) {
    var rv, bitm_l, mask;
    if (val.compareTo(modulus) < 0) {
        return val;
    }
    rv = val;
    bitm_l = modulus.bitLength();
    while (rv.bitLength() >= bitm_l) {
        mask = modulus.shiftLeft(rv.bitLength() - bitm_l);
        rv = rv.xor(mask);
    }

    return rv;
};
var fmul = function (value_1, value_2, modulus) {
    var ret = ZERO, j, bitl_1;

    bitl_1 = value_1.bitLength();
    for (j = 0; j < bitl_1; j++) {
        if (value_1.testBit(j)) {
            ret = ret.xor(value_2);
        }
        value_2 = value_2.shiftLeft(1);
    }
    return fmod(ret, modulus);

};
var finv = function (value, modulus) {
    var b, c, u, v, j, tmp;

    b = ONE;
    c = ZERO;
    u = fmod(value, modulus);
    v = modulus;

    while (u.bitLength() > 1) {
        j = u.bitLength() - v.bitLength();
        if (j < 0) {
            tmp = u;
            u = v;
            v = tmp;

            tmp = c;
            c = b;
            b = tmp;

            j = -j;
        }

        u = u.xor(v.shiftLeft(j));
        b = b.xor(c.shiftLeft(j));
    }

    return b;
};
var ftrace = function (value, modulus) {
    var rv = value,
        bitm_l = modulus.bitLength(),
        idx;

    for (idx = 1; idx <= bitm_l - 2; idx++) {
        rv = fmul(rv, rv, modulus);
        rv = rv.xor(value);
    }

    return rv.intValue();
};
var fsquad_odd = function (value, modulus) {
    var val_a = fmod(value, modulus),
        val_z = val_a,
        bitl_m = modulus.bitLength(),
        range_to = (bitl_m - 2) / 2,
        val_w,
        idx;

    for (idx = 1; idx <= range_to; idx++) {
        val_z = fmul(val_z, val_z, modulus);
        val_z = fmul(val_z, val_z, modulus);
        val_z = val_z.xor(val_a);
    }

    val_w = fmul(val_z, val_z, modulus);
    val_w = val_w.xor(val_z, val_w);

    if (val_w.compareTo(val_a) === 0) {
        return val_z;
    }

    throw new Error("squad eq fail");
};
var fsquad = function (value, modulus) {
    var ret;
    if (modulus.testBit(0)) {
        ret = fsquad_odd(value, modulus);
    }

    return fmod(ret, modulus);
};
var Field = function (param_modulus, value, is_mod) {
    var modulus = param_modulus, ob,
        mod = function (val) {
            return fmod(val, modulus);
        },
        mul = function (val) {
            return fmul(val, ob.value, modulus);
        },
        add = function (val) {
            return ob.value.xor(val);
        },
        inv = function () {
            return finv(ob.value, modulus);
        };
    ob = {
        "mul": mul,
        "mod": mod,
        "add": add,
        "inv": inv,
        "value": value,
    };

    if (is_mod !== true) {
        ob.value = mod(value);
    }
    return ob;
};

var Point = function (p_curve, p_x, p_y) {
    var zero = ZERO,
        modulus = p_curve.modulus,
        ob,
        coords,
        add = function (point_1) {
            var a, x0, x1, y0, y1, x2, y2, point_2, lbd, tmp, tmp2;

            a = p_curve.param_a;
            point_2 = new Point(p_curve, zero, zero);

            x0 = ob.x.value;
            y0 = ob.y.value;
            x1 = point_1.x.value;
            y1 = point_1.y.value;

            if (ob.is_zero()) {
                return point_1;
            }

            if (point_1.is_zero()) {
                return ob;
            }

            if (x0.compareTo(x1) !== 0) {
                tmp = y0.xor(y1);
                tmp2 = x0.xor(x1);
                lbd = fmul(tmp, finv(tmp2, modulus),  modulus);
                x2 = a.xor(fmul(lbd, lbd, modulus));
                x2 = x2.xor(lbd);
                x2 = x2.xor(x0);
                x2 = x2.xor(x1);
            } else {
                if (y1.compareTo(y0) !== 0) {
                    return point_2;
                }
                if (x1.compareTo(zero) === 0) {
                    return point_2;
                }

                lbd = x1.xor(point_1.y.mul(point_1.x.inv()));
                x2 = fmul(lbd, lbd, modulus).xor(a);
                x2 = x2.xor(lbd);
            }
            y2 = fmul(lbd, x1.xor(x2), modulus);
            y2 = y2.xor(x2);
            y2 = y2.xor(y1);

            point_2.x.value = x2;
            point_2.y.value = y2;

            return point_2;

        },
        mul = function (param_n) {
            var point_s = new Point(p_curve, zero, zero), cmp, point,
                bitn_l = param_n.bitLength(),
                j;

            cmp = param_n.compareTo(zero);
            if (cmp === 0) {
                return point_s;
            }

            if (cmp < 0) {
                param_n = param_n.negate();
                point = ob.negate();
            } else {
                point = this;
            }

            for (j = bitn_l - 1; j >= 0; j--) {
                point_s = point_s.add(point_s);
                if (param_n.testBit(j)) {
                    point_s = point_s.add(point);
                }
            }

            return point_s;
        },
        negate = function () {
            return new Point(p_curve, ob.x.value, ob.x.value.xor(ob.y.value));
        },
        is_zero = function () {
            return (ob.x.value.compareTo(zero) === 0) && (ob.y.value.compareTo(zero) === 0);
        },
        expand = function (val) {
            var pa = p_curve.param_a,
                pb = p_curve.param_b,
                k,
                x2,
                y,
                trace,
                trace_y;

            if (val.compareTo(ZERO) === 0) {
                return {
                    x: val,
                    y: fmul(pb, pb, modulus),
                };
            }

            k = val.testBit(0);
            val = val.clearBit(0);

            trace = ftrace(val, modulus);
            if ((trace !== 0 && pa.compareTo(ZERO) === 0) || (trace === 0 && pa.compareTo(ONE) === 0)) {
                val = val.setBit(0);
            }

            x2 = fmul(val, val, modulus);
            y = fmul(x2, val, modulus);

            if (pa.compareTo(ONE) === 0) {
                y = y.xor(x2);
            }

            y = y.xor(pb);
            x2 = finv(x2, modulus);

            y = fmul(y, x2, modulus);
            y = fsquad(y, modulus);

            trace_y = ftrace(y, modulus);

            if ((k === true && trace_y === 0) || (k === false && trace_y !== 0)) {
                console.log("do add");
                y = y.add(ONE);
            }

            y = fmul(y, val, modulus);

            return {
                x: val,
                y: y,
            };
        },
        compress = function() {
            var x_inv, tmp, ret, trace;

            x_inv = finv(ob.x.value, modulus);
            tmp = fmul(x_inv, ob.y.value, modulus);
            trace = ftrace(tmp, modulus);
            ret = ob.x.value;
            if(trace === 1) {
                ret = ret.setBit(0);
            } else {
                ret = ret.clearBit(0);
            }

            return ret;
        },
        equals = function (other) {
            return (other.x.value.compareTo(ob.x.value) === 0) && (
                other.y.value.compareTo(ob.y.value) === 0
            );
        },
        toString = function () {
            return "<Point x:" + ob.x.value.toString(16) + ", y:" + ob.y.value.toString(16) + " >";
        };

    if (p_y === undefined) {
        coords = expand(p_x);
        p_x = coords.x;
        p_y = coords.y;
    }

    ob = {
        "add": add,
        "mul": mul,
        "is_zero": is_zero,
        "negate": negate,
        "expand": expand,
        "compress": compress,
        "equals": equals,
        "toString": toString,
        "x": new Field(modulus, p_x),
        "y": new Field(modulus, p_y),
    };
    return ob;
};

var Pub = function (p_curve, point_q) {
    var zero = ZERO,
        ob,
        help_verify = function (hash_val, s, r) {
            if (zero.compareTo(s) === 0) {
                throw new Error("Invalid sig component S");
            }
            if (zero.compareTo(r) === 0) {
                throw new Error("Invalid sig component R");
            }

            if (p_curve.order.compareTo(s) < 0) {
                throw new Error("Invalid sig component S");
            }
            if (p_curve.order.compareTo(r) < 0) {
                throw new Error("Invalid sig component R");
            }

            var mulQ, mulS, pointR, r1;

            mulQ = point_q.mul(r);
            mulS = p_curve.base.mul(s);

            pointR = mulS.add(mulQ);
            if (pointR.is_zero()) {
                throw new Error("Invalid sig R point at infinity");
            }

            r1 = pointR.x.mul(hash_val);
            r1 = p_curve.truncate(r1);

            return r.compareTo(r1) === 0;
        },
        validate = function () {
            var pub_q = ob.point, pt;

            if (pub_q.is_zero()) {
                return false;
            }

            if (p_curve.contains(pub_q) === false) {
                return false;
            }

            pt = pub_q.mul(p_curve.order);
            if (!pt.is_zero()) {
                return false;
            }

            return true;
        };
    ob = {
        x: point_q.x,
        y: point_q.y,
        point: point_q,
        validate: validate,
        help_verify: help_verify
    };
    return ob;
};

var Priv = function (p_curve, param_d) {
    var ob,
        help_sign = function (hash_v, rand_e) {
            var eG, r, s, hash_field;

            hash_field = new Field(p_curve.modulus, hash_v, true);
            eG = p_curve.base.mul(rand_e);
            if (eG.x.value.compareTo(ZERO) === 0) {
                return null;
            }
            r = hash_field.mul(eG.x.value);
            r = p_curve.truncate(r);
            if (r.compareTo(ZERO) === 0) {
                return null;
            }

            s = param_d.multiply(r).mod(p_curve.order);
            s = s.add(rand_e).mod(p_curve.order);

            return {
                "s": s,
                "r": r,
            };
        },
        sign = function (hash_v) {
            var rand_e, ret;

            while (true) {
                rand_e = p_curve.rand();

                ret = help_sign(hash_v, rand_e);
                if (ret !== null) {
                    return ret;
                }
            }

        },
        pub = function () {
            return new Pub(p_curve, p_curve.base.mul(param_d).negate());
        };

    ob = {
        'help_sign': help_sign,
        'sign': sign,
        'pub': pub,
    };
    return ob;
};

var Curve = function (params, param_b, m, k1, k2, base, order) {
    if (params.base === undefined) {
        params = {
            param_a: params,
            param_b: param_b,
            m: m,
            k1: k1,
            k2: k2,
            base: base,
            order: order,
        };
    }
    var ob,
        comp_modulus = function (k3, k2, k1) {
            var modulus = ZERO;
            modulus = modulus.setBit(k1);
            modulus = modulus.setBit(k2);
            modulus = modulus.setBit(k3);
            ob.modulus = modulus;
        },
        set_base = function (base_x, base_y) {
            ob.base = ob.point(base_x, base_y);
        },
        field = function (val) {
            return new Field(ob.modulus, val);
        },
        point = function (px, py) {
            return new Point(ob, px, py);
        },
        truncate = function (value) {
            var bitl_o = ob.order.bitLength(),
                xbit = value.bitLength();

            while (bitl_o <= xbit) {
                value = value.clearBit(xbit - 1);
                xbit = value.bitLength();
            }
            return value;
        },
        contains = function (point) {
            var lh, y2;
            lh = point.x.value.xor(ob.param_a);
            lh = fmul(lh, point.x.value, ob.modulus);
            lh = lh.xor(point.y.value);
            lh = fmul(lh, point.x.value, ob.modulus);
            lh = lh.xor(ob.param_b);
            y2 = fmul(point.y.value, point.y.value, ob.modulus);
            lh = lh.xor(y2);

            return lh.compareTo(ZERO) === 0;
        },
        trace = function (value) {
            return ftrace(value, ob.modulus);
        },
        rand = function () {
            var bits, words, ret, rand24;

            bits = ob.order.bitLength();
            words = Math.floor((bits + 23) / 24);
            rand24 = new Uint8Array(words * 3);
            rand24 = crypto.getRandomValues(rand24);

            ret = new Big(rand24);

            return ret;
        },
        keygen = function () {
            var rand_d = ob.rand(), priv, pub;
            while (true) {
                priv = new Priv(ob, rand_d);
                pub = priv.pub();
                if (pub.validate()) {
                    return priv;
                }
            }
        };

    ob = {
        "field": field,
        "point": point,
        "comp_modulus": comp_modulus,
        "set_base": set_base,
        "modulus": ZERO,
        "truncate": truncate,
        "contains": contains,
        "trace": trace,
        "rand": rand,
        "keygen": keygen,
        "order": params.order,
        "param_a": params.a,
        "param_b": params.b,
        "param_m": params.m,
    };
    ob.comp_modulus(params.m, params.k1, params.k2);
    if (params.base.x === undefined) {
        ob.set_base(params.base);
    } else {
        ob.set_base(params.base.x, params.base.y);
    }
    return ob;
};

Curve.defined = {
    DSTU_B_257: new Curve({
        a: new Big("0", 16),
        b: new Big("01CEF494720115657E18F938D7A7942394FF9425C1458C57861F9EEA6ADBE3BE10", 16),

        base: {
            x: new Big('002A29EF207D0E9B6C55CD260B306C7E007AC491CA1B10C62334A9E8DCD8D20FB7', 16),
            y: new Big('010686D41FF744D4449FCCF6D8EEA03102E6812C93A9D60B978B702CF156D814EF', 16)
        },

        order: new Big('800000000000000000000000000000006759213AF182E987D3E17714907D470D', 16),

        m: 257,
        k1: 12,
        k2: 0,
    })
};

module.exports = Curve;
module.exports.Field = Field;
module.exports.Priv = Priv;
module.exports.Keycoder = Keycoder;
module.exports.Big = Big;
module.exports.b64_decode = base64.b64_decode;
module.exports.b64_encode = base64.b64_encode;
module.exports.rfc3280 = rfc3280;
module.exports.dstszi2010 = dstszi2010;

},{"./3rtparty/jsbn.packed.js":17,"./base64.js":18,"./dstszi2010.js":21,"./keycoder.js":22,"./rfc3280.js":23}],21:[function(require,module,exports){
var asn1 = require('asn1.js'),
    rfc3280 = require('./rfc3280');

var PKCS7_CONTENT_TYPES = {
    "1 2 840 113549 1 7 1": "data",
    "1 2 840 113549 1 7 2": "signedData",
    "1 2 840 113549 1 7 3": "envelopedData",
    "1 2 840 113549 1 7 4": "signedAndEnvelopedData",
    "1 2 840 113549 1 7 5": "digestData",
    "1 2 840 113549 1 7 6": "encryptedData",
};

var ContentInfo = asn1.define('ContentInfo', function() {
    this.seq().obj(
        this.key('contentType').objid(PKCS7_CONTENT_TYPES),
        this.key('content').explicit(0).choice({
            buffer: this.octstr(),
            raw: this.any()
        })
    );
});

var GOST28147Parameters = asn1.define('GOST28147Parameters', function() {
    this.seq().obj(
        this.key('iv').octstr(),
        this.key('dke').octstr()
    )
});

var ContentEncryptionAlgorithmIdentifier = asn1.define('ContentEncryptionAlgorithmIdentifier', function() {
    this.seq().obj(
        this.key('algorithm').objid(rfc3280.ALGORITHMS_IDS),
        this.key('parameters').choice({
            null_: this.null_(),
            params: this.use(GOST28147Parameters)
        })
    )
});


var DigestAlgorithmIdentifier = asn1.define('DigestAlgorithmIdentifier', function() {
    this.use(rfc3280.AlgorithmIdentifier);
});

var DigestAlgorithmIdentifiers = asn1.define('DigestAlgorithmIdentifiers', function() {
    this.setof(DigestAlgorithmIdentifier);
})

var KeyEncryptionAlgorithmIdentifier = asn1.define('KeyEncryptionAlgorithmIdentifier', function() {
    this.use(rfc3280.AlgorithmIdentifier);
})


var Attribute =  asn1.define('Attribute', function() {
    this.any(); // TO BE DEFINED
});

var Attributes = asn1.define('Attributes', function() {
    this.setof(Attribute);
});

var IssuerAndSerialNumber = asn1.define('IssuerAndSerialNumber', function() {
    this.seq().obj(
        this.key('issuer').use(rfc3280.Name),
        this.key('serialNumber').use(rfc3280.CertificateSerialNumber)
    );
});

var Attribute = asn1.define('Attribute', function() {
    this.seq().obj(
        this.key("type").use(rfc3280.AttributeType),
        this.key('values').setof(rfc3280.AttributeValue)
    );
});

var Attributes = asn1.define('Attributes', function() {
    this.seqof(Attribute);
});

var DigestEncryptionAlgorithmIdentifier = asn1.define('DigestEncryptionAlgorithmIdentifier', function() {
    this.use(rfc3280.AlgorithmIdentifier)
});

var SignerInfo = asn1.define('SignerInfo', function() {
    this.seq().obj(
        this.key('version').int(),
        this.key('issuerAndSerialNumber').explicit(0).octstr(),
        this.key('digestAlgorithm').use(DigestAlgorithmIdentifier),
        this.key('authenticatedAttributes').optional().implicit(0).seqof(
            Attribute
        ),
        this.key('digestEncryptionAlgorithm').use(DigestEncryptionAlgorithmIdentifier),
        this.key('encryptedDigest').octstr(),
        this.key('unauthenticatedAttributes').optional().implicit(1).seqof(
            Attribute
        )
    );
});

var SignerInfos = asn1.define('SignerInfos', function() {
    this.setof(SignerInfo);
});

var SignedData = asn1.define('SignedData', function() {
    this.seq().obj(
        this.key('version').int(),
        this.key('digestAlgorithms').use(DigestAlgorithmIdentifiers),
        this.key('contentInfo').use(ContentInfo),
        this.key('certificate').optional().explicit(0).use(rfc3280.Certificate),
        this.key('crls').optional().implicit(1).any(), // NOT PARSED
        this.key('signerInfos').use(SignerInfos)
    );
});

var RecipientKeyIdentifier = asn1.define('RecipientKeyIdentifier', function() {
    this.key('subjectKeyIdentifier').octstr(),
    this.key('date').use(rfc3280.Time),
    this.key('other').optional().any()
});

var KeyAgreeRecipientIdentifier = asn1.define('KeyAgreeRecipientIdentifier', function() {
    this.choice({
        issuerAndSerialNumber: this.use(IssuerAndSerialNumber),
        rKeyId: this.implicit(0).use(RecipientKeyIdentifier)
    });
});

var RecipientEncryptedKey = asn1.define('RecipientEncryptedKey', function() {
    this.seq().obj(
        this.key('rid').use(KeyAgreeRecipientIdentifier)
    )
});

var OriginatorInfo = asn1.define('OriginatorInfo', function() {
    this.implicit(0).seq().obj( // BUG!
        this.key('certificates').use(IssuerAndSerialNumber)
    );
});

var KeyAgreeRecipientInfo = asn1.define('KeyAgreeRecipientInfo', function() {
    this.implicit(1).seq().obj( // BUG!
        this.key('version').int(),
        this.key('originator').optional().implicit(0).use(OriginatorInfo),
        this.key('ukm').explicit(1).octstr(),
        this.key('keyEncryptionAlgorithm').use(KeyEncryptionAlgorithmIdentifier),
        this.key('recipientEncryptedKeys').seqof(RecipientEncryptedKey)
    );
});

var RecipientInfo = asn1.define('RecipientInfo', function() {
    this.choice({
        kari: this.implicit(1).use(KeyAgreeRecipientInfo)
    })
});

var EncryptedContentInfo = asn1.define('EncryptedContentInfo', function() {
    this.seq().obj(
        this.key('contentType').objid(PKCS7_CONTENT_TYPES),
        this.key('contentEncryptionAlgorithm').use(ContentEncryptionAlgorithmIdentifier),
        this.key('encryptedContent').optional().implicit(0).octstr()
    );
});

var EnvelopedData = asn1.define('EnvelopedData', function() {
    this.seq().obj(
        this.key('version').int(),
        this.key('recipientInfos').setof(RecipientInfo),
        this.key('encryptedContentInfo').use(EncryptedContentInfo)
    );
});

ContentInfo.contentModel = {
    signedData: SignedData,
    envelopedData: EnvelopedData,
};


module.exports.ContentInfo = ContentInfo;

},{"./rfc3280":23,"asn1.js":"RxwtOC"}],22:[function(require,module,exports){
var asn1 = require('asn1.js'),
    Big = require('./3rtparty/jsbn.packed.js'),
    rfc3280 = require('./rfc3280.js'),
    Certificate = rfc3280.Certificate,
    b64_decode = require('./base64.js').b64_decode,
    Buffer = require('buffer').Buffer;

var Keycoder = function() {

    var OID = {
        "1 3 6 1 4 1 19398 1 1 1 2": "IIT Store",
        '1 2 840 113549 1 5 13': "PBES2",
        "1 2 840 113549 1 5 12": "PBKDF2",
        '1 2 804 2 1 1 1 1 1 2': "GOST_34311_HMAC",
        '1 2 804 2 1 1 1 1 1 1 3': "GOST_28147_CFB",
        '1 2 804 2 1 1 1 1 3 1 1': "DSTU_4145_LE",

        '1 2 804 2 1 1 1 11 1 4 1 1': 'DRFO',
        '1 2 804 2 1 1 1 11 1 4 2 1': 'EDRPOU',
    };

    var ob = {
        StoreIIT: asn1.define('StoreIIT', function() {
            this.seq().obj(
                this.key('cryptParam').seq().obj(
                    this.key('cryptType').objid(OID),
                    this.key('cryptParam').seq().obj(
                        this.key('mac').octstr(),
                        this.key('pad').octstr()
                    )
                    ),
                this.key('cryptData').octstr()
            );
        }),
        StorePBES2: asn1.define("StorePBES2", function() {
            this.seq().obj(
                this.key("head").seq().obj(
                    this.key("id").objid(OID),
                    this.key("p").seq().obj(
                        this.key("key").seq().obj(
                            this.key("id").objid(OID),
                            this.key("p").seq().obj(
                                this.key("salt").octstr(),
                                this.key("cycles").int(),
                                this.key("cipher").seq().obj(
                                    this.key("id").objid(OID),
                                    this.key("null").null_()
                                )
                            )
                        ),
                        this.key("cipher").seq().obj(
                            this.key("id").objid(OID),
                            this.key("p").seq().obj(
                                this.key("iv").octstr(),
                                this.key("sbox").octstr()
                            )
                        )
                    )
                ),
                this.key("cryptData").octstr()
            );
        }),
        Attr: asn1.define('Attr', function() {
            this.seq().obj(
                this.key('id').objid(OID),
                this.key('kv').any()
            );
        }),
        Privkey: asn1.define('DstuPrivkey', function() {
            this.seq().obj(
                this.key('version').int(),
                this.key('priv0').seq().obj(
                    this.key('id').objid(OID),
                    this.key('p').seq().obj(
                        this.key('p').seq().obj(
                            this.key('p').seq().obj(
                                this.key('param_m').int(),
                                this.key('param_k1').int()
                            ),
                            this.key('param_a').int(),
                            this.key('param_b').octstr(), // inverted
                            this.key('order').int(),
                            this.key('bp').octstr()
                        ),
                        this.key('sbox').octstr()
                    )
                ),
                this.key('param_d').octstr(),
                this.key('attr').implicit(0).seqof(ob.Attr)
            );
        }),
        IPN_VAL: asn1.define('IPN_VAL', function() {
            this.implicit(0x13).octstr()
        }),
        IPN_ID: asn1.define('IPN_ID', function() {
            this.seq().obj(
                this.key('id').objid(OID),
                this.key("val").setof(ob.IPN_VAL)
            )
        }),
        IPN: asn1.define('IPN', function() {
            this.seqof(ob.IPN_ID)
        }),
        add_zero: function(u8, reorder) {
            var ret = [];
            if(reorder === true) {
            } else {
                ret.push(0);
            }
            for(var i=0; i<u8.length; i++) {
                ret.push(u8[i]);
            }

            if(reorder === true) {
                ret.push(0);
                ret = ret.reverse();
            }
            return ret;
        },
        strFromUtf8Ab: function(ab) {
                return decodeURIComponent(escape(String.fromCharCode.apply(null, ab)));
        },
        parse_ipn: function(data) {
            var asn_ib = ob.IPN.decode(data, 'der');
            var i, part, ret = {};
            for(i = 0; i < asn_ib.length; i++) {
                part = asn_ib[i];
                ret[part.id] = String.fromCharCode.apply(null, part.val[0]);
            }
            return ret;
        },
        parse_ext: function(asn_ob) {
            var ret, i, part;
            ret = {};
            for(i = 0; i< asn_ob.length; i++) {
                part = asn_ob[i];
                ret[part.extnID] = part.extnValue;
            }
            ret.ipn = ob.parse_ipn(ret.subjectDirectoryAttributes);
            return ret;
        },
        parse_dn: function(asn_ob) {
            var ret, i, j, part;
            ret = {};
            for(i = 0; i < asn_ob.length; i++) {
                for(j = 0; j < asn_ob[i].length; j++) {
                    part = asn_ob[i][j];
                    if ((part.value[0] == 0xC) && part.value[1] === part.value.length -2) {
                        ret[part.type] = ob.strFromUtf8Ab(part.value.slice(2));
                    } else {
                        ret[part.type] = part.value;
                    }
                }
            }
            return ret;
        },
        to_pem: function(b64, desc) {
            var begin, end;
            if(desc === undefined) {
                desc = 'PRIVATE KEY';
            }
            begin = '-----BEGIN ' + desc + '-----';
            end = '-----END ' + desc + '-----';

            return [begin, b64, end].join('\n');
        },
        is_valid : function(indata) {
            return (indata[0] == 0x30) && ((indata[1] & 0x80) == 0x80);
        },
        iit_parse: function(data) {

            var asn1 = ob.StoreIIT.decode(data, 'der'), mac, pad;
            mac = asn1.cryptParam.cryptParam.mac;
            pad = asn1.cryptParam.cryptParam.pad;

            if(mac.length !== 4) {
                throw new Error("Invalid mac len " + mac.length);
            }
            if(pad.length >= 8) {
                throw new Error("Invalid pad len " + pad.length);
            }
            if(asn1.cryptParam.cryptType !== 'IIT Store') {
                throw new Error("Invalid storage type");
            }

            return {
                "format": "IIT",
                "mac": mac,
                "pad": pad,
                "body": asn1.cryptData,
            }
        },
        pbes2_parse: function(data) {
            var asn1 = ob.StorePBES2.decode(data, 'der'), iv, sbox, salt, iter;

            if(asn1.head.id !== 'PBES2') {
                throw new Error(asn1.head.id);
            }
            if(asn1.head.p.key.id !== 'PBKDF2') {
                throw new Error(asn1.head.p.key.id);
            }
            if(asn1.head.p.key.p.cipher.id != 'GOST_34311_HMAC') {
                throw new Error(asn1.head.p.key.p.cipher.id);
            }
            if(asn1.head.p.cipher.id != 'GOST_28147_CFB') {
                throw new Error(asn1.head.p.cipher.id);
            }
            iv = asn1.head.p.cipher.p.iv;
            sbox = asn1.head.p.cipher.p.sbox;
            salt = asn1.head.p.key.p.salt;
            iter = asn1.head.p.key.p.cycles;

            if( (iv.length != 8) || (sbox.length != 64) || (salt.length != 32)) {
                throw new Error("IV len: " + iv.length + ", S-BOX len: " + sbox.length + ", SALT len: " + salt.length);
            }
            return {
                "format": "PBES2",
                "iv": iv,
                "sbox": sbox,
                "salt": salt,
                "iters": iter,
                "body": asn1.cryptData,
            }
        },
        privkey_parse: function(data) {
            var priv = ob.Privkey.decode(data, 'der');
            return {
                param_d: new Big(ob.add_zero(priv.param_d, true)),
                curve: {
                    m: priv.priv0.p.p.p.param_m,
                    k1: priv.priv0.p.p.p.param_k1,
                    a: new Big([priv.priv0.p.p.param_a]),
                    b: new Big(ob.add_zero(priv.priv0.p.p.param_b, true)),
                    order: new Big(ob.add_zero(priv.priv0.p.p.order)),
                    base: new Big(ob.add_zero(priv.priv0.p.p.bp, true)),
                },
                sbox: priv.priv0.p.sbox,
                format: "privkey",
            }
        },
        cert_parse: function(data) {
            var cert = Certificate.decode(data, 'der');
            var tbs = cert.tbsCertificate;
            var pub = tbs.subjectPublicKeyInfo.subjectPublicKey.data.slice(2);
            return {
                format: "x509",
                pubkey: new Big(ob.add_zero(pub, true)),
                valid: {
                    from: tbs.validity.notBefore.value,
                    to: tbs.validity.notAfter.value
                },
                extension: ob.parse_ext(cert.tbsCertificate.extensions.e),
                issuer: ob.parse_dn(cert.tbsCertificate.issuer.value),
                subject: ob.parse_dn(cert.tbsCertificate.subject.value)
            };
        },
        is_pem: function(indata) {
            if(indata.constructor === Uint8Array) {
                if((indata[0] === 0x2D) &&
                   (indata[1] === 0x2D) &&
                   (indata[2] === 0x2D) &&
                   (indata[3] === 0x2D) &&
                   (indata[4] === 0x2D)) {
                    return true;
                }
            }
            if(typeof(indata) === 'string') {
                return indata.indexOf('-----') === 0;
            }
        },
        maybe_pem: function(indata) {
            var start, end, ln;

            if(ob.is_pem(indata) !== true) {
                return indata;
            }
            if(typeof(indata) !== 'string') {
                indata = String.fromCharCode.apply(null, indata);
            }
            indata = indata.split('\n');
            for(start=0; start<indata.length; start++) {
                ln = indata[start];
                if(ln.indexOf('-----')===0) {
                    start ++;
                    break;
                }
            }

            for(end=1; end<=indata.length; end++) {
                ln = indata[indata.length-end];
                if(ln.indexOf('-----')===0) {
                    break;
                }
            }

            indata = indata.slice(start, -end).join('');
            return b64_decode(indata);
        },
        guess_parse: function(indata) {
            var data, ret, tr;
            data = new Buffer(indata, 'raw');

            tr = [
                'iit_parse',
                'pbes2_parse',
                'privkey_parse',
                'cert_parse',
            ];

            for(var i=0; i<tr.length; i++) {
                try {
                    return ob[tr[i]](data);
                } catch (e) {}
            }

            throw new Error("Unknown format");
        },
    };
    return {
        "parse": ob.guess_parse,
        "to_pem": ob.to_pem,
        "is_valid": ob.is_valid,
        "maybe_pem": ob.maybe_pem,
    }
}

module.exports = Keycoder

},{"./3rtparty/jsbn.packed.js":17,"./base64.js":18,"./rfc3280.js":23,"asn1.js":"RxwtOC","buffer":"VTj7jY"}],23:[function(require,module,exports){
var asn1 = require('asn1.js');

var CRLReason = asn1.define('CRLReason', function() {
  this.enum({
    0: 'unspecified',
    1: 'keyCompromise',
    2: 'CACompromise',
    3: 'affiliationChanged',
    4: 'superseded',
    5: 'cessationOfOperation',
    6: 'certificateHold',
    8: 'removeFromCRL',
    9: 'privilegeWithdrawn',
    10: 'AACompromise'
  });
});
exports.CRLReason = CRLReason;

var ALGORITHMS_IDS = {
    "1 2 804 2 1 1 1 1 2 1": "Gost34311",
    '1 2 804 2 1 1 1 1 1 1 3': "Gost28147-cfb",
};
exports.ALGORITHMS_IDS = ALGORITHMS_IDS;

var AlgorithmIdentifier = asn1.define('AlgorithmIdentifier', function() {
  this.seq().obj(
    this.key('algorithm').objid(ALGORITHMS_IDS),
    this.key('parameters').optional().any()
  );
});
exports.AlgorithmIdentifier = AlgorithmIdentifier;

var Certificate = asn1.define('Certificate', function() {
  this.seq().obj(
    this.key('tbsCertificate').use(TBSCertificate),
    this.key('signatureAlgorithm').use(AlgorithmIdentifier),
    this.key('signature').bitstr()
  );
});
exports.Certificate = Certificate;

var TBSCertificate = asn1.define('TBSCertificate', function() {
  this.seq().obj(
    this.key('version').def('v1').explicit(0).use(Version),
    this.key('serialNumber').use(CertificateSerialNumber),
    this.key('signature').use(AlgorithmIdentifier),
    this.key('issuer').use(Name),
    this.key('validity').use(Validity),
    this.key('subject').use(Name),
    this.key('subjectPublicKeyInfo').use(SubjectPublicKeyInfo),

    // TODO(indutny): validate that version is v2 or v3
    this.key('issuerUniqueID').optional().implicit(1).use(UniqueIdentifier),
    this.key('subjectUniqueID').optional().implicit(2).use(UniqueIdentifier),

    // TODO(indutny): validate that version is v3
    this.key('extensions').optional().implicit(3).seq().obj(
        this.key("e").use(Extensions)
    )
  );
});
exports.TBSCertificate = TBSCertificate;

var Version = asn1.define('Version', function() {
  this.int({
    0: 'v1',
    1: 'v2',
    2: 'v3'
  });
});
exports.Version = Version;

var CertificateSerialNumber = asn1.define('CertificateSerialNumber',
                                          function() {
  this.int();
});
exports.CertificateSerialNumber = CertificateSerialNumber;

var Validity = asn1.define('Validity', function() {
  this.seq().obj(
    this.key('notBefore').use(Time),
    this.key('notAfter').use(Time)
  );
});
exports.Validity = Validity;

var Time = asn1.define('Time', function() {
  this.choice({
    utcTime: this.utctime(),
    genTime: this.gentime()
  });
});
exports.Time = Time;

var UniqueIdentifier = asn1.define('UniqueIdentifier', function() {
  this.bitstr();
});
exports.UniqueIdentifier = UniqueIdentifier;

var SubjectPublicKeyInfo = asn1.define('SubjectPublicKeyInfo', function() {
  this.seq().obj(
    this.key('algorithm').use(AlgorithmIdentifier),
    this.key('subjectPublicKey').bitstr()
  );
});
exports.SubjectPublicKeyInfo = SubjectPublicKeyInfo;

var Extensions = asn1.define('Extensions', function() {
  this.seqof(Extension)
});
exports.Extensions = Extensions;

var extnIdMap = {
"1 3 6 1 5 5 7 1 1": "authorityInfoAccess",
"1 3 6 1 5 5 7 1 2": "biometricInfo",
"1 3 6 1 5 5 7 1 3": "qcStatements",
"1 3 6 1 5 5 7 1 4": "ac-auditEntity",
"1 3 6 1 5 5 7 1 5": "ac-targeting",
"1 3 6 1 5 5 7 1 6": "aaControls",
"1 3 6 1 5 5 7 1 7": "sbgp-ipAddrBlock",
"1 3 6 1 5 5 7 1 8": "sbgp-autonomousSysNum",
"1 3 6 1 5 5 7 1 9": "sbgp-routerIdentifier",
"1 3 6 1 5 5 7 1 10": "ac-proxying",
"1 3 6 1 5 5 7 1 11": "subjectInfoAccess",
"1 3 6 1 5 5 7 1 14": "proxyCertInfo",
'2 5 29 9': 'subjectDirectoryAttributes',
'2 5 29 14': 'subjectKeyIdentifier',
'2 5 29 15': 'keyUsage',
'2 5 29 16': 'privateKeyUsagePeriod',
'2 5 29 17': 'subjectAltName',
'2 5 29 18': 'issuerAltName',
'2 5 29 19': 'basicConstraints',
'2 5 29 20': 'crlNumber',
'2 5 29 21': 'CRLReason',
'2 5 29 24': 'invalidityDate',
'2 5 29 27': 'deltaCRL',
'2 5 29 28': 'issuingDistributionPoint',
'2 5 29 29': 'certificateIssuer',
'2 5 29 30': 'nameConstraints',
'2 5 29 31': 'crlDistributionPoints',
'2 5 29 32': 'certificatePolicies',
'2 5 29 32 0': 'anyPolicy',
'2 5 29 33': 'policyMappings',
'2 5 29 35': 'authorityKeyIdentifier',
'2 5 29 36': 'policyConstraints',
'2 5 29 37': 'extendedKeyUsage',
'2 5 29 46': 'freshestCRL',
'2 5 29 54': 'inhibitAnyPolicy',
'2 5 29 55': 'targetInformation',
'2 5 29 56': 'noRevAvail',
}

var Extension = asn1.define('Extension', function() {
  this.seq().obj(
    this.key('extnID').objid(extnIdMap),
    this.key('critical').bool().def(false),
    this.key('extnValue').octstr()
  );
});
exports.Extension = Extension;

var Name = asn1.define('Name', function() {
  this.choice({
    rdn: this.use(RDNSequence)
  });
});
exports.Name = Name;

var RDNSequence = asn1.define('RDNSequence', function() {
  this.seqof(RelativeDistinguishedName);
});
exports.RDNSequence = RDNSequence;

var RelativeDistinguishedName = asn1.define('RelativeDistinguishedName',
                                            function() {
  this.setof(AttributeTypeAndValue);
});
exports.RelativeDistinguishedName = RelativeDistinguishedName;

var AttributeTypeAndValue = asn1.define('AttributeTypeAndValue', function() {
  this.seq().obj(
    this.key('type').use(AttributeType),
    this.key('value').use(AttributeValue)
  );
});
exports.AttributeTypeAndValue = AttributeTypeAndValue;

var AttributeObjId = {
    '2 5 4 3': 'commonName',
    '2 5 4 4': 'surname',
    '2 5 4 5': 'serialNumber',
    '2 5 4 6': 'countryName',
    '2 5 4 7': 'localityName',
    '2 5 4 8': 'stateOrProvinceName',
    '2 5 4 9': 'streetAddress',
    '2 5 4 10': 'organizationName',
    '2 5 4 11': 'organizationalUnitName',
    '2 5 4 12': 'title',
    '2 5 4 13': 'description',
    '2 5 4 14': 'searchGuide',
    '2 5 4 15': 'businessCategory',
    '2 5 4 16': 'postalAddress',
    '2 5 4 17': 'postalCode',
    '2 5 4 18': 'postOfficeBox',
    '2 5 4 19': 'physicalDeliveryOfficeName',
    '2 5 4 20': 'telephoneNumber',
    '2 5 4 21': 'telexNumber',
    '2 5 4 22': 'teletexTerminalIdentifier',
    '2 5 4 23': 'facsimileTelephoneNumber',
    '2 5 4 24': 'x121Address',
    '2 5 4 25': 'internationaliSDNNumber',
    '2 5 4 26': 'registeredAddress',
    '2 5 4 27': 'destinationIndicator',
    '2 5 4 28': 'preferredDeliveryMethod',
    '2 5 4 29': 'presentationAddress',
    '2 5 4 30': 'supportedApplicationContext',
    '2 5 4 31': 'member',
    '2 5 4 32': 'owner',
    '2 5 4 33': 'roleOccupant',
    '2 5 4 34': 'seeAlso',
    '2 5 4 35': 'userPassword',
    '2 5 4 36': 'userCertificate',
    '2 5 4 37': 'cACertificate',
    '2 5 4 38': 'authorityRevocationList',
    '2 5 4 39': 'certificateRevocationList',
    '2 5 4 40': 'crossCertificatePair',
    '2 5 4 41': 'name',
    '2 5 4 42': 'givenName',
    '2 5 4 43': 'initials',
    '2 5 4 44': 'generationQualifier',
    '2 5 4 45': 'x500UniqueIdentifier',
    '2 5 4 46': 'dnQualifier',
    '2 5 4 47': 'enhancedSearchGuide',
    '2 5 4 48': 'protocolInformation',
    '2 5 4 49': 'distinguishedName',
    '2 5 4 50': 'uniqueMember',
    '2 5 4 51': 'houseIdentifier',
    '2 5 4 52': 'supportedAlgorithms',
    '2 5 4 53': 'deltaRevocationList',
    '2 5 4 54': 'dmdName',
    '2 5 4 65': 'pseudonym',
    '2 5 4 72': 'role',
}
var AttributeType = asn1.define('AttributeType', function() {
  this.objid(AttributeObjId)
});
exports.AttributeType = AttributeType;

var AttributeValue = asn1.define('AttributeValue', function() {
  this.any();
});
exports.AttributeValue = AttributeValue;

},{"asn1.js":"RxwtOC"}],24:[function(require,module,exports){
/*
  Ported to JavaScript by Lazar Laszlo 2011 
  
  lazarsoft@gmail.com, www.lazarsoft.info
  
*/

/*
*
* Copyright 2007 ZXing authors
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

var qrcode = require('./qrcode')();

function AlignmentPattern(posX, posY,  estimatedModuleSize)
{
  this.x=posX;
  this.y=posY;
  this.count = 1;
  this.estimatedModuleSize = estimatedModuleSize;
  
  this.__defineGetter__("EstimatedModuleSize", function()
  {
    return this.estimatedModuleSize;
  }); 
  this.__defineGetter__("Count", function()
  {
    return this.count;
  });
  this.__defineGetter__("X", function()
  {
    return Math.floor(this.x);
  });
  this.__defineGetter__("Y", function()
  {
    return Math.floor(this.y);
  });
  this.incrementCount = function()
  {
    this.count++;
  }
  this.aboutEquals=function( moduleSize,  i,  j)
    {
      if (Math.abs(i - this.y) <= moduleSize && Math.abs(j - this.x) <= moduleSize)
      {
        var moduleSizeDiff = Math.abs(moduleSize - this.estimatedModuleSize);
        return moduleSizeDiff <= 1.0 || moduleSizeDiff / this.estimatedModuleSize <= 1.0;
      }
      return false;
    }
  
}

function AlignmentPatternFinder( image,  startX,  startY,  width,  height,  moduleSize,  resultPointCallback)
{
  this.image = image;
  this.possibleCenters = new Array();
  this.startX = startX;
  this.startY = startY;
  this.width = width;
  this.height = height;
  this.moduleSize = moduleSize;
  this.crossCheckStateCount = new Array(0,0,0);
  this.resultPointCallback = resultPointCallback;
  
  this.centerFromEnd=function(stateCount,  end)
    {
      return  (end - stateCount[2]) - stateCount[1] / 2.0;
    }
  this.foundPatternCross = function(stateCount)
    {
      var moduleSize = this.moduleSize;
      var maxVariance = moduleSize / 2.0;
      for (var i = 0; i < 3; i++)
      {
        if (Math.abs(moduleSize - stateCount[i]) >= maxVariance)
        {
          return false;
        }
      }
      return true;
    }

  this.crossCheckVertical=function( startI,  centerJ,  maxCount,  originalStateCountTotal)
    {
      var image = this.image;
      
      var maxI = qrcode.height;
      var stateCount = this.crossCheckStateCount;
      stateCount[0] = 0;
      stateCount[1] = 0;
      stateCount[2] = 0;
      
      // Start counting up from center
      var i = startI;
      while (i >= 0 && image[centerJ + i*qrcode.width] && stateCount[1] <= maxCount)
      {
        stateCount[1]++;
        i--;
      }
      // If already too many modules in this state or ran off the edge:
      if (i < 0 || stateCount[1] > maxCount)
      {
        return NaN;
      }
      while (i >= 0 && !image[centerJ + i*qrcode.width] && stateCount[0] <= maxCount)
      {
        stateCount[0]++;
        i--;
      }
      if (stateCount[0] > maxCount)
      {
        return NaN;
      }
      
      // Now also count down from center
      i = startI + 1;
      while (i < maxI && image[centerJ + i*qrcode.width] && stateCount[1] <= maxCount)
      {
        stateCount[1]++;
        i++;
      }
      if (i == maxI || stateCount[1] > maxCount)
      {
        return NaN;
      }
      while (i < maxI && !image[centerJ + i*qrcode.width] && stateCount[2] <= maxCount)
      {
        stateCount[2]++;
        i++;
      }
      if (stateCount[2] > maxCount)
      {
        return NaN;
      }
      
      var stateCountTotal = stateCount[0] + stateCount[1] + stateCount[2];
      if (5 * Math.abs(stateCountTotal - originalStateCountTotal) >= 2 * originalStateCountTotal)
      {
        return NaN;
      }
      
      return this.foundPatternCross(stateCount)?this.centerFromEnd(stateCount, i):NaN;
    }
    
  this.handlePossibleCenter=function( stateCount,  i,  j)
    {
      var stateCountTotal = stateCount[0] + stateCount[1] + stateCount[2];
      var centerJ = this.centerFromEnd(stateCount, j);
      var centerI = this.crossCheckVertical(i, Math.floor (centerJ), 2 * stateCount[1], stateCountTotal);
      if (!isNaN(centerI))
      {
        var estimatedModuleSize = (stateCount[0] + stateCount[1] + stateCount[2]) / 3.0;
        var max = this.possibleCenters.length;
        for (var index = 0; index < max; index++)
        {
          var center =  this.possibleCenters[index];
          // Look for about the same center and module size:
          if (center.aboutEquals(estimatedModuleSize, centerI, centerJ))
          {
            return new AlignmentPattern(centerJ, centerI, estimatedModuleSize);
          }
        }
        // Hadn't found this before; save it
        var point = new AlignmentPattern(centerJ, centerI, estimatedModuleSize);
        this.possibleCenters.push(point);
        if (this.resultPointCallback != null)
        {
          this.resultPointCallback.foundPossibleResultPoint(point);
        }
      }
      return null;
    }
    
  this.find = function()
  {
      var startX = this.startX;
      var height = this.height;
      var maxJ = startX + width;
      var middleI = startY + (height >> 1);
      // We are looking for black/white/black modules in 1:1:1 ratio;
      // this tracks the number of black/white/black modules seen so far
      var stateCount = new Array(0,0,0);
      for (var iGen = 0; iGen < height; iGen++)
      {
        // Search from middle outwards
        var i = middleI + ((iGen & 0x01) == 0?((iGen + 1) >> 1):- ((iGen + 1) >> 1));
        stateCount[0] = 0;
        stateCount[1] = 0;
        stateCount[2] = 0;
        var j = startX;
        // Burn off leading white pixels before anything else; if we start in the middle of
        // a white run, it doesn't make sense to count its length, since we don't know if the
        // white run continued to the left of the start point
        while (j < maxJ && !image[j + qrcode.width* i])
        {
          j++;
        }
        var currentState = 0;
        while (j < maxJ)
        {
          if (image[j + i*qrcode.width])
          {
            // Black pixel
            if (currentState == 1)
            {
              // Counting black pixels
              stateCount[currentState]++;
            }
            else
            {
              // Counting white pixels
              if (currentState == 2)
              {
                // A winner?
                if (this.foundPatternCross(stateCount))
                {
                  // Yes
                  var confirmed = this.handlePossibleCenter(stateCount, i, j);
                  if (confirmed != null)
                  {
                    return confirmed;
                  }
                }
                stateCount[0] = stateCount[2];
                stateCount[1] = 1;
                stateCount[2] = 0;
                currentState = 1;
              }
              else
              {
                stateCount[++currentState]++;
              }
            }
          }
          else
          {
            // White pixel
            if (currentState == 1)
            {
              // Counting black pixels
              currentState++;
            }
            stateCount[currentState]++;
          }
          j++;
        }
        if (this.foundPatternCross(stateCount))
        {
          var confirmed = this.handlePossibleCenter(stateCount, i, maxJ);
          if (confirmed != null)
          {
            return confirmed;
          }
        }
      }
      
      // Hmm, nothing we saw was observed and confirmed twice. If we had
      // any guess at all, return it.
      if (!(this.possibleCenters.length == 0))
      {
        return  this.possibleCenters[0];
      }
      
      throw "Couldn't find enough alignment patterns";
    }
  
}

module.exports = AlignmentPatternFinder
},{"./qrcode":39}],25:[function(require,module,exports){
/*
  Ported to JavaScript by Lazar Laszlo 2011 
  
  lazarsoft@gmail.com, www.lazarsoft.info
  
*/

/*
*
* Copyright 2007 ZXing authors
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

var qrcode = require('./qrcode')();


function BitMatrix( width,  height) {
  if(!height)
    height=width;
  if (width < 1 || height < 1)
  {
    throw "Both dimensions must be greater than 0";
  }
  this.width = width;
  this.height = height;
  var rowSize = width >> 5;
  if ((width & 0x1f) != 0)
  {
    rowSize++;
  }
  this.rowSize = rowSize;
  this.bits = new Array(rowSize * height);
  for(var i=0;i<this.bits.length;i++)
    this.bits[i]=0;
  
  this.__defineGetter__("Width", function()
  {
    return this.width;
  });
  this.__defineGetter__("Height", function()
  {
    return this.height;
  });
  this.__defineGetter__("Dimension", function()
  {
    if (this.width != this.height)
    {
      throw "Can't call getDimension() on a non-square matrix";
    }
    return this.width;
  });
  
  this.get_Renamed=function( x,  y)
    {
      var offset = y * this.rowSize + (x >> 5);
      return ((qrcode.URShift(this.bits[offset], (x & 0x1f))) & 1) != 0;
    }
  this.set_Renamed=function( x,  y)
    {
      var offset = y * this.rowSize + (x >> 5);
      this.bits[offset] |= 1 << (x & 0x1f);
    }
  this.flip=function( x,  y)
    {
      var offset = y * this.rowSize + (x >> 5);
      this.bits[offset] ^= 1 << (x & 0x1f);
    }
  this.clear=function()
    {
      var max = this.bits.length;
      for (var i = 0; i < max; i++)
      {
        this.bits[i] = 0;
      }
    }
  this.setRegion=function( left,  top,  width,  height)
    {
      if (top < 0 || left < 0)
      {
        throw "Left and top must be nonnegative";
      }
      if (height < 1 || width < 1)
      {
        throw "Height and width must be at least 1";
      }
      var right = left + width;
      var bottom = top + height;
      if (bottom > this.height || right > this.width)
      {
        throw "The region must fit inside the matrix";
      }
      for (var y = top; y < bottom; y++)
      {
        var offset = y * this.rowSize;
        for (var x = left; x < right; x++)
        {
          this.bits[offset + (x >> 5)] |= 1 << (x & 0x1f);
        }
      }
    }
}

module.exports = BitMatrix
},{"./qrcode":39}],26:[function(require,module,exports){
/*
  Ported to JavaScript by Lazar Laszlo 2011 
  
  lazarsoft@gmail.com, www.lazarsoft.info
  
*/

/*
*
* Copyright 2007 ZXing authors
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

var Version = require('./version');
var BitMatrix = require('./bitmat');
var DataMask = require('./datamask');
var FormatInformation = require('./formatinf');

function BitMatrixParser(bitMatrix)
{
  var dimension = bitMatrix.Dimension;
  if (dimension < 21 || (dimension & 0x03) != 1)
  {
    throw "Error BitMatrixParser";
  }
  this.bitMatrix = bitMatrix;
  this.parsedVersion = null;
  this.parsedFormatInfo = null;
  
  this.copyBit=function( i,  j,  versionBits)
  {
    return this.bitMatrix.get_Renamed(i, j)?(versionBits << 1) | 0x1:versionBits << 1;
  }
  
  this.readFormatInformation=function()
  {
      if (this.parsedFormatInfo != null)
      {
        return this.parsedFormatInfo;
      }
      
      // Read top-left format info bits
      var formatInfoBits = 0;
      for (var i = 0; i < 6; i++)
      {
        formatInfoBits = this.copyBit(i, 8, formatInfoBits);
      }
      // .. and skip a bit in the timing pattern ...
      formatInfoBits = this.copyBit(7, 8, formatInfoBits);
      formatInfoBits = this.copyBit(8, 8, formatInfoBits);
      formatInfoBits = this.copyBit(8, 7, formatInfoBits);
      // .. and skip a bit in the timing pattern ...
      for (var j = 5; j >= 0; j--)
      {
        formatInfoBits = this.copyBit(8, j, formatInfoBits);
      }
      
      this.parsedFormatInfo = FormatInformation.decodeFormatInformation(formatInfoBits);
      if (this.parsedFormatInfo != null)
      {
        return this.parsedFormatInfo;
      }
      
      // Hmm, failed. Try the top-right/bottom-left pattern
      var dimension = this.bitMatrix.Dimension;
      formatInfoBits = 0;
      var iMin = dimension - 8;
      for (var i = dimension - 1; i >= iMin; i--)
      {
        formatInfoBits = this.copyBit(i, 8, formatInfoBits);
      }
      for (var j = dimension - 7; j < dimension; j++)
      {
        formatInfoBits = this.copyBit(8, j, formatInfoBits);
      }
      
      this.parsedFormatInfo = FormatInformation.decodeFormatInformation(formatInfoBits);
      if (this.parsedFormatInfo != null)
      {
        return this.parsedFormatInfo;
      }
      throw "Error readFormatInformation";  
  }
  this.readVersion=function()
    {
      
      if (this.parsedVersion != null)
      {
        return this.parsedVersion;
      }
      
      var dimension = this.bitMatrix.Dimension;
      
      var provisionalVersion = (dimension - 17) >> 2;
      if (provisionalVersion <= 6)
      {
        return Version.getVersionForNumber(provisionalVersion);
      }
      
      // Read top-right version info: 3 wide by 6 tall
      var versionBits = 0;
      var ijMin = dimension - 11;
      for (var j = 5; j >= 0; j--)
      {
        for (var i = dimension - 9; i >= ijMin; i--)
        {
          versionBits = this.copyBit(i, j, versionBits);
        }
      }
      
      this.parsedVersion = Version.decodeVersionInformation(versionBits);
      if (this.parsedVersion != null && this.parsedVersion.DimensionForVersion == dimension)
      {
        return this.parsedVersion;
      }
      
      // Hmm, failed. Try bottom left: 6 wide by 3 tall
      versionBits = 0;
      for (var i = 5; i >= 0; i--)
      {
        for (var j = dimension - 9; j >= ijMin; j--)
        {
          versionBits = this.copyBit(i, j, versionBits);
        }
      }
      
      this.parsedVersion = Version.decodeVersionInformation(versionBits);
      if (this.parsedVersion != null && this.parsedVersion.DimensionForVersion == dimension)
      {
        return this.parsedVersion;
      }
      throw "Error readVersion";
    }
  this.readCodewords=function()
    {
      
      var formatInfo = this.readFormatInformation();
      var version = this.readVersion();
      
      // Get the data mask for the format used in this QR Code. This will exclude
      // some bits from reading as we wind through the bit matrix.
      var dataMask = DataMask.forReference( formatInfo.DataMask);
      var dimension = this.bitMatrix.Dimension;
      dataMask.unmaskBitMatrix(this.bitMatrix, dimension);
      
      var functionPattern = version.buildFunctionPattern();
      
      var readingUp = true;
      var result = new Array(version.TotalCodewords);
      var resultOffset = 0;
      var currentByte = 0;
      var bitsRead = 0;
      // Read columns in pairs, from right to left
      for (var j = dimension - 1; j > 0; j -= 2)
      {
        if (j == 6)
        {
          // Skip whole column with vertical alignment pattern;
          // saves time and makes the other code proceed more cleanly
          j--;
        }
        // Read alternatingly from bottom to top then top to bottom
        for (var count = 0; count < dimension; count++)
        {
          var i = readingUp?dimension - 1 - count:count;
          for (var col = 0; col < 2; col++)
          {
            // Ignore bits covered by the function pattern
            if (!functionPattern.get_Renamed(j - col, i))
            {
              // Read a bit
              bitsRead++;
              currentByte <<= 1;
              if (this.bitMatrix.get_Renamed(j - col, i))
              {
                currentByte |= 1;
              }
              // If we've made a whole byte, save it off
              if (bitsRead == 8)
              {
                result[resultOffset++] =  currentByte;
                bitsRead = 0;
                currentByte = 0;
              }
            }
          }
        }
        readingUp ^= true; // readingUp = !readingUp; // switch directions
      }
      if (resultOffset != version.TotalCodewords)
      {
        throw "Error readCodewords";
      }
      return result;
    }
}

module.exports = BitMatrixParser;
},{"./bitmat":25,"./datamask":29,"./formatinf":34,"./version":41}],27:[function(require,module,exports){
/*
  Ported to JavaScript by Lazar Laszlo 2011 
  
  lazarsoft@gmail.com, www.lazarsoft.info
  
*/

/*
*
* Copyright 2007 ZXing authors
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/


function DataBlock(numDataCodewords,  codewords)
{
	this.numDataCodewords = numDataCodewords;
	this.codewords = codewords;
	
	this.__defineGetter__("NumDataCodewords", function()
	{
		return this.numDataCodewords;
	});
	this.__defineGetter__("Codewords", function()
	{
		return this.codewords;
	});
}	
	
DataBlock.getDataBlocks=function(rawCodewords,  version,  ecLevel)
{
	
	if (rawCodewords.length != version.TotalCodewords)
	{
		throw "ArgumentException";
	}
	
	// Figure out the number and size of data blocks used by this version and
	// error correction level
	var ecBlocks = version.getECBlocksForLevel(ecLevel);
	
	// First count the total number of data blocks
	var totalBlocks = 0;
	var ecBlockArray = ecBlocks.getECBlocks();
	for (var i = 0; i < ecBlockArray.length; i++)
	{
		totalBlocks += ecBlockArray[i].Count;
	}
	
	// Now establish DataBlocks of the appropriate size and number of data codewords
	var result = new Array(totalBlocks);
	var numResultBlocks = 0;
	for (var j = 0; j < ecBlockArray.length; j++)
	{
		var ecBlock = ecBlockArray[j];
		for (var i = 0; i < ecBlock.Count; i++)
		{
			var numDataCodewords = ecBlock.DataCodewords;
			var numBlockCodewords = ecBlocks.ECCodewordsPerBlock + numDataCodewords;
			result[numResultBlocks++] = new DataBlock(numDataCodewords, new Array(numBlockCodewords));
		}
	}
	
	// All blocks have the same amount of data, except that the last n
	// (where n may be 0) have 1 more byte. Figure out where these start.
	var shorterBlocksTotalCodewords = result[0].codewords.length;
	var longerBlocksStartAt = result.length - 1;
	while (longerBlocksStartAt >= 0)
	{
		var numCodewords = result[longerBlocksStartAt].codewords.length;
		if (numCodewords == shorterBlocksTotalCodewords)
		{
			break;
		}
		longerBlocksStartAt--;
	}
	longerBlocksStartAt++;
	
	var shorterBlocksNumDataCodewords = shorterBlocksTotalCodewords - ecBlocks.ECCodewordsPerBlock;
	// The last elements of result may be 1 element longer;
	// first fill out as many elements as all of them have
	var rawCodewordsOffset = 0;
	for (var i = 0; i < shorterBlocksNumDataCodewords; i++)
	{
		for (var j = 0; j < numResultBlocks; j++)
		{
			result[j].codewords[i] = rawCodewords[rawCodewordsOffset++];
		}
	}
	// Fill out the last data block in the longer ones
	for (var j = longerBlocksStartAt; j < numResultBlocks; j++)
	{
		result[j].codewords[shorterBlocksNumDataCodewords] = rawCodewords[rawCodewordsOffset++];
	}
	// Now add in error correction blocks
	var max = result[0].codewords.length;
	for (var i = shorterBlocksNumDataCodewords; i < max; i++)
	{
		for (var j = 0; j < numResultBlocks; j++)
		{
			var iOffset = j < longerBlocksStartAt?i:i + 1;
			result[j].codewords[iOffset] = rawCodewords[rawCodewordsOffset++];
		}
	}
	return result;
}

module.exports = DataBlock;

},{}],28:[function(require,module,exports){
/*
  Ported to JavaScript by Lazar Laszlo 2011 
  
  lazarsoft@gmail.com, www.lazarsoft.info
  
*/

/*
*
* Copyright 2007 ZXing authors
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

var qrcode = require('./qrcode')();

function QRCodeDataBlockReader(blocks,  version,  numErrorCorrectionCode)
{
  this.blockPointer = 0;
  this.bitPointer = 7;
  this.dataLength = 0;
  this.blocks = blocks;
  this.numErrorCorrectionCode = numErrorCorrectionCode;
  if (version <= 9)
    this.dataLengthMode = 0;
  else if (version >= 10 && version <= 26)
    this.dataLengthMode = 1;
  else if (version >= 27 && version <= 40)
    this.dataLengthMode = 2;
    
  this.getNextBits = function( numBits)
    {      
      var bits = 0;
      if (numBits < this.bitPointer + 1)
      {
        // next word fits into current data block
        var mask = 0;
        for (var i = 0; i < numBits; i++)
        {
          mask += (1 << i);
        }
        mask <<= (this.bitPointer - numBits + 1);
        
        bits = (this.blocks[this.blockPointer] & mask) >> (this.bitPointer - numBits + 1);
        this.bitPointer -= numBits;
        return bits;
      }
      else if (numBits < this.bitPointer + 1 + 8)
      {
        // next word crosses 2 data blocks
        var mask1 = 0;
        for (var i = 0; i < this.bitPointer + 1; i++)
        {
          mask1 += (1 << i);
        }
        bits = (this.blocks[this.blockPointer] & mask1) << (numBits - (this.bitPointer + 1));
                this.blockPointer++;
        bits += ((this.blocks[this.blockPointer]) >> (8 - (numBits - (this.bitPointer + 1))));
        
        this.bitPointer = this.bitPointer - numBits % 8;
        if (this.bitPointer < 0)
        {
          this.bitPointer = 8 + this.bitPointer;
        }
        return bits;
      }
      else if (numBits < this.bitPointer + 1 + 16)
      {
        // next word crosses 3 data blocks
        var mask1 = 0; // mask of first block
        var mask3 = 0; // mask of 3rd block
        //bitPointer + 1 : number of bits of the 1st block
        //8 : number of the 2nd block (note that use already 8bits because next word uses 3 data blocks)
        //numBits - (bitPointer + 1 + 8) : number of bits of the 3rd block 
        for (var i = 0; i < this.bitPointer + 1; i++)
        {
          mask1 += (1 << i);
        }
        var bitsFirstBlock = (this.blocks[this.blockPointer] & mask1) << (numBits - (this.bitPointer + 1));
        this.blockPointer++;
        
        var bitsSecondBlock = this.blocks[this.blockPointer] << (numBits - (this.bitPointer + 1 + 8));
        this.blockPointer++;
        
        for (var i = 0; i < numBits - (this.bitPointer + 1 + 8); i++)
        {
          mask3 += (1 << i);
        }
        mask3 <<= 8 - (numBits - (this.bitPointer + 1 + 8));
        var bitsThirdBlock = (this.blocks[this.blockPointer] & mask3) >> (8 - (numBits - (this.bitPointer + 1 + 8)));
        
        bits = bitsFirstBlock + bitsSecondBlock + bitsThirdBlock;
        this.bitPointer = this.bitPointer - (numBits - 8) % 8;
        if (this.bitPointer < 0)
        {
          this.bitPointer = 8 + this.bitPointer;
        }
        return bits;
      }
      else
      {
        return 0;
      }
    }
  this.NextMode=function()
  {
    if ((this.blockPointer > this.blocks.length - this.numErrorCorrectionCode - 2))
      return 0;
    else
      return this.getNextBits(4);
  }
  this.getDataLength=function( modeIndicator)
    {
      var index = 0;
      while (true)
      {
        if ((modeIndicator >> index) == 1)
          break;
        index++;
      }
      
      return this.getNextBits(qrcode.sizeOfDataLengthInfo[this.dataLengthMode][index]);
    }
  this.getRomanAndFigureString=function( dataLength)
    {
      var length = dataLength;
      var intData = 0;
      var strData = "";
      var tableRomanAndFigure = new Array('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', ' ', '$', '%', '*', '+', '-', '.', '/', ':');
      do 
      {
        if (length > 1)
        {
          intData = this.getNextBits(11);
          var firstLetter = Math.floor(intData / 45);
          var secondLetter = intData % 45;
          strData += tableRomanAndFigure[firstLetter];
          strData += tableRomanAndFigure[secondLetter];
          length -= 2;
        }
        else if (length == 1)
        {
          intData = this.getNextBits(6);
          strData += tableRomanAndFigure[intData];
          length -= 1;
        }
      }
      while (length > 0);
      
      return strData;
    }
  this.getFigureString=function( dataLength)
    {
      var length = dataLength;
      var intData = 0;
      var strData = "";
      do 
      {
        if (length >= 3)
        {
          intData = this.getNextBits(10);
          if (intData < 100)
            strData += "0";
          if (intData < 10)
            strData += "0";
          length -= 3;
        }
        else if (length == 2)
        {
          intData = this.getNextBits(7);
          if (intData < 10)
            strData += "0";
          length -= 2;
        }
        else if (length == 1)
        {
          intData = this.getNextBits(4);
          length -= 1;
        }
        strData += intData;
      }
      while (length > 0);
      
      return strData;
    }
  this.get8bitByteArray=function( dataLength)
    {
      var length = dataLength;
      var intData = 0;
      var output = new Array();
      
      do 
      {
        intData = this.getNextBits(8);
        output.push( intData);
        length--;
      }
      while (length > 0);
      return output;
    }
    this.getKanjiString=function( dataLength)
    {
      var length = dataLength;
      var intData = 0;
      var unicodeString = "";
      do 
      {
        intData = getNextBits(13);
        var lowerByte = intData % 0xC0;
        var higherByte = intData / 0xC0;
        
        var tempWord = (higherByte << 8) + lowerByte;
        var shiftjisWord = 0;
        if (tempWord + 0x8140 <= 0x9FFC)
        {
          // between 8140 - 9FFC on Shift_JIS character set
          shiftjisWord = tempWord + 0x8140;
        }
        else
        {
          // between E040 - EBBF on Shift_JIS character set
          shiftjisWord = tempWord + 0xC140;
        }
        
        //var tempByte = new Array(0,0);
        //tempByte[0] = (sbyte) (shiftjisWord >> 8);
        //tempByte[1] = (sbyte) (shiftjisWord & 0xFF);
        //unicodeString += new String(SystemUtils.ToCharArray(SystemUtils.ToByteArray(tempByte)));
                unicodeString += String.fromCharCode(shiftjisWord);
        length--;
      }
      while (length > 0);
      
      
      return unicodeString;
    }

  this.__defineGetter__("DataByte", function()
  {
    var output = new Array();
    var MODE_NUMBER = 1;
      var MODE_ROMAN_AND_NUMBER = 2;
      var MODE_8BIT_BYTE = 4;
      var MODE_KANJI = 8;
    do 
          {
            var mode = this.NextMode();
            //canvas.println("mode: " + mode);
            if (mode == 0)
            {
              if (output.length > 0)
                break;
              else
                throw "Empty data block";
            }
            //if (mode != 1 && mode != 2 && mode != 4 && mode != 8)
            //  break;
            //}
            if (mode != MODE_NUMBER && mode != MODE_ROMAN_AND_NUMBER && mode != MODE_8BIT_BYTE && mode != MODE_KANJI)
            {
              /*          canvas.println("Invalid mode: " + mode);
              mode = guessMode(mode);
              canvas.println("Guessed mode: " + mode); */
              throw "Invalid mode: " + mode + " in (block:" + this.blockPointer + " bit:" + this.bitPointer + ")";
            }
            dataLength = this.getDataLength(mode);
            if (dataLength < 1)
              throw "Invalid data length: " + dataLength;
            //canvas.println("length: " + dataLength);
            switch (mode)
            {
              
              case MODE_NUMBER: 
                //canvas.println("Mode: Figure");
                var temp_str = this.getFigureString(dataLength);
                var ta = new Array(temp_str.length);
                for(var j=0;j<temp_str.length;j++)
                  ta[j]=temp_str.charCodeAt(j);
                output.push(ta);
                break;
              
              case MODE_ROMAN_AND_NUMBER: 
                //canvas.println("Mode: Roman&Figure");
                var temp_str = this.getRomanAndFigureString(dataLength);
                var ta = new Array(temp_str.length);
                for(var j=0;j<temp_str.length;j++)
                  ta[j]=temp_str.charCodeAt(j);
                output.push(ta );
                //output.Write(SystemUtils.ToByteArray(temp_sbyteArray2), 0, temp_sbyteArray2.Length);
                break;
              
              case MODE_8BIT_BYTE: 
                //canvas.println("Mode: 8bit Byte");
                //sbyte[] temp_sbyteArray3;
                var temp_sbyteArray3 = this.get8bitByteArray(dataLength);
                output.push(temp_sbyteArray3);
                //output.Write(SystemUtils.ToByteArray(temp_sbyteArray3), 0, temp_sbyteArray3.Length);
                break;
              
              case MODE_KANJI: 
                //canvas.println("Mode: Kanji");
                //sbyte[] temp_sbyteArray4;
                //temp_sbyteArray4 = SystemUtils.ToSByteArray(SystemUtils.ToByteArray(getKanjiString(dataLength)));
                //output.Write(SystemUtils.ToByteArray(temp_sbyteArray4), 0, temp_sbyteArray4.Length);
                                var temp_str = this.getKanjiString(dataLength);
                output.push(temp_str);
                break;
              }
            //      
            //canvas.println("DataLength: " + dataLength);
            //Console.out.println(dataString);
          }
          while (true);
    return output;
  });
}

module.exports = QRCodeDataBlockReader;
},{"./qrcode":39}],29:[function(require,module,exports){
/*
  Ported to JavaScript by Lazar Laszlo 2011 
  
  lazarsoft@gmail.com, www.lazarsoft.info
  
*/

/*
*
* Copyright 2007 ZXing authors
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

var qrcode = require('./qrcode')();

var DataMask = {};

DataMask.forReference = function(reference)
{
  if (reference < 0 || reference > 7)
  {
    throw "System.ArgumentException";
  }
  return DataMask.DATA_MASKS[reference];
}

function DataMask000()
{
  this.unmaskBitMatrix=function(bits,  dimension)
  {
    for (var i = 0; i < dimension; i++)
    {
      for (var j = 0; j < dimension; j++)
      {
        if (this.isMasked(i, j))
        {
          bits.flip(j, i);
        }
      }
    }
  }
  this.isMasked=function( i,  j)
  {
    return ((i + j) & 0x01) == 0;
  }
}

function DataMask001()
{
  this.unmaskBitMatrix=function(bits,  dimension)
  {
    for (var i = 0; i < dimension; i++)
    {
      for (var j = 0; j < dimension; j++)
      {
        if (this.isMasked(i, j))
        {
          bits.flip(j, i);
        }
      }
    }
  }
  this.isMasked=function( i,  j)
  {
    return (i & 0x01) == 0;
  }
}

function DataMask010()
{
  this.unmaskBitMatrix=function(bits,  dimension)
  {
    for (var i = 0; i < dimension; i++)
    {
      for (var j = 0; j < dimension; j++)
      {
        if (this.isMasked(i, j))
        {
          bits.flip(j, i);
        }
      }
    }
  }
  this.isMasked=function( i,  j)
  {
    return j % 3 == 0;
  }
}

function DataMask011()
{
  this.unmaskBitMatrix=function(bits,  dimension)
  {
    for (var i = 0; i < dimension; i++)
    {
      for (var j = 0; j < dimension; j++)
      {
        if (this.isMasked(i, j))
        {
          bits.flip(j, i);
        }
      }
    }
  }
  this.isMasked=function( i,  j)
  {
    return (i + j) % 3 == 0;
  }
}

function DataMask100()
{
  this.unmaskBitMatrix=function(bits,  dimension)
  {
    for (var i = 0; i < dimension; i++)
    {
      for (var j = 0; j < dimension; j++)
      {
        if (this.isMasked(i, j))
        {
          bits.flip(j, i);
        }
      }
    }
  }
  this.isMasked=function( i,  j)
  {
    return (((qrcode.URShift(i, 1)) + (j / 3)) & 0x01) == 0;
  }
}

function DataMask101()
{
  this.unmaskBitMatrix=function(bits,  dimension)
  {
    for (var i = 0; i < dimension; i++)
    {
      for (var j = 0; j < dimension; j++)
      {
        if (this.isMasked(i, j))
        {
          bits.flip(j, i);
        }
      }
    }
  }
  this.isMasked=function( i,  j)
  {
    var temp = i * j;
    return (temp & 0x01) + (temp % 3) == 0;
  }
}

function DataMask110()
{
  this.unmaskBitMatrix=function(bits,  dimension)
  {
    for (var i = 0; i < dimension; i++)
    {
      for (var j = 0; j < dimension; j++)
      {
        if (this.isMasked(i, j))
        {
          bits.flip(j, i);
        }
      }
    }
  }
  this.isMasked=function( i,  j)
  {
    var temp = i * j;
    return (((temp & 0x01) + (temp % 3)) & 0x01) == 0;
  }
}
function DataMask111()
{
  this.unmaskBitMatrix=function(bits,  dimension)
  {
    for (var i = 0; i < dimension; i++)
    {
      for (var j = 0; j < dimension; j++)
      {
        if (this.isMasked(i, j))
        {
          bits.flip(j, i);
        }
      }
    }
  }
  this.isMasked=function( i,  j)
  {
    return ((((i + j) & 0x01) + ((i * j) % 3)) & 0x01) == 0;
  }
}

DataMask.DATA_MASKS = new Array(new DataMask000(), new DataMask001(), new DataMask010(), new DataMask011(), new DataMask100(), new DataMask101(), new DataMask110(), new DataMask111());

module.exports = DataMask;
},{"./qrcode":39}],30:[function(require,module,exports){
/*
  Ported to JavaScript by Lazar Laszlo 2011 
  
  lazarsoft@gmail.com, www.lazarsoft.info
  
*/

/*
*
* Copyright 2007 ZXing authors
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

var DataBlock = require('./datablock');
var BitMatrixParser = require('./bmparser');
var ReedSolomonDecoder = require('./rsdecoder');
var GF256 = require('./gf256');
var QRCodeDataBlockReader = require('./databr')

var Decoder = {};
Decoder.rsDecoder = new ReedSolomonDecoder(GF256.QR_CODE_FIELD);

Decoder.correctErrors=function( codewordBytes,  numDataCodewords)
{
  var numCodewords = codewordBytes.length;
  // First read into an array of ints
  var codewordsInts = new Array(numCodewords);
  for (var i = 0; i < numCodewords; i++)
  {
    codewordsInts[i] = codewordBytes[i] & 0xFF;
  }
  var numECCodewords = codewordBytes.length - numDataCodewords;
  try
  {
    Decoder.rsDecoder.decode(codewordsInts, numECCodewords);
    //var corrector = new ReedSolomon(codewordsInts, numECCodewords);
    //corrector.correct();
  }
  catch ( rse)
  {
    throw rse;
  }
  // Copy back into array of bytes -- only need to worry about the bytes that were data
  // We don't care about errors in the error-correction codewords
  for (var i = 0; i < numDataCodewords; i++)
  {
    codewordBytes[i] =  codewordsInts[i];
  }
}

Decoder.decode=function(bits)
{
  var parser = new BitMatrixParser(bits);
  var version = parser.readVersion();
  var ecLevel = parser.readFormatInformation().ErrorCorrectionLevel;
  
  // Read codewords
  var codewords = parser.readCodewords();

  // Separate into data blocks
  var dataBlocks = DataBlock.getDataBlocks(codewords, version, ecLevel);
  
  // Count total number of data bytes
  var totalBytes = 0;
  for (var i = 0; i < dataBlocks.Length; i++)
  {
    totalBytes += dataBlocks[i].NumDataCodewords;
  }
  var resultBytes = new Array(totalBytes);
  var resultOffset = 0;
  
  // Error-correct and copy data blocks together into a stream of bytes
  for (var j = 0; j < dataBlocks.length; j++)
  {
    var dataBlock = dataBlocks[j];
    var codewordBytes = dataBlock.Codewords;
    var numDataCodewords = dataBlock.NumDataCodewords;
    Decoder.correctErrors(codewordBytes, numDataCodewords);
    for (var i = 0; i < numDataCodewords; i++)
    {
      resultBytes[resultOffset++] = codewordBytes[i];
    }
  }
  
  // Decode the contents of that stream of bytes
  var reader = new QRCodeDataBlockReader(resultBytes, version.VersionNumber, ecLevel.Bits);
  return reader;
  //return DecodedBitStreamParser.decode(resultBytes, version, ecLevel);
}


module.exports = Decoder;
},{"./bmparser":26,"./datablock":27,"./databr":28,"./gf256":35,"./rsdecoder":40}],31:[function(require,module,exports){
/*
  Ported to JavaScript by Lazar Laszlo 2011 
  
  lazarsoft@gmail.com, www.lazarsoft.info
  
*/

/*
*
* Copyright 2007 ZXing authors
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

var grid = require('./grid');
var Version = require('./version');
var PerspectiveTransform = require('./perspective-transform');
var qrcode = require('./qrcode')();
var AlignmentPatternFinder = require('./alignpat');
var FinderPatternFinder = require('./findpat');

function DetectorResult(bits,  points)
{
  this.bits = bits;
  this.points = points;
}


function Detector(image)
{
  this.image=image;
  this.resultPointCallback = null;
  
  this.sizeOfBlackWhiteBlackRun=function( fromX,  fromY,  toX,  toY)
    {
      // Mild variant of Bresenham's algorithm;
      // see http://en.wikipedia.org/wiki/Bresenham's_line_algorithm
      var steep = Math.abs(toY - fromY) > Math.abs(toX - fromX);
      if (steep)
      {
        var temp = fromX;
        fromX = fromY;
        fromY = temp;
        temp = toX;
        toX = toY;
        toY = temp;
      }
      
      var dx = Math.abs(toX - fromX);
      var dy = Math.abs(toY - fromY);
      var error = - dx >> 1;
      var ystep = fromY < toY?1:- 1;
      var xstep = fromX < toX?1:- 1;
      var state = 0; // In black pixels, looking for white, first or second time
      for (var x = fromX, y = fromY; x != toX; x += xstep)
      {
        
        var realX = steep?y:x;
        var realY = steep?x:y;
        if (state == 1)
        {
          // In white pixels, looking for black
          if (this.image[realX + realY*qrcode.width])
          {
            state++;
          }
        }
        else
        {
          if (!this.image[realX + realY*qrcode.width])
          {
            state++;
          }
        }
        
        if (state == 3)
        {
          // Found black, white, black, and stumbled back onto white; done
          var diffX = x - fromX;
          var diffY = y - fromY;
          return  Math.sqrt( (diffX * diffX + diffY * diffY));
        }
        error += dy;
        if (error > 0)
        {
          if (y == toY)
          {
            break;
          }
          y += ystep;
          error -= dx;
        }
      }
      var diffX2 = toX - fromX;
      var diffY2 = toY - fromY;
      return  Math.sqrt( (diffX2 * diffX2 + diffY2 * diffY2));
    }

  
  this.sizeOfBlackWhiteBlackRunBothWays=function( fromX,  fromY,  toX,  toY)
    {
      
      var result = this.sizeOfBlackWhiteBlackRun(fromX, fromY, toX, toY);
      
      // Now count other way -- don't run off image though of course
      var scale = 1.0;
      var otherToX = fromX - (toX - fromX);
      if (otherToX < 0)
      {
        scale =  fromX /  (fromX - otherToX);
        otherToX = 0;
      }
      else if (otherToX >= qrcode.width)
      {
        scale =  (qrcode.width - 1 - fromX) /  (otherToX - fromX);
        otherToX = qrcode.width - 1;
      }
      var otherToY = Math.floor (fromY - (toY - fromY) * scale);
      
      scale = 1.0;
      if (otherToY < 0)
      {
        scale =  fromY /  (fromY - otherToY);
        otherToY = 0;
      }
      else if (otherToY >= qrcode.height)
      {
        scale =  (qrcode.height - 1 - fromY) /  (otherToY - fromY);
        otherToY = qrcode.height - 1;
      }
      otherToX = Math.floor (fromX + (otherToX - fromX) * scale);
      
      result += this.sizeOfBlackWhiteBlackRun(fromX, fromY, otherToX, otherToY);
      return result - 1.0; // -1 because we counted the middle pixel twice
    }
    

  
  this.calculateModuleSizeOneWay=function( pattern,  otherPattern)
    {
      var moduleSizeEst1 = this.sizeOfBlackWhiteBlackRunBothWays(Math.floor( pattern.X), Math.floor( pattern.Y), Math.floor( otherPattern.X), Math.floor(otherPattern.Y));
      var moduleSizeEst2 = this.sizeOfBlackWhiteBlackRunBothWays(Math.floor(otherPattern.X), Math.floor(otherPattern.Y), Math.floor( pattern.X), Math.floor(pattern.Y));
      if (isNaN(moduleSizeEst1))
      {
        return moduleSizeEst2 / 7.0;
      }
      if (isNaN(moduleSizeEst2))
      {
        return moduleSizeEst1 / 7.0;
      }
      // Average them, and divide by 7 since we've counted the width of 3 black modules,
      // and 1 white and 1 black module on either side. Ergo, divide sum by 14.
      return (moduleSizeEst1 + moduleSizeEst2) / 14.0;
    }

  
  this.calculateModuleSize=function( topLeft,  topRight,  bottomLeft)
    {
      // Take the average
      return (this.calculateModuleSizeOneWay(topLeft, topRight) + this.calculateModuleSizeOneWay(topLeft, bottomLeft)) / 2.0;
    }

  this.distance=function( pattern1,  pattern2)
  {
    xDiff = pattern1.X - pattern2.X;
    yDiff = pattern1.Y - pattern2.Y;
    return  Math.sqrt( (xDiff * xDiff + yDiff * yDiff));
  }
  this.computeDimension=function( topLeft,  topRight,  bottomLeft,  moduleSize)
    {
      
      var tltrCentersDimension = Math.round(this.distance(topLeft, topRight) / moduleSize);
      var tlblCentersDimension = Math.round(this.distance(topLeft, bottomLeft) / moduleSize);
      var dimension = ((tltrCentersDimension + tlblCentersDimension) >> 1) + 7;
      switch (dimension & 0x03)
      {
        
        // mod 4
        case 0: 
          dimension++;
          break;
          // 1? do nothing
        
        case 2: 
          dimension--;
          break;
        
        case 3: 
          throw "Error";
        }
      return dimension;
    }

  this.findAlignmentInRegion=function( overallEstModuleSize,  estAlignmentX,  estAlignmentY,  allowanceFactor)
    {
      // Look for an alignment pattern (3 modules in size) around where it
      // should be
      var allowance = Math.floor (allowanceFactor * overallEstModuleSize);
      var alignmentAreaLeftX = Math.max(0, estAlignmentX - allowance);
      var alignmentAreaRightX = Math.min(qrcode.width - 1, estAlignmentX + allowance);
      if (alignmentAreaRightX - alignmentAreaLeftX < overallEstModuleSize * 3)
      {
        throw "Error";
      }
      
      var alignmentAreaTopY = Math.max(0, estAlignmentY - allowance);
      var alignmentAreaBottomY = Math.min(qrcode.height - 1, estAlignmentY + allowance);
      
      var alignmentFinder = new AlignmentPatternFinder(this.image, alignmentAreaLeftX, alignmentAreaTopY, alignmentAreaRightX - alignmentAreaLeftX, alignmentAreaBottomY - alignmentAreaTopY, overallEstModuleSize, this.resultPointCallback);
      return alignmentFinder.find();
    }
    
  this.createTransform=function( topLeft,  topRight,  bottomLeft, alignmentPattern, dimension)
    {
      var dimMinusThree =  dimension - 3.5;
      var bottomRightX;
      var bottomRightY;
      var sourceBottomRightX;
      var sourceBottomRightY;
      if (alignmentPattern != null)
      {
        bottomRightX = alignmentPattern.X;
        bottomRightY = alignmentPattern.Y;
        sourceBottomRightX = sourceBottomRightY = dimMinusThree - 3.0;
      }
      else
      {
        // Don't have an alignment pattern, just make up the bottom-right point
        bottomRightX = (topRight.X - topLeft.X) + bottomLeft.X;
        bottomRightY = (topRight.Y - topLeft.Y) + bottomLeft.Y;
        sourceBottomRightX = sourceBottomRightY = dimMinusThree;
      }
      
      var transform = PerspectiveTransform.quadrilateralToQuadrilateral(3.5, 3.5, dimMinusThree, 3.5, sourceBottomRightX, sourceBottomRightY, 3.5, dimMinusThree, topLeft.X, topLeft.Y, topRight.X, topRight.Y, bottomRightX, bottomRightY, bottomLeft.X, bottomLeft.Y);
      
      return transform;
    }    
  
  this.sampleGrid = function( image,  transform,  dimension)
    {
      
      var sampler = grid;
      return sampler.sampleGrid3(image, dimension, transform);
    }
  
  this.processFinderPatternInfo = function( info)
    {
      
      var topLeft = info.TopLeft;
      var topRight = info.TopRight;
      var bottomLeft = info.BottomLeft;
      
      var moduleSize = this.calculateModuleSize(topLeft, topRight, bottomLeft);
      if (moduleSize < 1.0)
      {
        throw "Error";
      }
      var dimension = this.computeDimension(topLeft, topRight, bottomLeft, moduleSize);
      var provisionalVersion = Version.getProvisionalVersionForDimension(dimension);
      var modulesBetweenFPCenters = provisionalVersion.DimensionForVersion - 7;
      
      var alignmentPattern = null;
      // Anything above version 1 has an alignment pattern
      if (provisionalVersion.AlignmentPatternCenters.length > 0)
      {
        
        // Guess where a "bottom right" finder pattern would have been
        var bottomRightX = topRight.X - topLeft.X + bottomLeft.X;
        var bottomRightY = topRight.Y - topLeft.Y + bottomLeft.Y;
        
        // Estimate that alignment pattern is closer by 3 modules
        // from "bottom right" to known top left location
        var correctionToTopLeft = 1.0 - 3.0 /  modulesBetweenFPCenters;
        var estAlignmentX = Math.floor (topLeft.X + correctionToTopLeft * (bottomRightX - topLeft.X));
        var estAlignmentY = Math.floor (topLeft.Y + correctionToTopLeft * (bottomRightY - topLeft.Y));
        
        // Kind of arbitrary -- expand search radius before giving up
        for (var i = 4; i <= 16; i <<= 1)
        {
          //try
          //{
            alignmentPattern = this.findAlignmentInRegion(moduleSize, estAlignmentX, estAlignmentY,  i);
            break;
          //}
          //catch (re)
          //{
            // try next round
          //}
        }
        // If we didn't find alignment pattern... well try anyway without it
      }
      
      var transform = this.createTransform(topLeft, topRight, bottomLeft, alignmentPattern, dimension);
      
      var bits = this.sampleGrid(this.image, transform, dimension);
      
      var points;
      if (alignmentPattern == null)
      {
        points = new Array(bottomLeft, topLeft, topRight);
      }
      else
      {
        points = new Array(bottomLeft, topLeft, topRight, alignmentPattern);
      }
      return new DetectorResult(bits, points);
    }
  
  this.detect = function() {
    var info =  new FinderPatternFinder().findFinderPattern(this.image);
    return this.processFinderPatternInfo(info);
  }
}

module.exports = Detector;
},{"./alignpat":24,"./findpat":33,"./grid":37,"./perspective-transform":38,"./qrcode":39,"./version":41}],32:[function(require,module,exports){
/*
  Ported to JavaScript by Lazar Laszlo 2011 
  
  lazarsoft@gmail.com, www.lazarsoft.info
  
*/

/*
*
* Copyright 2007 ZXing authors
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/


function ErrorCorrectionLevel(ordinal,  bits, name)
{
	this.ordinal_Renamed_Field = ordinal;
	this.bits = bits;
	this.name = name;
	this.__defineGetter__("Bits", function()
	{
		return this.bits;
	});
	this.__defineGetter__("Name", function()
	{
		return this.name;
	});
	this.ordinal=function()
	{
		return this.ordinal_Renamed_Field;
	}
}

ErrorCorrectionLevel.forBits=function( bits)
{
	if (bits < 0 || bits >= FOR_BITS.Length)
	{
		throw "ArgumentException";
	}
	return FOR_BITS[bits];
}

var L = new ErrorCorrectionLevel(0, 0x01, "L");
var M = new ErrorCorrectionLevel(1, 0x00, "M");
var Q = new ErrorCorrectionLevel(2, 0x03, "Q");
var H = new ErrorCorrectionLevel(3, 0x02, "H");
var FOR_BITS = new Array( M, L, H, Q);

module.exports = ErrorCorrectionLevel;
},{}],33:[function(require,module,exports){
/*
  Ported to JavaScript by Lazar Laszlo 2011 
  
  lazarsoft@gmail.com, www.lazarsoft.info
  
*/

/*
*
* Copyright 2007 ZXing authors
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

var qrcode = require('./qrcode')();
var assert = require('assert');


var MIN_SKIP = 3;
var MAX_MODULES = 57;
var INTEGER_MATH_SHIFT = 8;
var CENTER_QUORUM = 2;

qrcode.orderBestPatterns = function(patterns)
    {
      
      function distance( pattern1,  pattern2)
      {
        xDiff = pattern1.X - pattern2.X;
        yDiff = pattern1.Y - pattern2.Y;
        return  Math.sqrt( (xDiff * xDiff + yDiff * yDiff));
      }
      
      /// <summary> Returns the z component of the cross product between vectors BC and BA.</summary>
      function crossProductZ( pointA,  pointB,  pointC)
      {
        var bX = pointB.x;
        var bY = pointB.y;
        return ((pointC.x - bX) * (pointA.y - bY)) - ((pointC.y - bY) * (pointA.x - bX));
      }

      
      // Find distances between pattern centers
      var zeroOneDistance = distance(patterns[0], patterns[1]);
      var oneTwoDistance = distance(patterns[1], patterns[2]);
      var zeroTwoDistance = distance(patterns[0], patterns[2]);
      
      var pointA, pointB, pointC;
      // Assume one closest to other two is B; A and C will just be guesses at first
      if (oneTwoDistance >= zeroOneDistance && oneTwoDistance >= zeroTwoDistance)
      {
        pointB = patterns[0];
        pointA = patterns[1];
        pointC = patterns[2];
      }
      else if (zeroTwoDistance >= oneTwoDistance && zeroTwoDistance >= zeroOneDistance)
      {
        pointB = patterns[1];
        pointA = patterns[0];
        pointC = patterns[2];
      }
      else
      {
        pointB = patterns[2];
        pointA = patterns[0];
        pointC = patterns[1];
      }
      
      // Use cross product to figure out whether A and C are correct or flipped.
      // This asks whether BC x BA has a positive z component, which is the arrangement
      // we want for A, B, C. If it's negative, then we've got it flipped around and
      // should swap A and C.
      if (crossProductZ(pointA, pointB, pointC) < 0.0)
      {
        var temp = pointA;
        pointA = pointC;
        pointC = temp;
      }
      
      patterns[0] = pointA;
      patterns[1] = pointB;
      patterns[2] = pointC;
    }


function FinderPattern(posX, posY,  estimatedModuleSize)
{
  this.x=posX;
  this.y=posY;
  this.count = 1;
  this.estimatedModuleSize = estimatedModuleSize;
  
  this.__defineGetter__("EstimatedModuleSize", function()
  {
    return this.estimatedModuleSize;
  }); 
  this.__defineGetter__("Count", function()
  {
    return this.count;
  });
  this.__defineGetter__("X", function()
  {
    return this.x;
  });
  this.__defineGetter__("Y", function()
  {
    return this.y;
  });
  this.incrementCount = function()
  {
    this.count++;
  }
  this.aboutEquals=function( moduleSize,  i,  j)
    {
      if (Math.abs(i - this.y) <= moduleSize && Math.abs(j - this.x) <= moduleSize)
      {
        var moduleSizeDiff = Math.abs(moduleSize - this.estimatedModuleSize);
        return moduleSizeDiff <= 1.0 || moduleSizeDiff / this.estimatedModuleSize <= 1.0;
      }
      return false;
    }
  
}

function FinderPatternInfo(patternCenters)
{
  this.bottomLeft = patternCenters[0];
  this.topLeft = patternCenters[1];
  this.topRight = patternCenters[2];
  this.__defineGetter__("BottomLeft", function()
  {
    return this.bottomLeft;
  }); 
  this.__defineGetter__("TopLeft", function()
  {
    return this.topLeft;
  }); 
  this.__defineGetter__("TopRight", function()
  {
    return this.topRight;
  }); 
}

function FinderPatternFinder()
{
  this.image=null;
  this.possibleCenters = [];
  this.hasSkipped = false;
  this.crossCheckStateCount = new Array(0,0,0,0,0);
  this.resultPointCallback = null;
  
  this.__defineGetter__("CrossCheckStateCount", function()
  {
    this.crossCheckStateCount[0] = 0;
    this.crossCheckStateCount[1] = 0;
    this.crossCheckStateCount[2] = 0;
    this.crossCheckStateCount[3] = 0;
    this.crossCheckStateCount[4] = 0;
    return this.crossCheckStateCount;
  }); 
  
  this.foundPatternCross=function( stateCount)
    {
      var totalModuleSize = 0;
      for (var i = 0; i < 5; i++)
      {
        var count = stateCount[i];
        if (count == 0)
        {
          return false;
        }
        totalModuleSize += count;
      }
      if (totalModuleSize < 7)
      {
        return false;
      }
      var moduleSize = Math.floor((totalModuleSize << INTEGER_MATH_SHIFT) / 7);
      var maxVariance = Math.floor(moduleSize / 2);
      // Allow less than 50% variance from 1-1-3-1-1 proportions
      return Math.abs(moduleSize - (stateCount[0] << INTEGER_MATH_SHIFT)) < maxVariance && Math.abs(moduleSize - (stateCount[1] << INTEGER_MATH_SHIFT)) < maxVariance && Math.abs(3 * moduleSize - (stateCount[2] << INTEGER_MATH_SHIFT)) < 3 * maxVariance && Math.abs(moduleSize - (stateCount[3] << INTEGER_MATH_SHIFT)) < maxVariance && Math.abs(moduleSize - (stateCount[4] << INTEGER_MATH_SHIFT)) < maxVariance;
    }
  this.centerFromEnd=function( stateCount,  end)
    {
      return  (end - stateCount[4] - stateCount[3]) - stateCount[2] / 2.0;
    }
  this.crossCheckVertical=function( startI,  centerJ,  maxCount,  originalStateCountTotal)
    {
      var image = this.image;
      
      var maxI = qrcode.height;
      var stateCount = this.CrossCheckStateCount;
      
      // Start counting up from center
      var i = startI;
      while (i >= 0 && image[centerJ + i*qrcode.width])
      {
        stateCount[2]++;
        i--;
      }
      if (i < 0)
      {
        return NaN;
      }
      while (i >= 0 && !image[centerJ +i*qrcode.width] && stateCount[1] <= maxCount)
      {
        stateCount[1]++;
        i--;
      }
      // If already too many modules in this state or ran off the edge:
      if (i < 0 || stateCount[1] > maxCount)
      {
        return NaN;
      }
      while (i >= 0 && image[centerJ + i*qrcode.width] && stateCount[0] <= maxCount)
      {
        stateCount[0]++;
        i--;
      }
      if (stateCount[0] > maxCount)
      {
        return NaN;
      }
      
      // Now also count down from center
      i = startI + 1;
      while (i < maxI && image[centerJ +i*qrcode.width])
      {
        stateCount[2]++;
        i++;
      }
      if (i == maxI)
      {
        return NaN;
      }
      while (i < maxI && !image[centerJ + i*qrcode.width] && stateCount[3] < maxCount)
      {
        stateCount[3]++;
        i++;
      }
      if (i == maxI || stateCount[3] >= maxCount)
      {
        return NaN;
      }
      while (i < maxI && image[centerJ + i*qrcode.width] && stateCount[4] < maxCount)
      {
        stateCount[4]++;
        i++;
      }
      if (stateCount[4] >= maxCount)
      {
        return NaN;
      }
      
      // If we found a finder-pattern-like section, but its size is more than 40% different than
      // the original, assume it's a false positive
      var stateCountTotal = stateCount[0] + stateCount[1] + stateCount[2] + stateCount[3] + stateCount[4];
      if (5 * Math.abs(stateCountTotal - originalStateCountTotal) >= 2 * originalStateCountTotal)
      {
        return NaN;
      }
      
      return this.foundPatternCross(stateCount)?this.centerFromEnd(stateCount, i):NaN;
    }
  this.crossCheckHorizontal=function( startJ,  centerI,  maxCount, originalStateCountTotal)
    {
      var image = this.image;
      
      var maxJ = qrcode.width;
      var stateCount = this.CrossCheckStateCount;
      
      var j = startJ;
      while (j >= 0 && image[j+ centerI*qrcode.width])
      {
        stateCount[2]++;
        j--;
      }
      if (j < 0)
      {
        return NaN;
      }
      while (j >= 0 && !image[j+ centerI*qrcode.width] && stateCount[1] <= maxCount)
      {
        stateCount[1]++;
        j--;
      }
      if (j < 0 || stateCount[1] > maxCount)
      {
        return NaN;
      }
      while (j >= 0 && image[j+ centerI*qrcode.width] && stateCount[0] <= maxCount)
      {
        stateCount[0]++;
        j--;
      }
      if (stateCount[0] > maxCount)
      {
        return NaN;
      }
      
      j = startJ + 1;
      while (j < maxJ && image[j+ centerI*qrcode.width])
      {
        stateCount[2]++;
        j++;
      }
      if (j == maxJ)
      {
        return NaN;
      }
      while (j < maxJ && !image[j+ centerI*qrcode.width] && stateCount[3] < maxCount)
      {
        stateCount[3]++;
        j++;
      }
      if (j == maxJ || stateCount[3] >= maxCount)
      {
        return NaN;
      }
      while (j < maxJ && image[j+ centerI*qrcode.width] && stateCount[4] < maxCount)
      {
        stateCount[4]++;
        j++;
      }
      if (stateCount[4] >= maxCount)
      {
        return NaN;
      }
      
      // If we found a finder-pattern-like section, but its size is significantly different than
      // the original, assume it's a false positive
      var stateCountTotal = stateCount[0] + stateCount[1] + stateCount[2] + stateCount[3] + stateCount[4];
      if (5 * Math.abs(stateCountTotal - originalStateCountTotal) >= originalStateCountTotal)
      {
        return NaN;
      }
      
      return this.foundPatternCross(stateCount)?this.centerFromEnd(stateCount, j):NaN;
    }
  this.handlePossibleCenter = function( stateCount,  i,  j)
    {
      var stateCountTotal = stateCount[0] + stateCount[1] + stateCount[2] + stateCount[3] + stateCount[4];
      var centerJ = this.centerFromEnd(stateCount, j); //float
      var centerI = this.crossCheckVertical(i, Math.floor( centerJ), stateCount[2], stateCountTotal); //float
      if (!isNaN(centerI))
      {
        // Re-cross check
        centerJ = this.crossCheckHorizontal(Math.floor( centerJ), Math.floor( centerI), stateCount[2], stateCountTotal);
        if (!isNaN(centerJ))
        {
          var estimatedModuleSize =   stateCountTotal / 7.0;
          var found = false;
          var max = this.possibleCenters.length;
          for (var index = 0; index < max; index++)
          {
            var center = this.possibleCenters[index];
            // Look for about the same center and module size:
            if (center.aboutEquals(estimatedModuleSize, centerI, centerJ))
            {
              center.incrementCount();
              found = true;
              break;
            }
          }
          if (!found)
          {
            var point = new FinderPattern(centerJ, centerI, estimatedModuleSize);
            this.possibleCenters.push(point);
            if (this.resultPointCallback != null)
            {
              this.resultPointCallback.foundPossibleResultPoint(point);
            }
          }
          return true;
        }
      }
      return false;
    }
    
  this.selectBestPatterns = function()
    {
      
      var startSize = this.possibleCenters.length;
      if (startSize < 3)
      {
        // Couldn't find enough finder patterns
        throw new Error("Couldn't find enough finder patterns");
      }
      
      // Filter outlier possibilities whose module size is too different
      if (startSize > 3)
      {
        // But we can only afford to do so if we have at least 4 possibilities to choose from
        var totalModuleSize = 0.0;
        for (var i = 0; i < startSize; i++)
        {
          totalModuleSize +=  this.possibleCenters[i].EstimatedModuleSize;
        }
        var average = totalModuleSize /  startSize;
        for (var i = 0; i < this.possibleCenters.length && this.possibleCenters.length > 3; i++)
        {
          var pattern =  this.possibleCenters[i];
          if (Math.abs(pattern.EstimatedModuleSize - average) > 0.2 * average)
          {
            this.possibleCenters.remove(i);
            i--;
          }
        }
      }
      
      if (this.possibleCenters.Count > 3)
      {
        // Throw away all but those first size candidate points we found.
        //Collections.insertionSort(possibleCenters, new CenterComparator());
        //SupportClass.SetCapacity(possibleCenters, 3);
      }
      
      return new Array( this.possibleCenters[0],  this.possibleCenters[1],  this.possibleCenters[2]);
    }
    
  this.findRowSkip=function()
    {
      var max = this.possibleCenters.length;
      if (max <= 1)
      {
        return 0;
      }
      var firstConfirmedCenter = null;
      for (var i = 0; i < max; i++)
      {
        var center =  this.possibleCenters[i];
        if (center.Count >= CENTER_QUORUM)
        {
          if (firstConfirmedCenter == null)
          {
            firstConfirmedCenter = center;
          }
          else
          {
            // We have two confirmed centers
            // How far down can we skip before resuming looking for the next
            // pattern? In the worst case, only the difference between the
            // difference in the x / y coordinates of the two centers.
            // This is the case where you find top left last.
            this.hasSkipped = true;
            return Math.floor ((Math.abs(firstConfirmedCenter.X - center.X) - Math.abs(firstConfirmedCenter.Y - center.Y)) / 2);
          }
        }
      }
      return 0;
    }
  
  this.haveMultiplyConfirmedCenters=function()
    {
      var confirmedCount = 0;
      var totalModuleSize = 0.0;
      var max = this.possibleCenters.length;
      for (var i = 0; i < max; i++)
      {
        var pattern =  this.possibleCenters[i];
        if (pattern.Count >= CENTER_QUORUM)
        {
          confirmedCount++;
          totalModuleSize += pattern.EstimatedModuleSize;
        }
      }
      if (confirmedCount < 3)
      {
        return false;
      }
      // OK, we have at least 3 confirmed centers, but, it's possible that one is a "false positive"
      // and that we need to keep looking. We detect this by asking if the estimated module sizes
      // vary too much. We arbitrarily say that when the total deviation from average exceeds
      // 5% of the total module size estimates, it's too much.
      var average = totalModuleSize / max;
      var totalDeviation = 0.0;
      for (var i = 0; i < max; i++)
      {
        pattern = this.possibleCenters[i];
        totalDeviation += Math.abs(pattern.EstimatedModuleSize - average);
      }
      return totalDeviation <= 0.05 * totalModuleSize;
    }
    
  this.findFinderPattern = function(image){
    var tryHarder = false;
    this.image = image;
    var maxI = qrcode.height;
    var maxJ = qrcode.width;
    
    var iSkip = Math.floor((3 * maxI) / (4 * MAX_MODULES));
    if (iSkip < MIN_SKIP || tryHarder)
    {
        iSkip = MIN_SKIP;
    }
    
    var done = false;
    
    var stateCount = new Array(5);
    
    for (var i = iSkip - 1; i < maxI && !done; i += iSkip){
      // Get a row of black/white values
      stateCount[0] = 0;
      stateCount[1] = 0;
      stateCount[2] = 0;
      stateCount[3] = 0;
      stateCount[4] = 0;
      var currentState = 0;
      for (var j = 0; j < maxJ; j++)
      {
        if (image[j+i*qrcode.width] )
        {
          // Black pixel
          if ((currentState & 1) == 1)
          {
            // Counting white pixels
            currentState++;
          }
          stateCount[currentState]++;
        }
        else
        {
          // White pixel
          if ((currentState & 1) == 0)
          {
            // Counting black pixels
            if (currentState == 4)
            {
              // A winner?
              if (this.foundPatternCross(stateCount))
              {
                // Yes
                var confirmed = this.handlePossibleCenter(stateCount, i, j);
                if (confirmed)
                {
                  // Start examining every other line. Checking each line turned out to be too
                  // expensive and didn't improve performance.
                  iSkip = 2;
                  if (this.hasSkipped)
                  {
                    done = this.haveMultiplyConfirmedCenters();
                  }
                  else
                  {
                    var rowSkip = this.findRowSkip();
                    if (rowSkip > stateCount[2])
                    {
                      // Skip rows between row of lower confirmed center
                      // and top of presumed third confirmed center
                      // but back up a bit to get a full chance of detecting
                      // it, entire width of center of finder pattern
                      
                      // Skip by rowSkip, but back off by stateCount[2] (size of last center
                      // of pattern we saw) to be conservative, and also back off by iSkip which
                      // is about to be re-added
                      i += rowSkip - stateCount[2] - iSkip;
                      j = maxJ - 1;
                    }
                  }
                }
                else
                {
                  // Advance to next black pixel
                  do 
                  {
                    j++;
                  }
                  while (j < maxJ && !image[j + i*qrcode.width]);
                  j--; // back up to that last white pixel
                }
                // Clear state to start looking again
                currentState = 0;
                stateCount[0] = 0;
                stateCount[1] = 0;
                stateCount[2] = 0;
                stateCount[3] = 0;
                stateCount[4] = 0;
              }
              else
              {
                // No, shift counts back by two
                stateCount[0] = stateCount[2];
                stateCount[1] = stateCount[3];
                stateCount[2] = stateCount[4];
                stateCount[3] = 1;
                stateCount[4] = 0;
                currentState = 3;
              }
            }
            else
            {
              stateCount[++currentState]++;
            }
          }
          else
          {
            // Counting white pixels
            stateCount[currentState]++;
          }
        }
      }
      if (this.foundPatternCross(stateCount))
      {
        var confirmed = this.handlePossibleCenter(stateCount, i, maxJ);
        if (confirmed)
        {
          iSkip = stateCount[0];
          if (this.hasSkipped)
          {
            // Found a third one
            done = haveMultiplyConfirmedCenters();
          }
        }
      }
    }
    
    var patternInfo = this.selectBestPatterns();
    qrcode.orderBestPatterns(patternInfo);
    
    return new FinderPatternInfo(patternInfo);
  };
}

module.exports = FinderPatternFinder;
},{"./qrcode":39,"assert":64}],34:[function(require,module,exports){
/*
  Ported to JavaScript by Lazar Laszlo 2011 
  
  lazarsoft@gmail.com, www.lazarsoft.info
  
*/

/*
*
* Copyright 2007 ZXing authors
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

var ErrorCorrectionLevel = require('./errorlevel');
var qrcode = require('./qrcode')();


var FORMAT_INFO_MASK_QR = 0x5412;
var FORMAT_INFO_DECODE_LOOKUP = new Array(new Array(0x5412, 0x00), new Array(0x5125, 0x01), new Array(0x5E7C, 0x02), new Array(0x5B4B, 0x03), new Array(0x45F9, 0x04), new Array(0x40CE, 0x05), new Array(0x4F97, 0x06), new Array(0x4AA0, 0x07), new Array(0x77C4, 0x08), new Array(0x72F3, 0x09), new Array(0x7DAA, 0x0A), new Array(0x789D, 0x0B), new Array(0x662F, 0x0C), new Array(0x6318, 0x0D), new Array(0x6C41, 0x0E), new Array(0x6976, 0x0F), new Array(0x1689, 0x10), new Array(0x13BE, 0x11), new Array(0x1CE7, 0x12), new Array(0x19D0, 0x13), new Array(0x0762, 0x14), new Array(0x0255, 0x15), new Array(0x0D0C, 0x16), new Array(0x083B, 0x17), new Array(0x355F, 0x18), new Array(0x3068, 0x19), new Array(0x3F31, 0x1A), new Array(0x3A06, 0x1B), new Array(0x24B4, 0x1C), new Array(0x2183, 0x1D), new Array(0x2EDA, 0x1E), new Array(0x2BED, 0x1F));
var BITS_SET_IN_HALF_BYTE = new Array(0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4);


function FormatInformation(formatInfo)
{
	this.errorCorrectionLevel = ErrorCorrectionLevel.forBits((formatInfo >> 3) & 0x03);
	this.dataMask =  (formatInfo & 0x07);

	this.__defineGetter__("ErrorCorrectionLevel", function()
	{
		return this.errorCorrectionLevel;
	});
	this.__defineGetter__("DataMask", function()
	{
		return this.dataMask;
	});
	this.GetHashCode=function()
	{
		return (this.errorCorrectionLevel.ordinal() << 3) |  dataMask;
	}
	this.Equals=function( o)
	{
		var other =  o;
		return this.errorCorrectionLevel == other.errorCorrectionLevel && this.dataMask == other.dataMask;
	}
}

FormatInformation.numBitsDiffering=function( a,  b)
{
	a ^= b; // a now has a 1 bit exactly where its bit differs with b's
	// Count bits set quickly with a series of lookups:
	return BITS_SET_IN_HALF_BYTE[a & 0x0F]
	  + BITS_SET_IN_HALF_BYTE[(qrcode.URShift(a, 4) & 0x0F)]
	  + BITS_SET_IN_HALF_BYTE[(qrcode.URShift(a, 8) & 0x0F)]
	  + BITS_SET_IN_HALF_BYTE[(qrcode.URShift(a, 12) & 0x0F)]
	  + BITS_SET_IN_HALF_BYTE[(qrcode.URShift(a, 16) & 0x0F)]
	  + BITS_SET_IN_HALF_BYTE[(qrcode.URShift(a, 20) & 0x0F)]
	  + BITS_SET_IN_HALF_BYTE[(qrcode.URShift(a, 24) & 0x0F)]
	  + BITS_SET_IN_HALF_BYTE[(qrcode.URShift(a, 28) & 0x0F)];
}

FormatInformation.decodeFormatInformation=function( maskedFormatInfo)
{
	var formatInfo = FormatInformation.doDecodeFormatInformation(maskedFormatInfo);
	if (formatInfo != null)
	{
		return formatInfo;
	}
	// Should return null, but, some QR codes apparently
	// do not mask this info. Try again by actually masking the pattern
	// first
	return FormatInformation.doDecodeFormatInformation(maskedFormatInfo ^ FORMAT_INFO_MASK_QR);
}
FormatInformation.doDecodeFormatInformation=function( maskedFormatInfo)
{
	// Find the int in FORMAT_INFO_DECODE_LOOKUP with fewest bits differing
	var bestDifference = 0xffffffff;
	var bestFormatInfo = 0;
	for (var i = 0; i < FORMAT_INFO_DECODE_LOOKUP.length; i++)
	{
		var decodeInfo = FORMAT_INFO_DECODE_LOOKUP[i];
		var targetInfo = decodeInfo[0];
		if (targetInfo == maskedFormatInfo)
		{
			// Found an exact match
			return new FormatInformation(decodeInfo[1]);
		}
		var bitsDifference = this.numBitsDiffering(maskedFormatInfo, targetInfo);
		if (bitsDifference < bestDifference)
		{
			bestFormatInfo = decodeInfo[1];
			bestDifference = bitsDifference;
		}
	}
	// Hamming distance of the 32 masked codes is 7, by construction, so <= 3 bits
	// differing means we found a match
	if (bestDifference <= 3)
	{
		return new FormatInformation(bestFormatInfo);
	}
	return null;
}


module.exports = FormatInformation;
},{"./errorlevel":32,"./qrcode":39}],35:[function(require,module,exports){
/*
  Ported to JavaScript by Lazar Laszlo 2011 
  
  lazarsoft@gmail.com, www.lazarsoft.info
  
*/

/*
*
* Copyright 2007 ZXing authors
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/


var GF256Poly = null;

var GF256 = null;

module.exports = GF256 = function( primitive)
{
  this.expTable = new Array(256);
  this.logTable = new Array(256);
  // delayed dep injection
  if(!GF256Poly) GF256Poly = require('./gf256poly');
  var x = 1;
  for (var i = 0; i < 256; i++)
  {
    this.expTable[i] = x;
    x <<= 1; // x = x * 2; we're assuming the generator alpha is 2
    if (x >= 0x100)
    {
      x ^= primitive;
    }
  }
  for (var i = 0; i < 255; i++)
  {
    this.logTable[this.expTable[i]] = i;
  }
  // logTable[0] == 0 but this should never be used
  var at0=new Array(1);at0[0]=0;
  this.zero = new GF256Poly(this, new Array(at0));
  var at1=new Array(1);at1[0]=1;
  this.one = new GF256Poly(this, new Array(at1));
  
  this.__defineGetter__("Zero", function()
  {
    return this.zero;
  });
  this.__defineGetter__("One", function()
  {
    return this.one;
  });
  this.buildMonomial=function( degree,  coefficient)
    {
      if (degree < 0)
      {
        throw "System.ArgumentException";
      }
      if (coefficient == 0)
      {
        return zero;
      }
      var coefficients = new Array(degree + 1);
      for(var i=0;i<coefficients.length;i++)coefficients[i]=0;
      coefficients[0] = coefficient;
      return new GF256Poly(this, coefficients);
    }
  this.exp=function(a)
    {
      return this.expTable[a];
    }
  this.log=function(a)
    {
      if (a == 0)
      {
        throw "System.ArgumentException";
      }
      return this.logTable[a];
    }
  this.inverse=function(a)
    {
      if (a == 0)
      {
        throw "System.ArithmeticException";
      }
      return this.expTable[255 - this.logTable[a]];
    }
  this.multiply=function(a, b) {
    if (a == 0 || b == 0) return 0;
    else if (a == 1) return b;
    else if (b == 1) return a;
    return this.expTable[(this.logTable[a] + this.logTable[b]) % 255];
  }
}

GF256.QR_CODE_FIELD = new GF256(0x011D);
GF256.DATA_MATRIX_FIELD = new GF256(0x012D);

GF256.addOrSubtract = function(a, b) {
  return a ^ b;
}

},{"./gf256poly":36}],36:[function(require,module,exports){
/*
  Ported to JavaScript by Lazar Laszlo 2011 
  
  lazarsoft@gmail.com, www.lazarsoft.info
  
*/

/*
*
* Copyright 2007 ZXing authors
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

var GF256 = null;

function GF256Poly(field,  coefficients)
{
  if (coefficients == null || coefficients.length == 0) 
    throw new Error("GF256Poly bad arguments. no coefficients provided");
  if(!GF256) GF256 = require('./gf256');
  this.field = field;
  var coefficientsLength = coefficients.length;
  if (coefficientsLength > 1 && coefficients[0] == 0)
  {
    // Leading term must be non-zero for anything except the constant polynomial "0"
    var firstNonZero = 1;
    while (firstNonZero < coefficientsLength && coefficients[firstNonZero] == 0)
    {
      firstNonZero++;
    }
    if (firstNonZero == coefficientsLength)
    {
      this.coefficients = field.Zero.coefficients;
    }
    else
    {
      this.coefficients = new Array(coefficientsLength - firstNonZero);
      for(var i=0;i<this.coefficients.length;i++)this.coefficients[i]=0;
      //Array.Copy(coefficients, firstNonZero, this.coefficients, 0, this.coefficients.length);
      for(var ci=0;ci<this.coefficients.length;ci++)this.coefficients[ci]=coefficients[firstNonZero+ci];
    }
  }
  else
  {
    this.coefficients = coefficients;
  }
  
  this.__defineGetter__("Zero", function()
  {
    return this.coefficients[0] == 0;
  });
  this.__defineGetter__("Degree", function()
  {
    return this.coefficients.length - 1;
  });
  this.__defineGetter__("Coefficients", function()
  {
    return this.coefficients;
  });
  
  this.getCoefficient=function( degree)
  {
    return this.coefficients[this.coefficients.length - 1 - degree];
  }
  
  this.evaluateAt=function( a)
  {
    if (a == 0)
    {
      // Just return the x^0 coefficient
      return this.getCoefficient(0);
    }
    var size = this.coefficients.length;
    if (a == 1)
    {
      // Just the sum of the coefficients
      var result = 0;
      for (var i = 0; i < size; i++) {
        result = GF256.addOrSubtract(result, this.coefficients[i]);
      }
      return result;
    }
    var result2 = this.coefficients[0];
    for (var i = 1; i < size; i++)
    {
      result2 = GF256.addOrSubtract(this.field.multiply(a, result2), this.coefficients[i]);
    }
    return result2;
  }
  
  this.addOrSubtract = function( other)
    {
      if (this.field != other.field)
      {
        throw "GF256Polys do not have same GF256 field";
      }
      if (this.Zero)
      {
        return other;
      }
      if (other.Zero)
      {
        return this;
      }
      
      var smallerCoefficients = this.coefficients;
      var largerCoefficients = other.coefficients;
      if (smallerCoefficients.length > largerCoefficients.length)
      {
        var temp = smallerCoefficients;
        smallerCoefficients = largerCoefficients;
        largerCoefficients = temp;
      }
      var sumDiff = new Array(largerCoefficients.length);
      var lengthDiff = largerCoefficients.length - smallerCoefficients.length;
      // Copy high-order terms only found in higher-degree polynomial's coefficients
      //Array.Copy(largerCoefficients, 0, sumDiff, 0, lengthDiff);
      for(var ci=0;ci<lengthDiff;ci++)sumDiff[ci]=largerCoefficients[ci];
      
      for (var i = lengthDiff; i < largerCoefficients.length; i++)
      {
        sumDiff[i] = GF256.addOrSubtract(smallerCoefficients[i - lengthDiff], largerCoefficients[i]);
      }
      
      return new GF256Poly(field, sumDiff);
  }
  this.multiply1=function( other)
    {
      if (this.field!=other.field)
      {
        throw "GF256Polys do not have same GF256 field";
      }
      if (this.Zero || other.Zero)
      {
        return this.field.Zero;
      }
      var aCoefficients = this.coefficients;
      var aLength = aCoefficients.length;
      var bCoefficients = other.coefficients;
      var bLength = bCoefficients.length;
      var product = new Array(aLength + bLength - 1);
      for (var i = 0; i < aLength; i++)
      {
        var aCoeff = aCoefficients[i];
        for (var j = 0; j < bLength; j++)
        {
          product[i + j] = GF256.addOrSubtract(product[i + j], this.field.multiply(aCoeff, bCoefficients[j]));
        }
      }
      return new GF256Poly(this.field, product);
    }
  this.multiply2=function( scalar)
    {
      if (scalar == 0)
      {
        return this.field.Zero;
      }
      if (scalar == 1)
      {
        return this;
      }
      var size = this.coefficients.length;
      var product = new Array(size);
      for (var i = 0; i < size; i++)
      {
        product[i] = this.field.multiply(this.coefficients[i], scalar);
      }
      return new GF256Poly(this.field, product);
    }
  this.multiplyByMonomial=function( degree,  coefficient)
    {
      if (degree < 0)
      {
        throw "System.ArgumentException";
      }
      if (coefficient == 0)
      {
        return this.field.Zero;
      }
      var size = this.coefficients.length;
      var product = new Array(size + degree);
      for(var i=0;i<product.length;i++)product[i]=0;
      for (var i = 0; i < size; i++)
      {
        product[i] = this.field.multiply(this.coefficients[i], coefficient);
      }
      return new GF256Poly(this.field, product);
    }
  this.divide=function( other)
    {
      if (this.field!=other.field)
      {
        throw "GF256Polys do not have same GF256 field";
      }
      if (other.Zero)
      {
        throw "Divide by 0";
      }
      
      var quotient = this.field.Zero;
      var remainder = this;
      
      var denominatorLeadingTerm = other.getCoefficient(other.Degree);
      var inverseDenominatorLeadingTerm = this.field.inverse(denominatorLeadingTerm);
      
      while (remainder.Degree >= other.Degree && !remainder.Zero)
      {
        var degreeDifference = remainder.Degree - other.Degree;
        var scale = this.field.multiply(remainder.getCoefficient(remainder.Degree), inverseDenominatorLeadingTerm);
        var term = other.multiplyByMonomial(degreeDifference, scale);
        var iterationQuotient = this.field.buildMonomial(degreeDifference, scale);
        quotient = quotient.addOrSubtract(iterationQuotient);
        remainder = remainder.addOrSubtract(term);
      }
      
      return new Array(quotient, remainder);
    }
}

module.exports = GF256Poly;
},{"./gf256":35}],37:[function(require,module,exports){
/*
  Ported to JavaScript by Lazar Laszlo 2011 
  
  lazarsoft@gmail.com, www.lazarsoft.info
  
*/

/*
*
* Copyright 2007 ZXing authors
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

var PerspectiveTransform = require('./perspective-transform');
var BitMatrix = require('./bitmat');
var qrcode = require('./qrcode')();

GridSampler = {};

GridSampler.checkAndNudgePoints=function( image,  points) {
  var width = qrcode.width;
  var height = qrcode.height;
  // Check and nudge points from start until we see some that are OK:
  var nudged = true;
  for (var offset = 0; offset < points.Length && nudged; offset += 2) {
    var x = Math.floor (points[offset]);
    var y = Math.floor( points[offset + 1]);
    if (x < - 1 || x > width || y < - 1 || y > height)
        {
          throw "Error.checkAndNudgePoints ";
        }
        nudged = false;
        if (x == - 1)
        {
          points[offset] = 0.0;
          nudged = true;
        }
        else if (x == width)
        {
          points[offset] = width - 1;
          nudged = true;
        }
        if (y == - 1)
        {
          points[offset + 1] = 0.0;
          nudged = true;
        }
        else if (y == height)
        {
          points[offset + 1] = height - 1;
          nudged = true;
        }
      }
      // Check and nudge points from end:
      nudged = true;
      for (var offset = points.Length - 2; offset >= 0 && nudged; offset -= 2)
      {
        var x = Math.floor( points[offset]);
        var y = Math.floor( points[offset + 1]);
        if (x < - 1 || x > width || y < - 1 || y > height)
        {
          throw "Error.checkAndNudgePoints ";
        }
        nudged = false;
        if (x == - 1)
        {
          points[offset] = 0.0;
          nudged = true;
        }
        else if (x == width)
        {
          points[offset] = width - 1;
          nudged = true;
        }
        if (y == - 1)
        {
          points[offset + 1] = 0.0;
          nudged = true;
        }
        else if (y == height)
        {
          points[offset + 1] = height - 1;
          nudged = true;
        }
      }
    }
  


GridSampler.sampleGrid3 = function( image,  dimension,  transform)
    {
      var bits = new BitMatrix(dimension);
      var points = new Array(dimension << 1);
      for (var y = 0; y < dimension; y++)
      {
        var max = points.length;
        var iValue =  y + 0.5;
        for (var x = 0; x < max; x += 2)
        {
          points[x] =  (x >> 1) + 0.5;
          points[x + 1] = iValue;
        }
        transform.transformPoints1(points);
        // Quick check to see if points transformed to something inside the image;
        // sufficient to check the endpoints
        GridSampler.checkAndNudgePoints(image, points);
        try
        {
          for (var x = 0; x < max; x += 2)
          {
            var xpoint = (Math.floor( points[x]) * 4) + (Math.floor( points[x + 1]) * qrcode.width * 4);
                        var bit = image[Math.floor( points[x])+ qrcode.width* Math.floor( points[x + 1])];
            qrcode.imagedata.data[xpoint] = bit?255:0;
            qrcode.imagedata.data[xpoint+1] = bit?255:0;
            qrcode.imagedata.data[xpoint+2] = 0;
            qrcode.imagedata.data[xpoint+3] = 255;
            //bits[x >> 1][ y]=bit;
            if(bit)
              bits.set_Renamed(x >> 1, y);
          }
        }
        catch ( aioobe)
        {
          // This feels wrong, but, sometimes if the finder patterns are misidentified, the resulting
          // transform gets "twisted" such that it maps a straight line of points to a set of points
          // whose endpoints are in bounds, but others are not. There is probably some mathematical
          // way to detect this about the transformation that I don't know yet.
          // This results in an ugly runtime exception despite our clever checks above -- can't have
          // that. We could check each point's coordinates but that feels duplicative. We settle for
          // catching and wrapping ArrayIndexOutOfBoundsException.
          throw "Error.checkAndNudgePoints";
        }
      }
      return bits;
    }

GridSampler.sampleGridx = function( image,  dimension,  p1ToX,  p1ToY,  p2ToX,  p2ToY,  p3ToX,  p3ToY,  p4ToX,  p4ToY,  p1FromX,  p1FromY,  p2FromX,  p2FromY,  p3FromX,  p3FromY,  p4FromX,  p4FromY)
{
  var transform = PerspectiveTransform.quadrilateralToQuadrilateral(p1ToX, p1ToY, p2ToX, p2ToY, p3ToX, p3ToY, p4ToX, p4ToY, p1FromX, p1FromY, p2FromX, p2FromY, p3FromX, p3FromY, p4FromX, p4FromY);
      
  return GridSampler.sampleGrid3(image, dimension, transform);
}

module.exports = GridSampler
},{"./bitmat":25,"./perspective-transform":38,"./qrcode":39}],38:[function(require,module,exports){
function PerspectiveTransform( a11,  a21,  a31,  a12,  a22,  a32,  a13,  a23,  a33)
{
	this.a11 = a11;
	this.a12 = a12;
	this.a13 = a13;
	this.a21 = a21;
	this.a22 = a22;
	this.a23 = a23;
	this.a31 = a31;
	this.a32 = a32;
	this.a33 = a33;
	this.transformPoints1=function( points)
		{
			var max = points.length;
			var a11 = this.a11;
			var a12 = this.a12;
			var a13 = this.a13;
			var a21 = this.a21;
			var a22 = this.a22;
			var a23 = this.a23;
			var a31 = this.a31;
			var a32 = this.a32;
			var a33 = this.a33;
			for (var i = 0; i < max; i += 2)
			{
				var x = points[i];
				var y = points[i + 1];
				var denominator = a13 * x + a23 * y + a33;
				points[i] = (a11 * x + a21 * y + a31) / denominator;
				points[i + 1] = (a12 * x + a22 * y + a32) / denominator;
			}
		}
	this. transformPoints2=function(xValues, yValues)
		{
			var n = xValues.length;
			for (var i = 0; i < n; i++)
			{
				var x = xValues[i];
				var y = yValues[i];
				var denominator = this.a13 * x + this.a23 * y + this.a33;
				xValues[i] = (this.a11 * x + this.a21 * y + this.a31) / denominator;
				yValues[i] = (this.a12 * x + this.a22 * y + this.a32) / denominator;
			}
		}

	this.buildAdjoint=function()
		{
			// Adjoint is the transpose of the cofactor matrix:
			return new PerspectiveTransform(this.a22 * this.a33 - this.a23 * this.a32, this.a23 * this.a31 - this.a21 * this.a33, this.a21 * this.a32 - this.a22 * this.a31, this.a13 * this.a32 - this.a12 * this.a33, this.a11 * this.a33 - this.a13 * this.a31, this.a12 * this.a31 - this.a11 * this.a32, this.a12 * this.a23 - this.a13 * this.a22, this.a13 * this.a21 - this.a11 * this.a23, this.a11 * this.a22 - this.a12 * this.a21);
		}
	this.times=function( other)
		{
			return new PerspectiveTransform(this.a11 * other.a11 + this.a21 * other.a12 + this.a31 * other.a13, this.a11 * other.a21 + this.a21 * other.a22 + this.a31 * other.a23, this.a11 * other.a31 + this.a21 * other.a32 + this.a31 * other.a33, this.a12 * other.a11 + this.a22 * other.a12 + this.a32 * other.a13, this.a12 * other.a21 + this.a22 * other.a22 + this.a32 * other.a23, this.a12 * other.a31 + this.a22 * other.a32 + this.a32 * other.a33, this.a13 * other.a11 + this.a23 * other.a12 +this.a33 * other.a13, this.a13 * other.a21 + this.a23 * other.a22 + this.a33 * other.a23, this.a13 * other.a31 + this.a23 * other.a32 + this.a33 * other.a33);
		}

}

PerspectiveTransform.quadrilateralToQuadrilateral=function( x0,  y0,  x1,  y1,  x2,  y2,  x3,  y3,  x0p,  y0p,  x1p,  y1p,  x2p,  y2p,  x3p,  y3p)
{
	
	var qToS = this.quadrilateralToSquare(x0, y0, x1, y1, x2, y2, x3, y3);
	var sToQ = this.squareToQuadrilateral(x0p, y0p, x1p, y1p, x2p, y2p, x3p, y3p);
	return sToQ.times(qToS);
}

PerspectiveTransform.squareToQuadrilateral=function( x0,  y0,  x1,  y1,  x2,  y2,  x3,  y3)
{
	 dy2 = y3 - y2;
	 dy3 = y0 - y1 + y2 - y3;
	if (dy2 == 0.0 && dy3 == 0.0)
	{
		return new PerspectiveTransform(x1 - x0, x2 - x1, x0, y1 - y0, y2 - y1, y0, 0.0, 0.0, 1.0);
	}
	else
	{
		 dx1 = x1 - x2;
		 dx2 = x3 - x2;
		 dx3 = x0 - x1 + x2 - x3;
		 dy1 = y1 - y2;
		 denominator = dx1 * dy2 - dx2 * dy1;
		 a13 = (dx3 * dy2 - dx2 * dy3) / denominator;
		 a23 = (dx1 * dy3 - dx3 * dy1) / denominator;
		return new PerspectiveTransform(x1 - x0 + a13 * x1, x3 - x0 + a23 * x3, x0, y1 - y0 + a13 * y1, y3 - y0 + a23 * y3, y0, a13, a23, 1.0);
	}
}

PerspectiveTransform.quadrilateralToSquare=function( x0,  y0,  x1,  y1,  x2,  y2,  x3,  y3)
{
	// Here, the adjoint serves as the inverse:
	return this.squareToQuadrilateral(x0, y0, x1, y1, x2, y2, x3, y3).buildAdjoint();
}

module.exports = PerspectiveTransform
},{}],39:[function(require,module,exports){
/*
   Copyright 2011 Lazar Laszlo (lazarsoft@gmail.com, www.lazarsoft.info)
   
   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

var qrcode = null;

module.exports = function(Canvas){
  // if the qrcode instance exists, return it
  if(qrcode) return qrcode;
  // if not, create it, then return it
  qrcode = {};
  var Image = null, isCanvas = null, createCanvas = null;
  
  if(typeof window!='undefined') {
    // we're in the browser
    if(typeof HTMLCanvasElement !== 'undefined' ){
      createCanvas = function(width,height){
        var canvas = document.createElement("canvas");
        canvas.setAttribute('width', width);
        canvas.setAttribute('height', height);
        return canvas;
      }
    }else throw new Error("the HTML5 Canvas element is not supported in "
      + "this browser");
    Image = window.Image;
    if(!Image) throw new Error("the Image element is not supported in "
      + "this browser");
    isCanvas = function(instance){
      return instance instanceof HTMLCanvasElement;
    }
  }else{
    // // on the server!
    createCanvas = function(width,height){
      return new Canvas(width,height);
    }
    isCanvas = function(instance){
      return instance instanceof Canvas;
    }
    var s = require; //trick browserify into not including canvas
    if(!Canvas) Canvas = s('canvas');
    Image = Canvas.Image;
  }
  
  var Decoder = require('./decoder');
  var grid = require('./grid');
  var Detector = require('./detector');

  // TODO: remove this. should avoid extending built in types
  Array.prototype.remove = function(from, to) {
    var rest = this.slice((to || from) + 1 || this.length);
    this.length = from < 0 ? this.length + from : from;
    return this.push.apply(this, rest);
  };


  qrcode.imagedata = null;
  qrcode.width = 0;
  qrcode.height = 0;
  qrcode.qrCodeSymbol = null;
  qrcode.debug = false;

  qrcode.sizeOfDataLengthInfo =  [  [ 10, 9, 8, 8 ],  [ 12, 11, 16, 10 ],  [ 14, 13, 16, 12 ] ];

  qrcode.decode = function(src){
    var canvas_qr = null
        , context = null;
    if( isCanvas(src) ){
      canvas_qr = src;
      context = canvas_qr.getContext('2d');
      qrcode.width = canvas_qr.width;
      qrcode.height = canvas_qr.height;
      qrcode.imagedata = context.getImageData(0, 0, qrcode.width, qrcode.height);
      return qrcode.process(context);
    }else if( src instanceof Image){
      return imageLoaded(src);
    }else{
      throw new Error('jsqrcode can only decode a canvas or image element');
    }
    function imageLoaded(image){
      canvas_qr = createCanvas(image.width, image.height);
      context = canvas_qr.getContext('2d');
      var canvas_out = createCanvas(image.width, image.height);
      if(canvas_out!==null){
        var outctx = canvas_out.getContext('2d');
        outctx.clearRect(0, 0, 320, 240);
        outctx.drawImage(image, 0, 0, 320, 240);
      }
      qrcode.width = canvas_qr.width;
      qrcode.height = canvas_qr.height;
      context.drawImage(image, 0, 0,canvas_qr.width,canvas_qr.height);
      try{
        qrcode.imagedata = context.getImageData(0, 0, canvas_qr.width, canvas_qr.height);
      }catch(e){
        throw new Error("Cross domain image reading not supported in your "
          + "browser! Save it to your computer then drag and drop the file!");
      }
      return qrcode.process(context);
    }
  }

  qrcode.decode_utf8 = function ( s ) {
    return decodeURIComponent( escape( s ) );
  }

  qrcode.process = function(ctx){
    var start = new Date().getTime();
    var image = qrcode.grayScaleToBitmap(qrcode.grayscale());
    //var image = qrcode.binarize(128);
    if(qrcode.debug){
      for (var y = 0; y < qrcode.height; y++) {
        for (var x = 0; x < qrcode.width; x++) {
          var point = (x * 4) + (y * qrcode.width * 4);
          qrcode.imagedata.data[point] = image[x+y*qrcode.width]?0:0;
          qrcode.imagedata.data[point+1] = image[x+y*qrcode.width]?0:0;
          qrcode.imagedata.data[point+2] = image[x+y*qrcode.width]?255:0;
        }
      }
      ctx.putImageData(qrcode.imagedata, 0, 0);
    }
    var detector = new Detector(image);
    var qRCodeMatrix = detector.detect();
    if(qrcode.debug) ctx.putImageData(qrcode.imagedata, 0, 0);
    var reader = Decoder.decode(qRCodeMatrix.bits);
    var data = reader.DataByte;
    var str="";
    for(var i=0;i<data.length;i++) {
      for(var j=0;j<data[i].length;j++){
        str+=String.fromCharCode(data[i][j]);
      }
    }
    var end = new Date().getTime();
    var time = end - start;

    return qrcode.decode_utf8(str);
    // console.log("Time:" + time + " Code: "+str);
  }

  qrcode.getPixel = function(x,y){
    if (qrcode.width < x) throw "point error";
    if (qrcode.height < y) throw "point error";

    point = (x * 4) + (y * qrcode.width * 4);
    p = (qrcode.imagedata.data[point]*33 + qrcode.imagedata.data[point + 1]*34 + qrcode.imagedata.data[point + 2]*33)/100;
    return p;
  }

  qrcode.binarize = function(th) {
    var ret = new Array(qrcode.width*qrcode.height);
    for (var y = 0; y < qrcode.height; y++) {
      for (var x = 0; x < qrcode.width; x++) {
        var gray = qrcode.getPixel(x, y);
        ret[x+y*qrcode.width] = gray<=th ? true : false;
      }
    }
    return ret;
  }

  qrcode.getMiddleBrightnessPerArea=function(image) {
    var numSqrtArea = 4;
    // obtain middle brightness((min + max) / 2) per area
    var areaWidth = Math.floor(qrcode.width / numSqrtArea);
    var areaHeight = Math.floor(qrcode.height / numSqrtArea);
    var minmax = new Array(numSqrtArea);
    for (var i = 0; i < numSqrtArea; i++) {
      minmax[i] = new Array(numSqrtArea);
      for (var i2 = 0; i2 < numSqrtArea; i2++) {
        minmax[i][i2] = new Array(0,0);
      }
    }
    for (var ay = 0; ay < numSqrtArea; ay++) {
      for (var ax = 0; ax < numSqrtArea; ax++) {
        minmax[ax][ay][0] = 0xFF;
        for (var dy = 0; dy < areaHeight; dy++) {
          for (var dx = 0; dx < areaWidth; dx++) {
            var target = image[areaWidth * ax + dx + (areaHeight * ay + dy) * qrcode.width];
            if (target < minmax[ax][ay][0])
              minmax[ax][ay][0] = target;
            if (target > minmax[ax][ay][1])
              minmax[ax][ay][1] = target;
          }
        }
        // minmax[ax][ay][0] = (minmax[ax][ay][0] + minmax[ax][ay][1]) / 2;
      }
    }
    var middle = new Array(numSqrtArea);
    for (var i3 = 0; i3 < numSqrtArea; i3++) {
      middle[i3] = new Array(numSqrtArea);
    }
    for (var ay = 0; ay < numSqrtArea; ay++) {
      for (var ax = 0; ax < numSqrtArea; ax++) {
        middle[ax][ay] = Math.floor((minmax[ax][ay][0] + minmax[ax][ay][1]) / 2);
        // console.log(middle[ax][ay] + ",");
      }
      // console.log("");
    }
    // console.log("")
    return middle;
  }

  qrcode.grayScaleToBitmap = function(grayScale) {
    var middle = qrcode.getMiddleBrightnessPerArea(grayScale);
    var sqrtNumArea = middle.length;
    var areaWidth = Math.floor(qrcode.width / sqrtNumArea);
    var areaHeight = Math.floor(qrcode.height / sqrtNumArea);
    var bitmap = new Array(qrcode.height*qrcode.width);
    for (var ay = 0; ay < sqrtNumArea; ay++) {
      for (var ax = 0; ax < sqrtNumArea; ax++) {
        for (var dy = 0; dy < areaHeight; dy++) {
          for (var dx = 0; dx < areaWidth; dx++) {
            bitmap[areaWidth * ax + dx+ (areaHeight * ay + dy)*qrcode.width] = (grayScale[areaWidth * ax + dx+ (areaHeight * ay + dy)*qrcode.width] < middle[ax][ay])?true:false;
          }
        }
      }
    }
    return bitmap;
  }

  qrcode.grayscale = function(){
    var ret = new Array(qrcode.width*qrcode.height);
    for (var y = 0; y < qrcode.height; y++) {
      for (var x = 0; x < qrcode.width; x++) {
        var gray = qrcode.getPixel(x, y);
        ret[x+y*qrcode.width] = gray;
      }
    }
    return ret;
  }


  qrcode.URShift = function( number,  bits) {
    if (number >= 0)
      return number >> bits;
    else
      return (number >> bits) + (2 << ~bits);
  }
  return qrcode;
}
},{"./decoder":30,"./detector":31,"./grid":37}],40:[function(require,module,exports){
/*
  Ported to JavaScript by Lazar Laszlo 2011 
  
  lazarsoft@gmail.com, www.lazarsoft.info
  
*/

/*
*
* Copyright 2007 ZXing authors
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

var GF256Poly = require('./gf256poly');
var GF256 = require('./gf256');

function ReedSolomonDecoder(field)
{
  this.field = field;
  this.decode=function(received,  twoS)
  {
      var poly = new GF256Poly(this.field, received);
      var syndromeCoefficients = new Array(twoS);
      for(var i=0;i<syndromeCoefficients.length;i++)syndromeCoefficients[i]=0;
      var dataMatrix = false;//this.field.Equals(GF256.DATA_MATRIX_FIELD);
      var noError = true;
      for (var i = 0; i < twoS; i++)
      {
        // Thanks to sanfordsquires for this fix:
        var eval = poly.evaluateAt(this.field.exp(dataMatrix?i + 1:i));
        syndromeCoefficients[syndromeCoefficients.length - 1 - i] = eval;
        if (eval != 0)
        {
          noError = false;
        }
      }
      if (noError)
      {
        return ;
      }
      var syndrome = new GF256Poly(this.field, syndromeCoefficients);
      var sigmaOmega = this.runEuclideanAlgorithm(this.field.buildMonomial(twoS, 1), syndrome, twoS);
      var sigma = sigmaOmega[0];
      var omega = sigmaOmega[1];
      var errorLocations = this.findErrorLocations(sigma);
      var errorMagnitudes = this.findErrorMagnitudes(omega, errorLocations, dataMatrix);
      for (var i = 0; i < errorLocations.length; i++)
      {
        var position = received.length - 1 - this.field.log(errorLocations[i]);
        if (position < 0)
        {
          throw "ReedSolomonException Bad error location";
        }
        received[position] = GF256.addOrSubtract(received[position], errorMagnitudes[i]);
      }
  }
  
  this.runEuclideanAlgorithm=function( a,  b,  R)
    {
      // Assume a's degree is >= b's
      if (a.Degree < b.Degree)
      {
        var temp = a;
        a = b;
        b = temp;
      }
      
      var rLast = a;
      var r = b;
      var sLast = this.field.One;
      var s = this.field.Zero;
      var tLast = this.field.Zero;
      var t = this.field.One;
      
      // Run Euclidean algorithm until r's degree is less than R/2
      while (r.Degree >= Math.floor(R / 2))
      {
        var rLastLast = rLast;
        var sLastLast = sLast;
        var tLastLast = tLast;
        rLast = r;
        sLast = s;
        tLast = t;
        
        // Divide rLastLast by rLast, with quotient in q and remainder in r
        if (rLast.Zero)
        {
          // Oops, Euclidean algorithm already terminated?
          throw "r_{i-1} was zero";
        }
        r = rLastLast;
        var q = this.field.Zero;
        var denominatorLeadingTerm = rLast.getCoefficient(rLast.Degree);
        var dltInverse = this.field.inverse(denominatorLeadingTerm);
        while (r.Degree >= rLast.Degree && !r.Zero)
        {
          var degreeDiff = r.Degree - rLast.Degree;
          var scale = this.field.multiply(r.getCoefficient(r.Degree), dltInverse);
          q = q.addOrSubtract(this.field.buildMonomial(degreeDiff, scale));
          r = r.addOrSubtract(rLast.multiplyByMonomial(degreeDiff, scale));
          //r.EXE();
        }
        
        s = q.multiply1(sLast).addOrSubtract(sLastLast);
        t = q.multiply1(tLast).addOrSubtract(tLastLast);
      }
      
      var sigmaTildeAtZero = t.getCoefficient(0);
      if (sigmaTildeAtZero == 0)
      {
        throw "ReedSolomonException sigmaTilde(0) was zero";
      }
      
      var inverse = this.field.inverse(sigmaTildeAtZero);
      var sigma = t.multiply2(inverse);
      var omega = r.multiply2(inverse);
      return new Array(sigma, omega);
    }
  this.findErrorLocations=function( errorLocator)
    {
      // This is a direct application of Chien's search
      var numErrors = errorLocator.Degree;
      if (numErrors == 1)
      {
        // shortcut
        return new Array(errorLocator.getCoefficient(1));
      }
      var result = new Array(numErrors);
      var e = 0;
      for (var i = 1; i < 256 && e < numErrors; i++)
      {
        if (errorLocator.evaluateAt(i) == 0)
        {
          result[e] = this.field.inverse(i);
          e++;
        }
      }
      if (e != numErrors)
      {
        throw "Error locator degree does not match number of roots";
      }
      return result;
    }
  this.findErrorMagnitudes=function( errorEvaluator,  errorLocations,  dataMatrix)
    {
      // This is directly applying Forney's Formula
      var s = errorLocations.length;
      var result = new Array(s);
      for (var i = 0; i < s; i++)
      {
        var xiInverse = this.field.inverse(errorLocations[i]);
        var denominator = 1;
        for (var j = 0; j < s; j++)
        {
          if (i != j)
          {
            denominator = this.field.multiply(denominator, GF256.addOrSubtract(1, this.field.multiply(errorLocations[j], xiInverse)));
          }
        }
        result[i] = this.field.multiply(errorEvaluator.evaluateAt(xiInverse), this.field.inverse(denominator));
        // Thanks to sanfordsquires for this fix:
        if (dataMatrix)
        {
          result[i] = this.field.multiply(result[i], xiInverse);
        }
      }
      return result;
    }
}

module.exports = ReedSolomonDecoder;
},{"./gf256":35,"./gf256poly":36}],41:[function(require,module,exports){
/*
  Ported to JavaScript by Lazar Laszlo 2011 
  
  lazarsoft@gmail.com, www.lazarsoft.info
  
*/

/*
*
* Copyright 2007 ZXing authors
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

var BitMatrix = require('./bitmat');


function ECB(count,  dataCodewords)
{
  this.count = count;
  this.dataCodewords = dataCodewords;
  
  this.__defineGetter__("Count", function()
  {
    return this.count;
  });
  this.__defineGetter__("DataCodewords", function()
  {
    return this.dataCodewords;
  });
}

function ECBlocks( ecCodewordsPerBlock,  ecBlocks1,  ecBlocks2)
{
  this.ecCodewordsPerBlock = ecCodewordsPerBlock;
  if(ecBlocks2)
    this.ecBlocks = new Array(ecBlocks1, ecBlocks2);
  else
    this.ecBlocks = new Array(ecBlocks1);
  
  this.__defineGetter__("ECCodewordsPerBlock", function()
  {
    return this.ecCodewordsPerBlock;
  });
  
  this.__defineGetter__("TotalECCodewords", function()
  {
    return  this.ecCodewordsPerBlock * this.NumBlocks;
  });
  
  this.__defineGetter__("NumBlocks", function()
  {
    var total = 0;
    for (var i = 0; i < this.ecBlocks.length; i++)
    {
      total += this.ecBlocks[i].length;
    }
    return total;
  });
  
  this.getECBlocks=function()
      {
        return this.ecBlocks;
      }
}

function Version( versionNumber,  alignmentPatternCenters,  ecBlocks1,  ecBlocks2,  ecBlocks3,  ecBlocks4)
{
  this.versionNumber = versionNumber;
  this.alignmentPatternCenters = alignmentPatternCenters;
  this.ecBlocks = new Array(ecBlocks1, ecBlocks2, ecBlocks3, ecBlocks4);
  
  var total = 0;
  var ecCodewords = ecBlocks1.ECCodewordsPerBlock;
  var ecbArray = ecBlocks1.getECBlocks();
  for (var i = 0; i < ecbArray.length; i++)
  {
    var ecBlock = ecbArray[i];
    total += ecBlock.Count * (ecBlock.DataCodewords + ecCodewords);
  }
  this.totalCodewords = total;
  
  this.__defineGetter__("VersionNumber", function()
  {
    return  this.versionNumber;
  });
  
  this.__defineGetter__("AlignmentPatternCenters", function()
  {
    return  this.alignmentPatternCenters;
  });
  this.__defineGetter__("TotalCodewords", function()
  {
    return  this.totalCodewords;
  });
  this.__defineGetter__("DimensionForVersion", function()
  {
    return  17 + 4 * this.versionNumber;
  });
  
  this.buildFunctionPattern=function()
    {
      var dimension = this.DimensionForVersion;
      var bitMatrix = new BitMatrix(dimension);
      
      // Top left finder pattern + separator + format
      bitMatrix.setRegion(0, 0, 9, 9);
      // Top right finder pattern + separator + format
      bitMatrix.setRegion(dimension - 8, 0, 8, 9);
      // Bottom left finder pattern + separator + format
      bitMatrix.setRegion(0, dimension - 8, 9, 8);
      
      // Alignment patterns
      var max = this.alignmentPatternCenters.length;
      for (var x = 0; x < max; x++)
      {
        var i = this.alignmentPatternCenters[x] - 2;
        for (var y = 0; y < max; y++)
        {
          if ((x == 0 && (y == 0 || y == max - 1)) || (x == max - 1 && y == 0))
          {
            // No alignment patterns near the three finder paterns
            continue;
          }
          bitMatrix.setRegion(this.alignmentPatternCenters[y] - 2, i, 5, 5);
        }
      }
      
      // Vertical timing pattern
      bitMatrix.setRegion(6, 9, 1, dimension - 17);
      // Horizontal timing pattern
      bitMatrix.setRegion(9, 6, dimension - 17, 1);
      
      if (this.versionNumber > 6)
      {
        // Version info, top right
        bitMatrix.setRegion(dimension - 11, 0, 3, 6);
        // Version info, bottom left
        bitMatrix.setRegion(0, dimension - 11, 6, 3);
      }
      
      return bitMatrix;
    }
  this.getECBlocksForLevel=function( ecLevel)
  {
    return this.ecBlocks[ecLevel.ordinal()];
  }
}

Version.VERSION_DECODE_INFO = new Array(0x07C94, 0x085BC, 0x09A99, 0x0A4D3, 0x0BBF6, 0x0C762, 0x0D847, 0x0E60D, 0x0F928, 0x10B78, 0x1145D, 0x12A17, 0x13532, 0x149A6, 0x15683, 0x168C9, 0x177EC, 0x18EC4, 0x191E1, 0x1AFAB, 0x1B08E, 0x1CC1A, 0x1D33F, 0x1ED75, 0x1F250, 0x209D5, 0x216F0, 0x228BA, 0x2379F, 0x24B0B, 0x2542E, 0x26A64, 0x27541, 0x28C69);

Version.VERSIONS = buildVersions();

Version.getVersionForNumber=function( versionNumber)
{
  if (versionNumber < 1 || versionNumber > 40)
  {
    throw "ArgumentException";
  }
  return Version.VERSIONS[versionNumber - 1];
}

Version.getProvisionalVersionForDimension=function(dimension)
{
  if (dimension % 4 != 1)
  {
    throw "Error getProvisionalVersionForDimension";
  }
  try
  {
    return Version.getVersionForNumber((dimension - 17) >> 2);
  }
  catch ( iae)
  {
    throw "Error getVersionForNumber";
  }
}

Version.decodeVersionInformation=function( versionBits)
{
  var bestDifference = 0xffffffff;
  var bestVersion = 0;
  for (var i = 0; i < Version.VERSION_DECODE_INFO.length; i++)
  {
    var targetVersion = Version.VERSION_DECODE_INFO[i];
    // Do the version info bits match exactly? done.
    if (targetVersion == versionBits)
    {
      return this.getVersionForNumber(i + 7);
    }
    // Otherwise see if this is the closest to a real version info bit string
    // we have seen so far
    var bitsDifference = FormatInformation.numBitsDiffering(versionBits, targetVersion);
    if (bitsDifference < bestDifference)
    {
      bestVersion = i + 7;
      bestDifference = bitsDifference;
    }
  }
  // We can tolerate up to 3 bits of error since no two version info codewords will
  // differ in less than 4 bits.
  if (bestDifference <= 3)
  {
    return this.getVersionForNumber(bestVersion);
  }
  // If we didn't find a close enough match, fail
  return null;
}

function buildVersions()
{
  return new Array(new Version(1, new Array(), new ECBlocks(7, new ECB(1, 19)), new ECBlocks(10, new ECB(1, 16)), new ECBlocks(13, new ECB(1, 13)), new ECBlocks(17, new ECB(1, 9))), 
  new Version(2, new Array(6, 18), new ECBlocks(10, new ECB(1, 34)), new ECBlocks(16, new ECB(1, 28)), new ECBlocks(22, new ECB(1, 22)), new ECBlocks(28, new ECB(1, 16))), 
  new Version(3, new Array(6, 22), new ECBlocks(15, new ECB(1, 55)), new ECBlocks(26, new ECB(1, 44)), new ECBlocks(18, new ECB(2, 17)), new ECBlocks(22, new ECB(2, 13))), 
  new Version(4, new Array(6, 26), new ECBlocks(20, new ECB(1, 80)), new ECBlocks(18, new ECB(2, 32)), new ECBlocks(26, new ECB(2, 24)), new ECBlocks(16, new ECB(4, 9))), 
  new Version(5, new Array(6, 30), new ECBlocks(26, new ECB(1, 108)), new ECBlocks(24, new ECB(2, 43)), new ECBlocks(18, new ECB(2, 15), new ECB(2, 16)), new ECBlocks(22, new ECB(2, 11), new ECB(2, 12))), 
  new Version(6, new Array(6, 34), new ECBlocks(18, new ECB(2, 68)), new ECBlocks(16, new ECB(4, 27)), new ECBlocks(24, new ECB(4, 19)), new ECBlocks(28, new ECB(4, 15))), 
  new Version(7, new Array(6, 22, 38), new ECBlocks(20, new ECB(2, 78)), new ECBlocks(18, new ECB(4, 31)), new ECBlocks(18, new ECB(2, 14), new ECB(4, 15)), new ECBlocks(26, new ECB(4, 13), new ECB(1, 14))), 
  new Version(8, new Array(6, 24, 42), new ECBlocks(24, new ECB(2, 97)), new ECBlocks(22, new ECB(2, 38), new ECB(2, 39)), new ECBlocks(22, new ECB(4, 18), new ECB(2, 19)), new ECBlocks(26, new ECB(4, 14), new ECB(2, 15))), 
  new Version(9, new Array(6, 26, 46), new ECBlocks(30, new ECB(2, 116)), new ECBlocks(22, new ECB(3, 36), new ECB(2, 37)), new ECBlocks(20, new ECB(4, 16), new ECB(4, 17)), new ECBlocks(24, new ECB(4, 12), new ECB(4, 13))), 
  new Version(10, new Array(6, 28, 50), new ECBlocks(18, new ECB(2, 68), new ECB(2, 69)), new ECBlocks(26, new ECB(4, 43), new ECB(1, 44)), new ECBlocks(24, new ECB(6, 19), new ECB(2, 20)), new ECBlocks(28, new ECB(6, 15), new ECB(2, 16))), 
  new Version(11, new Array(6, 30, 54), new ECBlocks(20, new ECB(4, 81)), new ECBlocks(30, new ECB(1, 50), new ECB(4, 51)), new ECBlocks(28, new ECB(4, 22), new ECB(4, 23)), new ECBlocks(24, new ECB(3, 12), new ECB(8, 13))), 
  new Version(12, new Array(6, 32, 58), new ECBlocks(24, new ECB(2, 92), new ECB(2, 93)), new ECBlocks(22, new ECB(6, 36), new ECB(2, 37)), new ECBlocks(26, new ECB(4, 20), new ECB(6, 21)), new ECBlocks(28, new ECB(7, 14), new ECB(4, 15))), 
  new Version(13, new Array(6, 34, 62), new ECBlocks(26, new ECB(4, 107)), new ECBlocks(22, new ECB(8, 37), new ECB(1, 38)), new ECBlocks(24, new ECB(8, 20), new ECB(4, 21)), new ECBlocks(22, new ECB(12, 11), new ECB(4, 12))), 
  new Version(14, new Array(6, 26, 46, 66), new ECBlocks(30, new ECB(3, 115), new ECB(1, 116)), new ECBlocks(24, new ECB(4, 40), new ECB(5, 41)), new ECBlocks(20, new ECB(11, 16), new ECB(5, 17)), new ECBlocks(24, new ECB(11, 12), new ECB(5, 13))), 
  new Version(15, new Array(6, 26, 48, 70), new ECBlocks(22, new ECB(5, 87), new ECB(1, 88)), new ECBlocks(24, new ECB(5, 41), new ECB(5, 42)), new ECBlocks(30, new ECB(5, 24), new ECB(7, 25)), new ECBlocks(24, new ECB(11, 12), new ECB(7, 13))), 
  new Version(16, new Array(6, 26, 50, 74), new ECBlocks(24, new ECB(5, 98), new ECB(1, 99)), new ECBlocks(28, new ECB(7, 45), new ECB(3, 46)), new ECBlocks(24, new ECB(15, 19), new ECB(2, 20)), new ECBlocks(30, new ECB(3, 15), new ECB(13, 16))), 
  new Version(17, new Array(6, 30, 54, 78), new ECBlocks(28, new ECB(1, 107), new ECB(5, 108)), new ECBlocks(28, new ECB(10, 46), new ECB(1, 47)), new ECBlocks(28, new ECB(1, 22), new ECB(15, 23)), new ECBlocks(28, new ECB(2, 14), new ECB(17, 15))), 
  new Version(18, new Array(6, 30, 56, 82), new ECBlocks(30, new ECB(5, 120), new ECB(1, 121)), new ECBlocks(26, new ECB(9, 43), new ECB(4, 44)), new ECBlocks(28, new ECB(17, 22), new ECB(1, 23)), new ECBlocks(28, new ECB(2, 14), new ECB(19, 15))), 
  new Version(19, new Array(6, 30, 58, 86), new ECBlocks(28, new ECB(3, 113), new ECB(4, 114)), new ECBlocks(26, new ECB(3, 44), new ECB(11, 45)), new ECBlocks(26, new ECB(17, 21), new ECB(4, 22)), new ECBlocks(26, new ECB(9, 13), new ECB(16, 14))), 
  new Version(20, new Array(6, 34, 62, 90), new ECBlocks(28, new ECB(3, 107), new ECB(5, 108)), new ECBlocks(26, new ECB(3, 41), new ECB(13, 42)), new ECBlocks(30, new ECB(15, 24), new ECB(5, 25)), new ECBlocks(28, new ECB(15, 15), new ECB(10, 16))), 
  new Version(21, new Array(6, 28, 50, 72, 94), new ECBlocks(28, new ECB(4, 116), new ECB(4, 117)), new ECBlocks(26, new ECB(17, 42)), new ECBlocks(28, new ECB(17, 22), new ECB(6, 23)), new ECBlocks(30, new ECB(19, 16), new ECB(6, 17))), 
  new Version(22, new Array(6, 26, 50, 74, 98), new ECBlocks(28, new ECB(2, 111), new ECB(7, 112)), new ECBlocks(28, new ECB(17, 46)), new ECBlocks(30, new ECB(7, 24), new ECB(16, 25)), new ECBlocks(24, new ECB(34, 13))), 
  new Version(23, new Array(6, 30, 54, 74, 102), new ECBlocks(30, new ECB(4, 121), new ECB(5, 122)), new ECBlocks(28, new ECB(4, 47), new ECB(14, 48)), new ECBlocks(30, new ECB(11, 24), new ECB(14, 25)), new ECBlocks(30, new ECB(16, 15), new ECB(14, 16))), 
  new Version(24, new Array(6, 28, 54, 80, 106), new ECBlocks(30, new ECB(6, 117), new ECB(4, 118)), new ECBlocks(28, new ECB(6, 45), new ECB(14, 46)), new ECBlocks(30, new ECB(11, 24), new ECB(16, 25)), new ECBlocks(30, new ECB(30, 16), new ECB(2, 17))), 
  new Version(25, new Array(6, 32, 58, 84, 110), new ECBlocks(26, new ECB(8, 106), new ECB(4, 107)), new ECBlocks(28, new ECB(8, 47), new ECB(13, 48)), new ECBlocks(30, new ECB(7, 24), new ECB(22, 25)), new ECBlocks(30, new ECB(22, 15), new ECB(13, 16))), 
  new Version(26, new Array(6, 30, 58, 86, 114), new ECBlocks(28, new ECB(10, 114), new ECB(2, 115)), new ECBlocks(28, new ECB(19, 46), new ECB(4, 47)), new ECBlocks(28, new ECB(28, 22), new ECB(6, 23)), new ECBlocks(30, new ECB(33, 16), new ECB(4, 17))), 
  new Version(27, new Array(6, 34, 62, 90, 118), new ECBlocks(30, new ECB(8, 122), new ECB(4, 123)), new ECBlocks(28, new ECB(22, 45), new ECB(3, 46)), new ECBlocks(30, new ECB(8, 23), new ECB(26, 24)), new ECBlocks(30, new ECB(12, 15),     new ECB(28, 16))),
  new Version(28, new Array(6, 26, 50, 74, 98, 122), new ECBlocks(30, new ECB(3, 117), new ECB(10, 118)), new ECBlocks(28, new ECB(3, 45), new ECB(23, 46)), new ECBlocks(30, new ECB(4, 24), new ECB(31, 25)), new ECBlocks(30, new ECB(11, 15), new ECB(31, 16))), 
  new Version(29, new Array(6, 30, 54, 78, 102, 126), new ECBlocks(30, new ECB(7, 116), new ECB(7, 117)), new ECBlocks(28, new ECB(21, 45), new ECB(7, 46)), new ECBlocks(30, new ECB(1, 23), new ECB(37, 24)), new ECBlocks(30, new ECB(19, 15), new ECB(26, 16))), 
  new Version(30, new Array(6, 26, 52, 78, 104, 130), new ECBlocks(30, new ECB(5, 115), new ECB(10, 116)), new ECBlocks(28, new ECB(19, 47), new ECB(10, 48)), new ECBlocks(30, new ECB(15, 24), new ECB(25, 25)), new ECBlocks(30, new ECB(23, 15), new ECB(25, 16))), 
  new Version(31, new Array(6, 30, 56, 82, 108, 134), new ECBlocks(30, new ECB(13, 115), new ECB(3, 116)), new ECBlocks(28, new ECB(2, 46), new ECB(29, 47)), new ECBlocks(30, new ECB(42, 24), new ECB(1, 25)), new ECBlocks(30, new ECB(23, 15), new ECB(28, 16))), 
  new Version(32, new Array(6, 34, 60, 86, 112, 138), new ECBlocks(30, new ECB(17, 115)), new ECBlocks(28, new ECB(10, 46), new ECB(23, 47)), new ECBlocks(30, new ECB(10, 24), new ECB(35, 25)), new ECBlocks(30, new ECB(19, 15), new ECB(35, 16))), 
  new Version(33, new Array(6, 30, 58, 86, 114, 142), new ECBlocks(30, new ECB(17, 115), new ECB(1, 116)), new ECBlocks(28, new ECB(14, 46), new ECB(21, 47)), new ECBlocks(30, new ECB(29, 24), new ECB(19, 25)), new ECBlocks(30, new ECB(11, 15), new ECB(46, 16))), 
  new Version(34, new Array(6, 34, 62, 90, 118, 146), new ECBlocks(30, new ECB(13, 115), new ECB(6, 116)), new ECBlocks(28, new ECB(14, 46), new ECB(23, 47)), new ECBlocks(30, new ECB(44, 24), new ECB(7, 25)), new ECBlocks(30, new ECB(59, 16), new ECB(1, 17))), 
  new Version(35, new Array(6, 30, 54, 78, 102, 126, 150), new ECBlocks(30, new ECB(12, 121), new ECB(7, 122)), new ECBlocks(28, new ECB(12, 47), new ECB(26, 48)), new ECBlocks(30, new ECB(39, 24), new ECB(14, 25)),new ECBlocks(30, new ECB(22, 15), new ECB(41, 16))), 
  new Version(36, new Array(6, 24, 50, 76, 102, 128, 154), new ECBlocks(30, new ECB(6, 121), new ECB(14, 122)), new ECBlocks(28, new ECB(6, 47), new ECB(34, 48)), new ECBlocks(30, new ECB(46, 24), new ECB(10, 25)), new ECBlocks(30, new ECB(2, 15), new ECB(64, 16))), 
  new Version(37, new Array(6, 28, 54, 80, 106, 132, 158), new ECBlocks(30, new ECB(17, 122), new ECB(4, 123)), new ECBlocks(28, new ECB(29, 46), new ECB(14, 47)), new ECBlocks(30, new ECB(49, 24), new ECB(10, 25)), new ECBlocks(30, new ECB(24, 15), new ECB(46, 16))), 
  new Version(38, new Array(6, 32, 58, 84, 110, 136, 162), new ECBlocks(30, new ECB(4, 122), new ECB(18, 123)), new ECBlocks(28, new ECB(13, 46), new ECB(32, 47)), new ECBlocks(30, new ECB(48, 24), new ECB(14, 25)), new ECBlocks(30, new ECB(42, 15), new ECB(32, 16))), 
  new Version(39, new Array(6, 26, 54, 82, 110, 138, 166), new ECBlocks(30, new ECB(20, 117), new ECB(4, 118)), new ECBlocks(28, new ECB(40, 47), new ECB(7, 48)), new ECBlocks(30, new ECB(43, 24), new ECB(22, 25)), new ECBlocks(30, new ECB(10, 15), new ECB(67, 16))), 
  new Version(40, new Array(6, 30, 58, 86, 114, 142, 170), new ECBlocks(30, new ECB(19, 118), new ECB(6, 119)), new ECBlocks(28, new ECB(18, 47), new ECB(31, 48)), new ECBlocks(30, new ECB(34, 24), new ECB(34, 25)), new ECBlocks(30, new ECB(20, 15), new ECB(61, 16))));
}


module.exports = Version
},{"./bitmat":25}],42:[function(require,module,exports){

var qrcode = require('./lib/qrcode.js');

module.exports = {
    typeNumber: 4,
    errorCorrectLevel: 'L',
    toBase64: function(text, size){
        var qr = qrcode(this.typeNumber, this.errorCorrectLevel);
        qr.addData(text);
        qr.make();
        var base64 = qr.createImgBase64(size);
        return base64;
    },
    toDataURL: function(text, size){
        var base64 = this.toBase64(text, size);        
        var dataURL = 'data:image/gif;base64,' + base64; 
        return dataURL;
    }
};

},{"./lib/qrcode.js":43}],43:[function(require,module,exports){
// The original source of this file is: http://d-project.googlecode.com/svn/trunk/misc/qrcode/js/qrcode.js

//---------------------------------------------------------------------
//
// QR Code Generator for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//	http://www.opensource.org/licenses/mit-license.php
//
// The word 'QR Code' is registered trademark of
// DENSO WAVE INCORPORATED
//	http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------

var qrcode = function() {

	//---------------------------------------------------------------------
	// qrcode
	//---------------------------------------------------------------------

	/**
	 * qrcode
	 * @param typeNumber 1 to 10
	 * @param errorCorrectLevel 'L','M','Q','H'
	 */
	var qrcode = function(typeNumber, errorCorrectLevel) {

		var PAD0 = 0xEC;
		var PAD1 = 0x11;

		var _typeNumber = typeNumber;
		var _errorCorrectLevel = QRErrorCorrectLevel[errorCorrectLevel];
		var _modules = null;
		var _moduleCount = 0;
		var _dataCache = null;
		var _dataList = new Array();

		var _this = {};

		var makeImpl = function(test, maskPattern) {

			_moduleCount = _typeNumber * 4 + 17;
			_modules = function(moduleCount) {
				var modules = new Array(moduleCount);
				for (var row = 0; row < moduleCount; row += 1) {
					modules[row] = new Array(moduleCount);
					for (var col = 0; col < moduleCount; col += 1) {
						modules[row][col] = null;
					}
				}
				return modules;
			}(_moduleCount);

			setupPositionProbePattern(0, 0);
			setupPositionProbePattern(_moduleCount - 7, 0);
			setupPositionProbePattern(0, _moduleCount - 7);
			setupPositionAdjustPattern();
			setupTimingPattern();
			setupTypeInfo(test, maskPattern);

			if (_typeNumber >= 7) {
				setupTypeNumber(test);
			}

			if (_dataCache == null) {
				_dataCache = createData(_typeNumber, _errorCorrectLevel, _dataList);
			}

			mapData(_dataCache, maskPattern);
		};

		var setupPositionProbePattern = function(row, col) {

			for (var r = -1; r <= 7; r += 1) {

				if (row + r <= -1 || _moduleCount <= row + r) continue;

				for (var c = -1; c <= 7; c += 1) {

					if (col + c <= -1 || _moduleCount <= col + c) continue;

					if ( (0 <= r && r <= 6 && (c == 0 || c == 6) )
							|| (0 <= c && c <= 6 && (r == 0 || r == 6) )
							|| (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
						_modules[row + r][col + c] = true;
					} else {
						_modules[row + r][col + c] = false;
					}
				}
			}
		};

		var getBestMaskPattern = function() {

			var minLostPoint = 0;
			var pattern = 0;

			for (var i = 0; i < 8; i += 1) {

				makeImpl(true, i);

				var lostPoint = QRUtil.getLostPoint(_this);

				if (i == 0 || minLostPoint > lostPoint) {
					minLostPoint = lostPoint;
					pattern = i;
				}
			}

			return pattern;
		};

		var setupTimingPattern = function() {

			for (var r = 8; r < _moduleCount - 8; r += 1) {
				if (_modules[r][6] != null) {
					continue;
				}
				_modules[r][6] = (r % 2 == 0);
			}

			for (var c = 8; c < _moduleCount - 8; c += 1) {
				if (_modules[6][c] != null) {
					continue;
				}
				_modules[6][c] = (c % 2 == 0);
			}
		};

		var setupPositionAdjustPattern = function() {

			var pos = QRUtil.getPatternPosition(_typeNumber);

			for (var i = 0; i < pos.length; i += 1) {

				for (var j = 0; j < pos.length; j += 1) {

					var row = pos[i];
					var col = pos[j];

					if (_modules[row][col] != null) {
						continue;
					}

					for (var r = -2; r <= 2; r += 1) {

						for (var c = -2; c <= 2; c += 1) {

							if (r == -2 || r == 2 || c == -2 || c == 2
									|| (r == 0 && c == 0) ) {
								_modules[row + r][col + c] = true;
							} else {
								_modules[row + r][col + c] = false;
							}
						}
					}
				}
			}
		};

		var setupTypeNumber = function(test) {

			var bits = QRUtil.getBCHTypeNumber(_typeNumber);

			for (var i = 0; i < 18; i += 1) {
				var mod = (!test && ( (bits >> i) & 1) == 1);
				_modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
			}

			for (var i = 0; i < 18; i += 1) {
				var mod = (!test && ( (bits >> i) & 1) == 1);
				_modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
			}
		};

		var setupTypeInfo = function(test, maskPattern) {

			var data = (_errorCorrectLevel << 3) | maskPattern;
			var bits = QRUtil.getBCHTypeInfo(data);

			// vertical
			for (var i = 0; i < 15; i += 1) {

				var mod = (!test && ( (bits >> i) & 1) == 1);

				if (i < 6) {
					_modules[i][8] = mod;
				} else if (i < 8) {
					_modules[i + 1][8] = mod;
				} else {
					_modules[_moduleCount - 15 + i][8] = mod;
				}
			}

			// horizontal
			for (var i = 0; i < 15; i += 1) {

				var mod = (!test && ( (bits >> i) & 1) == 1);

				if (i < 8) {
					_modules[8][_moduleCount - i - 1] = mod;
				} else if (i < 9) {
					_modules[8][15 - i - 1 + 1] = mod;
				} else {
					_modules[8][15 - i - 1] = mod;
				}
			}

			// fixed module
			_modules[_moduleCount - 8][8] = (!test);
		};

		var mapData = function(data, maskPattern) {

			var inc = -1;
			var row = _moduleCount - 1;
			var bitIndex = 7;
			var byteIndex = 0;
			var maskFunc = QRUtil.getMaskFunction(maskPattern);

			for (var col = _moduleCount - 1; col > 0; col -= 2) {

				if (col == 6) col -= 1;

				while (true) {

					for (var c = 0; c < 2; c += 1) {

						if (_modules[row][col - c] == null) {

							var dark = false;

							if (byteIndex < data.length) {
								dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1);
							}

							var mask = maskFunc(row, col - c);

							if (mask) {
								dark = !dark;
							}

							_modules[row][col - c] = dark;
							bitIndex -= 1;

							if (bitIndex == -1) {
								byteIndex += 1;
								bitIndex = 7;
							}
						}
					}

					row += inc;

					if (row < 0 || _moduleCount <= row) {
						row -= inc;
						inc = -inc;
						break;
					}
				}
			}
		};

		var createBytes = function(buffer, rsBlocks) {

			var offset = 0;

			var maxDcCount = 0;
			var maxEcCount = 0;

			var dcdata = new Array(rsBlocks.length);
			var ecdata = new Array(rsBlocks.length);

			for (var r = 0; r < rsBlocks.length; r += 1) {

				var dcCount = rsBlocks[r].dataCount;
				var ecCount = rsBlocks[r].totalCount - dcCount;

				maxDcCount = Math.max(maxDcCount, dcCount);
				maxEcCount = Math.max(maxEcCount, ecCount);

				dcdata[r] = new Array(dcCount);

				for (var i = 0; i < dcdata[r].length; i += 1) {
					dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
				}
				offset += dcCount;

				var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
				var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);

				var modPoly = rawPoly.mod(rsPoly);
				ecdata[r] = new Array(rsPoly.getLength() - 1);
				for (var i = 0; i < ecdata[r].length; i += 1) {
					var modIndex = i + modPoly.getLength() - ecdata[r].length;
					ecdata[r][i] = (modIndex >= 0)? modPoly.getAt(modIndex) : 0;
				}
			}

			var totalCodeCount = 0;
			for (var i = 0; i < rsBlocks.length; i += 1) {
				totalCodeCount += rsBlocks[i].totalCount;
			}

			var data = new Array(totalCodeCount);
			var index = 0;

			for (var i = 0; i < maxDcCount; i += 1) {
				for (var r = 0; r < rsBlocks.length; r += 1) {
					if (i < dcdata[r].length) {
						data[index] = dcdata[r][i];
						index += 1;
					}
				}
			}

			for (var i = 0; i < maxEcCount; i += 1) {
				for (var r = 0; r < rsBlocks.length; r += 1) {
					if (i < ecdata[r].length) {
						data[index] = ecdata[r][i];
						index += 1;
					}
				}
			}

			return data;
		};

		var createData = function(typeNumber, errorCorrectLevel, dataList) {

			var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);

			var buffer = qrBitBuffer();

			for (var i = 0; i < dataList.length; i += 1) {
				var data = dataList[i];
				buffer.put(data.getMode(), 4);
				buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
				data.write(buffer);
			}

			// calc num max data.
			var totalDataCount = 0;
			for (var i = 0; i < rsBlocks.length; i += 1) {
				totalDataCount += rsBlocks[i].dataCount;
			}

			if (buffer.getLengthInBits() > totalDataCount * 8) {
				throw new Error('code length overflow. ('
					+ buffer.getLengthInBits()
					+ '>'
					+ totalDataCount * 8
					+ ')');
			}

			// end code
			if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
				buffer.put(0, 4);
			}

			// padding
			while (buffer.getLengthInBits() % 8 != 0) {
				buffer.putBit(false);
			}

			// padding
			while (true) {

				if (buffer.getLengthInBits() >= totalDataCount * 8) {
					break;
				}
				buffer.put(PAD0, 8);

				if (buffer.getLengthInBits() >= totalDataCount * 8) {
					break;
				}
				buffer.put(PAD1, 8);
			}

			return createBytes(buffer, rsBlocks);
		};

		_this.addData = function(data) {
			var newData = qr8BitByte(data);
			_dataList.push(newData);
			_dataCache = null;
		};

		_this.isDark = function(row, col) {
			if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
				throw new Error(row + ',' + col);
			}
			return _modules[row][col];
		};

		_this.getModuleCount = function() {
			return _moduleCount;
		};

		_this.make = function() {
			makeImpl(false, getBestMaskPattern() );
		};

		_this.createTableTag = function(cellSize, margin) {

			cellSize = cellSize || 2;
			margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

			var qrHtml = '';

			qrHtml += '<table style="';
			qrHtml += ' border-width: 0px; border-style: none;';
			qrHtml += ' border-collapse: collapse;';
			qrHtml += ' padding: 0px; margin: ' + margin + 'px;';
			qrHtml += '">';
			qrHtml += '<tbody>';

			for (var r = 0; r < _this.getModuleCount(); r += 1) {

				qrHtml += '<tr>';

				for (var c = 0; c < _this.getModuleCount(); c += 1) {
					qrHtml += '<td style="';
					qrHtml += ' border-width: 0px; border-style: none;';
					qrHtml += ' border-collapse: collapse;';
					qrHtml += ' padding: 0px; margin: 0px;';
					qrHtml += ' width: ' + cellSize + 'px;';
					qrHtml += ' height: ' + cellSize + 'px;';
					qrHtml += ' background-color: ';
					qrHtml += _this.isDark(r, c)? '#000000' : '#ffffff';
					qrHtml += ';';
					qrHtml += '"/>';
				}

				qrHtml += '</tr>';
			}

			qrHtml += '</tbody>';
			qrHtml += '</table>';

			return qrHtml;
		};

		_this.createImgTag = function(cellSize, margin) {

			cellSize = cellSize || 2;
			margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

			var size = _this.getModuleCount() * cellSize + margin * 2;
			var min = margin;
			var max = size - margin;

			return createImgTag(size, size, function(x, y) {
				if (min <= x && x < max && min <= y && y < max) {
					var c = Math.floor( (x - min) / cellSize);
					var r = Math.floor( (y - min) / cellSize);
					return _this.isDark(r, c)? 0 : 1;
				} else {
					return 1;
				}
			} );
		};
        
        _this.createImgBase64 = function(cellSize, margin) {

			cellSize = cellSize || 2;
			margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

			var size = _this.getModuleCount() * cellSize + margin * 2;
			var min = margin;
			var max = size - margin;

			return createImgBase64(size, size, function(x, y) {
				if (min <= x && x < max && min <= y && y < max) {
					var c = Math.floor( (x - min) / cellSize);
					var r = Math.floor( (y - min) / cellSize);
					return _this.isDark(r, c)? 0 : 1;
				} else {
					return 1;
				}
			} );
		};
        
		return _this;
	};

	//---------------------------------------------------------------------
	// qrcode.stringToBytes
	//---------------------------------------------------------------------

	qrcode.stringToBytes = function(s) {
		var bytes = new Array();
		for (var i = 0; i < s.length; i += 1) {
			var c = s.charCodeAt(i);
			bytes.push(c & 0xff);
		}
		return bytes;
	};

	//---------------------------------------------------------------------
	// qrcode.createStringToBytes
	//---------------------------------------------------------------------

	/**
	 * @param unicodeData base64 string of byte array.
	 * [16bit Unicode],[16bit Bytes], ...
	 * @param numChars
	 */
	qrcode.createStringToBytes = function(unicodeData, numChars) {

		// create conversion map.

		var unicodeMap = function() {

			var bin = base64DecodeInputStream(unicodeData);
			var read = function() {
				var b = bin.read();
				if (b == -1) throw new Error();
				return b;
			};

			var count = 0;
			var unicodeMap = {};
			while (true) {
				var b0 = bin.read();
				if (b0 == -1) break;
				var b1 = read();
				var b2 = read();
				var b3 = read();
				var k = String.fromCharCode( (b0 << 8) | b1);
				var v = (b2 << 8) | b3;
				unicodeMap[k] = v;
				count += 1;
			}
			if (count != numChars) {
				throw new Error(count + ' != ' + numChars);
			}

			return unicodeMap;
		}();

		var unknownChar = '?'.charCodeAt(0);

		return function(s) {
			var bytes = new Array();
			for (var i = 0; i < s.length; i += 1) {
				var c = s.charCodeAt(i);
				if (c < 128) {
					bytes.push(c);
				} else {
					var b = unicodeMap[s.charAt(i)];
					if (typeof b == 'number') {
						if ( (b & 0xff) == b) {
							// 1byte
							bytes.push(b);
						} else {
							// 2bytes
							bytes.push(b >>> 8);
							bytes.push(b & 0xff);
						}
					} else {
						bytes.push(unknownChar);
					}
				}
			}
			return bytes;
		};
	};

	//---------------------------------------------------------------------
	// QRMode
	//---------------------------------------------------------------------

	var QRMode = {
		MODE_NUMBER :		1 << 0,
		MODE_ALPHA_NUM : 	1 << 1,
		MODE_8BIT_BYTE : 	1 << 2,
		MODE_KANJI :		1 << 3
	};

	//---------------------------------------------------------------------
	// QRErrorCorrectLevel
	//---------------------------------------------------------------------

	var QRErrorCorrectLevel = {
		L : 1,
		M : 0,
		Q : 3,
		H : 2
	};

	//---------------------------------------------------------------------
	// QRMaskPattern
	//---------------------------------------------------------------------

	var QRMaskPattern = {
		PATTERN000 : 0,
		PATTERN001 : 1,
		PATTERN010 : 2,
		PATTERN011 : 3,
		PATTERN100 : 4,
		PATTERN101 : 5,
		PATTERN110 : 6,
		PATTERN111 : 7
	};

	//---------------------------------------------------------------------
	// QRUtil
	//---------------------------------------------------------------------

	var QRUtil = function() {

		var PATTERN_POSITION_TABLE = [
			[],
			[6, 18],
			[6, 22],
			[6, 26],
			[6, 30],
			[6, 34],
			[6, 22, 38],
			[6, 24, 42],
			[6, 26, 46],
			[6, 28, 50],
			[6, 30, 54],
			[6, 32, 58],
			[6, 34, 62],
			[6, 26, 46, 66],
			[6, 26, 48, 70],
			[6, 26, 50, 74],
			[6, 30, 54, 78],
			[6, 30, 56, 82],
			[6, 30, 58, 86],
			[6, 34, 62, 90],
			[6, 28, 50, 72, 94],
			[6, 26, 50, 74, 98],
			[6, 30, 54, 78, 102],
			[6, 28, 54, 80, 106],
			[6, 32, 58, 84, 110],
			[6, 30, 58, 86, 114],
			[6, 34, 62, 90, 118],
			[6, 26, 50, 74, 98, 122],
			[6, 30, 54, 78, 102, 126],
			[6, 26, 52, 78, 104, 130],
			[6, 30, 56, 82, 108, 134],
			[6, 34, 60, 86, 112, 138],
			[6, 30, 58, 86, 114, 142],
			[6, 34, 62, 90, 118, 146],
			[6, 30, 54, 78, 102, 126, 150],
			[6, 24, 50, 76, 102, 128, 154],
			[6, 28, 54, 80, 106, 132, 158],
			[6, 32, 58, 84, 110, 136, 162],
			[6, 26, 54, 82, 110, 138, 166],
			[6, 30, 58, 86, 114, 142, 170]
		];
		var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
		var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
		var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

		var _this = {};

		var getBCHDigit = function(data) {
			var digit = 0;
			while (data != 0) {
				digit += 1;
				data >>>= 1;
			}
			return digit;
		};

		_this.getBCHTypeInfo = function(data) {
			var d = data << 10;
			while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
				d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15) ) );
			}
			return ( (data << 10) | d) ^ G15_MASK;
		};

		_this.getBCHTypeNumber = function(data) {
			var d = data << 12;
			while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
				d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18) ) );
			}
			return (data << 12) | d;
		};

		_this.getPatternPosition = function(typeNumber) {
			return PATTERN_POSITION_TABLE[typeNumber - 1];
		};

		_this.getMaskFunction = function(maskPattern) {

			switch (maskPattern) {

			case QRMaskPattern.PATTERN000 :
				return function(i, j) { return (i + j) % 2 == 0; };
			case QRMaskPattern.PATTERN001 :
				return function(i, j) { return i % 2 == 0; };
			case QRMaskPattern.PATTERN010 :
				return function(i, j) { return j % 3 == 0; };
			case QRMaskPattern.PATTERN011 :
				return function(i, j) { return (i + j) % 3 == 0; };
			case QRMaskPattern.PATTERN100 :
				return function(i, j) { return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0; };
			case QRMaskPattern.PATTERN101 :
				return function(i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };
			case QRMaskPattern.PATTERN110 :
				return function(i, j) { return ( (i * j) % 2 + (i * j) % 3) % 2 == 0; };
			case QRMaskPattern.PATTERN111 :
				return function(i, j) { return ( (i * j) % 3 + (i + j) % 2) % 2 == 0; };

			default :
				throw new Error('bad maskPattern:' + maskPattern);
			}
		};

		_this.getErrorCorrectPolynomial = function(errorCorrectLength) {
			var a = qrPolynomial([1], 0);
			for (var i = 0; i < errorCorrectLength; i += 1) {
				a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0) );
			}
			return a;
		};

		_this.getLengthInBits = function(mode, type) {

			if (1 <= type && type < 10) {

				// 1 - 9

				switch(mode) {
				case QRMode.MODE_NUMBER 	: return 10;
				case QRMode.MODE_ALPHA_NUM 	: return 9;
				case QRMode.MODE_8BIT_BYTE	: return 8;
				case QRMode.MODE_KANJI		: return 8;
				default :
					throw new Error('mode:' + mode);
				}

			} else if (type < 27) {

				// 10 - 26

				switch(mode) {
				case QRMode.MODE_NUMBER 	: return 12;
				case QRMode.MODE_ALPHA_NUM 	: return 11;
				case QRMode.MODE_8BIT_BYTE	: return 16;
				case QRMode.MODE_KANJI		: return 10;
				default :
					throw new Error('mode:' + mode);
				}

			} else if (type < 41) {

				// 27 - 40

				switch(mode) {
				case QRMode.MODE_NUMBER 	: return 14;
				case QRMode.MODE_ALPHA_NUM	: return 13;
				case QRMode.MODE_8BIT_BYTE	: return 16;
				case QRMode.MODE_KANJI		: return 12;
				default :
					throw new Error('mode:' + mode);
				}

			} else {
				throw new Error('type:' + type);
			}
		};

		_this.getLostPoint = function(qrcode) {

			var moduleCount = qrcode.getModuleCount();

			var lostPoint = 0;

			// LEVEL1

			for (var row = 0; row < moduleCount; row += 1) {
				for (var col = 0; col < moduleCount; col += 1) {

					var sameCount = 0;
					var dark = qrcode.isDark(row, col);

					for (var r = -1; r <= 1; r += 1) {

						if (row + r < 0 || moduleCount <= row + r) {
							continue;
						}

						for (var c = -1; c <= 1; c += 1) {

							if (col + c < 0 || moduleCount <= col + c) {
								continue;
							}

							if (r == 0 && c == 0) {
								continue;
							}

							if (dark == qrcode.isDark(row + r, col + c) ) {
								sameCount += 1;
							}
						}
					}

					if (sameCount > 5) {
						lostPoint += (3 + sameCount - 5);
					}
				}
			};

			// LEVEL2

			for (var row = 0; row < moduleCount - 1; row += 1) {
				for (var col = 0; col < moduleCount - 1; col += 1) {
					var count = 0;
					if (qrcode.isDark(row, col) ) count += 1;
					if (qrcode.isDark(row + 1, col) ) count += 1;
					if (qrcode.isDark(row, col + 1) ) count += 1;
					if (qrcode.isDark(row + 1, col + 1) ) count += 1;
					if (count == 0 || count == 4) {
						lostPoint += 3;
					}
				}
			}

			// LEVEL3

			for (var row = 0; row < moduleCount; row += 1) {
				for (var col = 0; col < moduleCount - 6; col += 1) {
					if (qrcode.isDark(row, col)
							&& !qrcode.isDark(row, col + 1)
							&&  qrcode.isDark(row, col + 2)
							&&  qrcode.isDark(row, col + 3)
							&&  qrcode.isDark(row, col + 4)
							&& !qrcode.isDark(row, col + 5)
							&&  qrcode.isDark(row, col + 6) ) {
						lostPoint += 40;
					}
				}
			}

			for (var col = 0; col < moduleCount; col += 1) {
				for (var row = 0; row < moduleCount - 6; row += 1) {
					if (qrcode.isDark(row, col)
							&& !qrcode.isDark(row + 1, col)
							&&  qrcode.isDark(row + 2, col)
							&&  qrcode.isDark(row + 3, col)
							&&  qrcode.isDark(row + 4, col)
							&& !qrcode.isDark(row + 5, col)
							&&  qrcode.isDark(row + 6, col) ) {
						lostPoint += 40;
					}
				}
			}

			// LEVEL4

			var darkCount = 0;

			for (var col = 0; col < moduleCount; col += 1) {
				for (var row = 0; row < moduleCount; row += 1) {
					if (qrcode.isDark(row, col) ) {
						darkCount += 1;
					}
				}
			}

			var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
			lostPoint += ratio * 10;

			return lostPoint;
		};

		return _this;
	}();

	//---------------------------------------------------------------------
	// QRMath
	//---------------------------------------------------------------------

	var QRMath = function() {

		var EXP_TABLE = new Array(256);
		var LOG_TABLE = new Array(256);

		// initialize tables
		for (var i = 0; i < 8; i += 1) {
			EXP_TABLE[i] = 1 << i;
		}
		for (var i = 8; i < 256; i += 1) {
			EXP_TABLE[i] = EXP_TABLE[i - 4]
				^ EXP_TABLE[i - 5]
				^ EXP_TABLE[i - 6]
				^ EXP_TABLE[i - 8];
		}
		for (var i = 0; i < 255; i += 1) {
			LOG_TABLE[EXP_TABLE[i] ] = i;
		}

		var _this = {};

		_this.glog = function(n) {

			if (n < 1) {
				throw new Error('glog(' + n + ')');
			}

			return LOG_TABLE[n];
		};

		_this.gexp = function(n) {

			while (n < 0) {
				n += 255;
			}

			while (n >= 256) {
				n -= 255;
			}

			return EXP_TABLE[n];
		};

		return _this;
	}();

	//---------------------------------------------------------------------
	// qrPolynomial
	//---------------------------------------------------------------------

	function qrPolynomial(num, shift) {

		if (typeof num.length == 'undefined') {
			throw new Error(num.length + '/' + shift);
		}

		var _num = function() {
			var offset = 0;
			while (offset < num.length && num[offset] == 0) {
				offset += 1;
			}
			var _num = new Array(num.length - offset + shift);
			for (var i = 0; i < num.length - offset; i += 1) {
				_num[i] = num[i + offset];
			}
			return _num;
		}();

		var _this = {};

		_this.getAt = function(index) {
			return _num[index];
		};

		_this.getLength = function() {
			return _num.length;
		};

		_this.multiply = function(e) {

			var num = new Array(_this.getLength() + e.getLength() - 1);

			for (var i = 0; i < _this.getLength(); i += 1) {
				for (var j = 0; j < e.getLength(); j += 1) {
					num[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i) ) + QRMath.glog(e.getAt(j) ) );
				}
			}

			return qrPolynomial(num, 0);
		};

		_this.mod = function(e) {

			if (_this.getLength() - e.getLength() < 0) {
				return _this;
			}

			var ratio = QRMath.glog(_this.getAt(0) ) - QRMath.glog(e.getAt(0) );

			var num = new Array(_this.getLength() );
			for (var i = 0; i < _this.getLength(); i += 1) {
				num[i] = _this.getAt(i);
			}

			for (var i = 0; i < e.getLength(); i += 1) {
				num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i) ) + ratio);
			}

			// recursive call
			return qrPolynomial(num, 0).mod(e);
		};

		return _this;
	};

	//---------------------------------------------------------------------
	// QRRSBlock
	//---------------------------------------------------------------------

	var QRRSBlock = function() {

		var RS_BLOCK_TABLE = [

			// L
			// M
			// Q
			// H

			// 1
			[1, 26, 19],
			[1, 26, 16],
			[1, 26, 13],
			[1, 26, 9],

			// 2
			[1, 44, 34],
			[1, 44, 28],
			[1, 44, 22],
			[1, 44, 16],

			// 3
			[1, 70, 55],
			[1, 70, 44],
			[2, 35, 17],
			[2, 35, 13],

			// 4
			[1, 100, 80],
			[2, 50, 32],
			[2, 50, 24],
			[4, 25, 9],

			// 5
			[1, 134, 108],
			[2, 67, 43],
			[2, 33, 15, 2, 34, 16],
			[2, 33, 11, 2, 34, 12],

			// 6
			[2, 86, 68],
			[4, 43, 27],
			[4, 43, 19],
			[4, 43, 15],

			// 7
			[2, 98, 78],
			[4, 49, 31],
			[2, 32, 14, 4, 33, 15],
			[4, 39, 13, 1, 40, 14],

			// 8
			[2, 121, 97],
			[2, 60, 38, 2, 61, 39],
			[4, 40, 18, 2, 41, 19],
			[4, 40, 14, 2, 41, 15],

			// 9
			[2, 146, 116],
			[3, 58, 36, 2, 59, 37],
			[4, 36, 16, 4, 37, 17],
			[4, 36, 12, 4, 37, 13],

			// 10
			[2, 86, 68, 2, 87, 69],
			[4, 69, 43, 1, 70, 44],
			[6, 43, 19, 2, 44, 20],
			[6, 43, 15, 2, 44, 16]
		];

		var qrRSBlock = function(totalCount, dataCount) {
			var _this = {};
			_this.totalCount = totalCount;
			_this.dataCount = dataCount;
			return _this;
		};

		var _this = {};

		var getRsBlockTable = function(typeNumber, errorCorrectLevel) {

			switch(errorCorrectLevel) {
			case QRErrorCorrectLevel.L :
				return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
			case QRErrorCorrectLevel.M :
				return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
			case QRErrorCorrectLevel.Q :
				return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
			case QRErrorCorrectLevel.H :
				return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
			default :
				return undefined;
			}
		};

		_this.getRSBlocks = function(typeNumber, errorCorrectLevel) {

			var rsBlock = getRsBlockTable(typeNumber, errorCorrectLevel);

			if (typeof rsBlock == 'undefined') {
				throw new Error('bad rs block @ typeNumber:' + typeNumber +
						'/errorCorrectLevel:' + errorCorrectLevel);
			}

			var length = rsBlock.length / 3;

			var list = new Array();

			for (var i = 0; i < length; i += 1) {

				var count = rsBlock[i * 3 + 0];
				var totalCount = rsBlock[i * 3 + 1];
				var dataCount = rsBlock[i * 3 + 2];

				for (var j = 0; j < count; j += 1) {
					list.push(qrRSBlock(totalCount, dataCount) );
				}
			}

			return list;
		};

		return _this;
	}();

	//---------------------------------------------------------------------
	// qrBitBuffer
	//---------------------------------------------------------------------

	var qrBitBuffer = function() {

		var _buffer = new Array();
		var _length = 0;

		var _this = {};

		_this.getBuffer = function() {
			return _buffer;
		};

		_this.getAt = function(index) {
			var bufIndex = Math.floor(index / 8);
			return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
		};

		_this.put = function(num, length) {
			for (var i = 0; i < length; i += 1) {
				_this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
			}
		};

		_this.getLengthInBits = function() {
			return _length;
		};

		_this.putBit = function(bit) {

			var bufIndex = Math.floor(_length / 8);
			if (_buffer.length <= bufIndex) {
				_buffer.push(0);
			}

			if (bit) {
				_buffer[bufIndex] |= (0x80 >>> (_length % 8) );
			}

			_length += 1;
		};

		return _this;
	};

	//---------------------------------------------------------------------
	// qr8BitByte
	//---------------------------------------------------------------------

	var qr8BitByte = function(data) {

		var _mode = QRMode.MODE_8BIT_BYTE;
		var _data = data;
		var _bytes = qrcode.stringToBytes(data);

		var _this = {};

		_this.getMode = function() {
			return _mode;
		};

		_this.getLength = function(buffer) {
			return _bytes.length;
		};

		_this.write = function(buffer) {
			for (var i = 0; i < _bytes.length; i += 1) {
				buffer.put(_bytes[i], 8);
			}
		};

		return _this;
	};

	//=====================================================================
	// GIF Support etc.
	//

	//---------------------------------------------------------------------
	// byteArrayOutputStream
	//---------------------------------------------------------------------

	var byteArrayOutputStream = function() {

		var _bytes = new Array();

		var _this = {};

		_this.writeByte = function(b) {
			_bytes.push(b & 0xff);
		};

		_this.writeShort = function(i) {
			_this.writeByte(i);
			_this.writeByte(i >>> 8);
		};

		_this.writeBytes = function(b, off, len) {
			off = off || 0;
			len = len || b.length;
			for (var i = 0; i < len; i += 1) {
				_this.writeByte(b[i + off]);
			}
		};

		_this.writeString = function(s) {
			for (var i = 0; i < s.length; i += 1) {
				_this.writeByte(s.charCodeAt(i) );
			}
		};

		_this.toByteArray = function() {
			return _bytes;
		};

		_this.toString = function() {
			var s = '';
			s += '[';
			for (var i = 0; i < _bytes.length; i += 1) {
				if (i > 0) {
					s += ',';
				}
				s += _bytes[i];
			}
			s += ']';
			return s;
		};

		return _this;
	};

	//---------------------------------------------------------------------
	// base64EncodeOutputStream
	//---------------------------------------------------------------------

	var base64EncodeOutputStream = function() {

		var _buffer = 0;
		var _buflen = 0;
		var _length = 0;
		var _base64 = '';

		var _this = {};

		var writeEncoded = function(b) {
			_base64 += String.fromCharCode(encode(b & 0x3f) );
		};

		var encode = function(n) {
			if (n < 0) {
				// error.
			} else if (n < 26) {
				return 0x41 + n;
			} else if (n < 52) {
				return 0x61 + (n - 26);
			} else if (n < 62) {
				return 0x30 + (n - 52);
			} else if (n == 62) {
				return 0x2b;
			} else if (n == 63) {
				return 0x2f;
			}
			throw new Error('n:' + n);
		};

		_this.writeByte = function(n) {

			_buffer = (_buffer << 8) | (n & 0xff);
			_buflen += 8;
			_length += 1;

			while (_buflen >= 6) {
				writeEncoded(_buffer >>> (_buflen - 6) );
				_buflen -= 6;
			}
		};

		_this.flush = function() {

			if (_buflen > 0) {
				writeEncoded(_buffer << (6 - _buflen) );
				_buffer = 0;
				_buflen = 0;
			}

			if (_length % 3 != 0) {
				// padding
				var padlen = 3 - _length % 3;
				for (var i = 0; i < padlen; i += 1) {
					_base64 += '=';
				}
			}
		};

		_this.toString = function() {
			return _base64;
		};

		return _this;
	};

	//---------------------------------------------------------------------
	// base64DecodeInputStream
	//---------------------------------------------------------------------

	var base64DecodeInputStream = function(str) {

		var _str = str;
		var _pos = 0;
		var _buffer = 0;
		var _buflen = 0;

		var _this = {};

		_this.read = function() {

			while (_buflen < 8) {

				if (_pos >= _str.length) {
					if (_buflen == 0) {
						return -1;
					}
					throw new Error('unexpected end of file./' + _buflen);
				}

				var c = _str.charAt(_pos);
				_pos += 1;

				if (c == '=') {
					_buflen = 0;
					return -1;
				} else if (c.match(/^\s$/) ) {
					// ignore if whitespace.
					continue;
				}

				_buffer = (_buffer << 6) | decode(c.charCodeAt(0) );
				_buflen += 6;
			}

			var n = (_buffer >>> (_buflen - 8) ) & 0xff;
			_buflen -= 8;
			return n;
		};

		var decode = function(c) {
			if (0x41 <= c && c <= 0x5a) {
				return c - 0x41;
			} else if (0x61 <= c && c <= 0x7a) {
				return c - 0x61 + 26;
			} else if (0x30 <= c && c <= 0x39) {
				return c - 0x30 + 52;
			} else if (c == 0x2b) {
				return 62;
			} else if (c == 0x2f) {
				return 63;
			} else {
				throw new Error('c:' + c);
			}
		};

		return _this;
	};

	//---------------------------------------------------------------------
	// gifImage (B/W)
	//---------------------------------------------------------------------

	var gifImage = function(width, height) {

		var _width = width;
		var _height = height;
		var _data = new Array(width * height);

		var _this = {};

		_this.setPixel = function(x, y, pixel) {
			_data[y * _width + x] = pixel;
		};

		_this.write = function(out) {

			//---------------------------------
			// GIF Signature

			out.writeString('GIF87a');

			//---------------------------------
			// Screen Descriptor

			out.writeShort(_width);
			out.writeShort(_height);

			out.writeByte(0x80); // 2bit
			out.writeByte(0);
			out.writeByte(0);

			//---------------------------------
			// Global Color Map

			// black
			out.writeByte(0x00);
			out.writeByte(0x00);
			out.writeByte(0x00);

			// white
			out.writeByte(0xff);
			out.writeByte(0xff);
			out.writeByte(0xff);

			//---------------------------------
			// Image Descriptor

			out.writeString(',');
			out.writeShort(0);
			out.writeShort(0);
			out.writeShort(_width);
			out.writeShort(_height);
			out.writeByte(0);

			//---------------------------------
			// Local Color Map

			//---------------------------------
			// Raster Data

			var lzwMinCodeSize = 2;
			var raster = getLZWRaster(lzwMinCodeSize);

			out.writeByte(lzwMinCodeSize);

			var offset = 0;

			while (raster.length - offset > 255) {
				out.writeByte(255);
				out.writeBytes(raster, offset, 255);
				offset += 255;
			}

			out.writeByte(raster.length - offset);
			out.writeBytes(raster, offset, raster.length - offset);
			out.writeByte(0x00);

			//---------------------------------
			// GIF Terminator
			out.writeString(';');
		};

		var bitOutputStream = function(out) {

			var _out = out;
			var _bitLength = 0;
			var _bitBuffer = 0;

			var _this = {};

			_this.write = function(data, length) {

				if ( (data >>> length) != 0) {
					throw new Error('length over');
				}

				while (_bitLength + length >= 8) {
					_out.writeByte(0xff & ( (data << _bitLength) | _bitBuffer) );
					length -= (8 - _bitLength);
					data >>>= (8 - _bitLength);
					_bitBuffer = 0;
					_bitLength = 0;
				}

				_bitBuffer = (data << _bitLength) | _bitBuffer;
				_bitLength = _bitLength + length;
			};

			_this.flush = function() {
				if (_bitLength > 0) {
					_out.writeByte(_bitBuffer);
				}
			};

			return _this;
		};

		var getLZWRaster = function(lzwMinCodeSize) {

			var clearCode = 1 << lzwMinCodeSize;
			var endCode = (1 << lzwMinCodeSize) + 1;
			var bitLength = lzwMinCodeSize + 1;

			// Setup LZWTable
			var table = lzwTable();

			for (var i = 0; i < clearCode; i += 1) {
				table.add(String.fromCharCode(i) );
			}
			table.add(String.fromCharCode(clearCode) );
			table.add(String.fromCharCode(endCode) );

			var byteOut = byteArrayOutputStream();
			var bitOut = bitOutputStream(byteOut);

			// clear code
			bitOut.write(clearCode, bitLength);

			var dataIndex = 0;

			var s = String.fromCharCode(_data[dataIndex]);
			dataIndex += 1;

			while (dataIndex < _data.length) {

				var c = String.fromCharCode(_data[dataIndex]);
				dataIndex += 1;

				if (table.contains(s + c) ) {

					s = s + c;

				} else {

					bitOut.write(table.indexOf(s), bitLength);

					if (table.size() < 0xfff) {

						if (table.size() == (1 << bitLength) ) {
							bitLength += 1;
						}

						table.add(s + c);
					}

					s = c;
				}
			}

			bitOut.write(table.indexOf(s), bitLength);

			// end code
			bitOut.write(endCode, bitLength);

			bitOut.flush();

			return byteOut.toByteArray();
		};

		var lzwTable = function() {

			var _map = {};
			var _size = 0;

			var _this = {};

			_this.add = function(key) {
				if (_this.contains(key) ) {
					throw new Error('dup key:' + key);
				}
				_map[key] = _size;
				_size += 1;
			};

			_this.size = function() {
				return _size;
			};

			_this.indexOf = function(key) {
				return _map[key];
			};

			_this.contains = function(key) {
				return typeof _map[key] != 'undefined';
			};

			return _this;
		};

		return _this;
	};

	var createImgTag = function(width, height, getPixel, alt) {

		var gif = gifImage(width, height);
		for (var y = 0; y < height; y += 1) {
			for (var x = 0; x < width; x += 1) {
				gif.setPixel(x, y, getPixel(x, y) );
			}
		}

		var b = byteArrayOutputStream();
		gif.write(b);

		var base64 = base64EncodeOutputStream();
		var bytes = b.toByteArray();
		for (var i = 0; i < bytes.length; i += 1) {
			base64.writeByte(bytes[i]);
		}
		base64.flush();

		var img = '';
		img += '<img';
		img += '\u0020src="';
		img += 'data:image/gif;base64,';
		img += base64;
		img += '"';
		img += '\u0020width="';
		img += width;
		img += '"';
		img += '\u0020height="';
		img += height;
		img += '"';
		if (alt) {
			img += '\u0020alt="';
			img += alt;
			img += '"';
		}
		img += '/>';

		return img;
	};
    
    var createImgBase64 = function(width, height, getPixel) {

		var gif = gifImage(width, height);
		for (var y = 0; y < height; y += 1) {
			for (var x = 0; x < width; x += 1) {
				gif.setPixel(x, y, getPixel(x, y) );
			}
		}

		var b = byteArrayOutputStream();
		gif.write(b);

		var base64 = base64EncodeOutputStream();
		var bytes = b.toByteArray();
		for (var i = 0; i < bytes.length; i += 1) {
			base64.writeByte(bytes[i]);
		}
		base64.flush();

		return base64.toString();
	};

	//---------------------------------------------------------------------
	// returns qrcode function.

	return qrcode;
}();

module.exports = qrcode;
},{}],44:[function(require,module,exports){
var CertMain = function() {
    var ob;

    var error = ko.observable("");
    var dnd_visible = ko.observable(true);
    var dnd_text = ko.observable("");

    ob = {
        error: error,
        dnd_text: dnd_text,
        dnd_visible: dnd_visible,
    }

    return ob;
};

module.exports.CertMain = CertMain;

},{}],"JxKr0o":[function(require,module,exports){
var dnd = require('./dnd.js'),
    locale = require("./locale.js"),
    Keyholder = require('./keyholder.js'),
    CertMain = require('./cert.js').CertMain,
    Ident = require('./identity.js').Ident,
    keys,
    ident, issuer_ident,
    view;


var CertController = function() {
    var ob;

    ob = {
    };
    return ob;
};


function file_dropped(u8) {
    view.error(null);
    keys.have({key: u8});
};

var file_dloaded = function(r) {
    view.error(null);
    keys.have({key: r})
};

function need_cb(evt) { };


function feedback_cb(evt) {
    console.log(evt);
    if(evt.key === true || evt.crypted_key === true) {
        return view.error("Please, drop certificate, not key");
    }

    if(evt.cert === true) {
        view.dnd_visible(false);
        ident.set_ident(keys.cert.subject, keys.cert.extension, keys.cert.pubkey, keys.cert.valid);
        issuer_ident.set_ident(keys.cert.issuer);

        document.getElementById("pem").innerText = keys.get_pem({cert: true});
    }
};

var query = function() {
    var ret = {}, hash, part, part_s, i;

    hash = window.location.hash.substr(1).split('|');

    for(i=0; part=hash[i]; i++) {
        part_s = part.split('=', 2);
        ret[part_s[0]] = part_s[1];
    }

    return ret;
};

var setup = function() {
    var q;

    locale.set_current(locale.read());

    q = query();

    keys = new Keyholder({need: need_cb, feedback: feedback_cb});
    view = new CertMain();
    ident = new Ident();
    issuer_ident = new Ident();
    dnd.setup(file_dropped);

    ko.applyBindings(view, document.getElementById("ui"));
    ko.applyBindings(ident, document.getElementById("ident"));
    ko.applyBindings(issuer_ident, document.getElementById("issuer_ident"));

    if(q.ipn !== undefined) {
        $.get('/api/cert/ipn/'+q.ipn, file_dloaded);
    } else {
        view.dnd_text("Сбросьте сертификат для просмотра");
    }
};


module.exports.setup = setup;

},{"./cert.js":44,"./dnd.js":47,"./identity.js":53,"./keyholder.js":54,"./locale.js":57}],"certui":[function(require,module,exports){
module.exports=require('JxKr0o');
},{}],47:[function(require,module,exports){
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

},{}],48:[function(require,module,exports){
var locale = require('./locale.js'),
    _label = locale.label,
    dnd = require('./dnd.js');

var Dnd = function(cb) {
    var ob;
    var state = ko.observable(0);

    var visible = ko.observable(false);

    ob = {
        visible: visible,
        state: state,
        text: _label('dnd', state),
        intro_1: _label('intro_1'),
        title_dnd: _label('title_dnd'),
        setup: dnd.setup,
    }; 
    return ob;
}

module.exports.Dnd = Dnd;

},{"./dnd.js":47,"./locale.js":57}],49:[function(require,module,exports){

var ia2hex = function(val) {
    var ret = '', i, c;
    for(i=0; i < val.length; i++) {
        c = val[i].toString(16);
        if(c.length == 1) {
            c = '0' + c;
        }
        ret = ret + c;
    }
    return ret;
}
var Document = function(cb) {
    var ob;

    var visible = ko.observable(false);
    var document_text = ko.observable("");
    var sign = ko.observable("");

    var do_sign = function() {
        cb.sign_text(document_text());
    };

    var set_sign = function(hash_bn, param_s, param_r) {
        var txt = "";
        txt += 'Hash: ' + hash_bn.toString(16);
        txt += ', S: ' + param_s.toString(16);
        txt += ', R: ' + param_r.toString(16);

        sign(txt);
    };

    ob = {
        visible: visible,
        do_sign: do_sign,
        sign: sign,
        set_sign: set_sign,
    };
    return ob;
}

module.exports.Document = Document;

},{}],50:[function(require,module,exports){
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

},{"./util.js":63}],"0YlI+X":[function(require,module,exports){
var Curve = require('jkurwa'), priv=null,
    view = require('./ui.js'),
    dstu = require('./dstu.js'),
    docview = require('./document.js'),
    identview = require('./identity.js'),
    Keyholder = require('./keyholder.js'),
    Stored = require("./stored.js").Stored,
    Langs = require('./langs.js').Langs,
    Password = require('./password.js').Password,
    Dnd = require('./dnd_ui.js').Dnd,
    locale = require("./locale.js"),
    QRReader = require("./qr_read.js"),
    QRWriter = require("./qr_write.js"),
    keys,
    doc,
    ident,
    stored,
    langs,
    password,
    dnd,
    qr_in,
    qr_out,
    vm;

function need_cb(evt) {
    if(evt.password === true) {
        dnd.visible(false);
        password.visible(true);
    }
}

function feedback_cb(evt) {
    if(evt.password === false) {
        console.log("password fail");
        password.settle(true);
    }
    if(evt.password === true) {
        password.settle(false);
        password.visible(false);
    }
    if(evt.key === true) {
        dnd.state(1);
    }
    if(evt.key === false) {
        vm.set_error("You dropped some file, but it's not private key (or we maybe we can't read it)");
    }
    if(evt.cert === true) {
        ident.set_ident(keys.cert.subject, keys.cert.extension, keys.cert.pubkey);
        ident.visible(true);
        keys.save_cert();
        dnd.state(0);
    }

    if((evt.key === true) || (evt.cert === true)) {
        if(keys.is_ready_sign()) {
            dnd.visible(false);
            stored.needed(false);
            vm.key_controls_visible(true);
            vm.key_info_visible(true);
        } else {
            dnd.visible(true);
        }
    }
}

function password_cb(value) {
    keys.have({password: value})
}

function pem_cb() {
    var pem_data = keys.get_pem();
    vm.set_pem(pem_data);

    var min = keys.get_mini(true);
    console.log(min);
    qr_out.write(min);
    qr_out.visible(true);
}

function to_storage() {
    keys.save_key();
}

function sign_box() {
    dnd.visible(false);
    vm.pem_visible(false);
    vm.error_visible(false);
    vm.key_controls_visible(false);
    vm.key_info_visible(false);
    vm.visible(false);
    doc.visible(true);
}

function sign_cb(contents) {
    var hash = dstu.compute_hash(contents);
    hash = [0].concat(hash);
    var hash_bn = new Curve.Big(hash);
    var priv = keys.get_signer();
    var sign = priv.sign(hash_bn);
    doc.set_sign(hash_bn, sign.s, sign.r);
}

function file_dropped(u8) {
    vm.set_error();
    keys.have({key: u8})
}

function file_selected(data) {
    keys.have({key: data});
}

var change_locale = function(code) {
    locale.save(code);
    locale.set_current(code);
};

var is_mobile = function() {
    return (typeof window.orientation !== 'undefined');
};

var login_cb = function() {
    vm.big_visible(false);

    if(false && is_mobile()) {
        qr_in.visible(true);
        try {
            qr_in.start();
        } catch(e) {
            qr_in.visible(true);
        }
        return;
    }
        
    dnd.visible(true);
};

var publish_certificate = function() {
    var ipn, pem, request;

    ipn = keys.cert.extension.ipn.EDRPOU;
    pem = keys.get_pem({cert: true});
    request = {
        ipn: ipn,
        cert: pem,
    };
    
    $.post('/api/cert.publish', request, function(response){
        console.log("published " + response);
    });
};

var canvas_read = function(data) {
    vm.pem_visible(true);
    vm.pem_text(data);

    qr_in.visible(false);
};

function setup() {
    qr_in = new QRReader(document.getElementById('vid'),
                document.getElementById('qr-canvas'),
                canvas_read);
    qr_out = QRWriter(document.getElementById('qr-out'));
    locale.set_current(locale.read());
    keys = new Keyholder({need: need_cb, feedback: feedback_cb});
    vm = new view.Main({
        password: password_cb,
        pem: pem_cb,
        to_storage: to_storage,
        sign_box: sign_box,
        login: login_cb,
        cert_pub: publish_certificate,
    });
    doc = new docview.Document({sign_text: sign_cb});
    ident = new identview.Ident();
    stored = new Stored({select: file_selected});
    langs = new Langs(['UA', 'RU'], {changed: change_locale});
    password = new Password(password_cb);
    dnd = new Dnd();
    dnd.stored = stored;
    dnd.setup(file_dropped);
    ko.applyBindings(vm, document.getElementById("ui"));
    ko.applyBindings(doc, document.getElementById("document"));
    ko.applyBindings(ident, document.getElementById("identity"));
    ko.applyBindings(langs, document.getElementById("langs"));
    ko.applyBindings(password, document.getElementById("password"));
    ko.applyBindings(dnd, document.getElementById("dnd"));
    ko.applyBindings(qr_in, document.getElementById("qr"));
    ko.applyBindings(qr_out, document.getElementById("qr-out"));


    vm.visible(true);

    stored.feed(keys.have_local());
}

module.exports.setup = setup;
module.exports.locale = change_locale;

},{"./dnd_ui.js":48,"./document.js":49,"./dstu.js":50,"./identity.js":53,"./keyholder.js":54,"./langs.js":56,"./locale.js":57,"./password.js":58,"./qr_read.js":59,"./qr_write.js":60,"./stored.js":61,"./ui.js":62,"jkurwa":"B9c0rZ"}],"ui":[function(require,module,exports){
module.exports=require('0YlI+X');
},{}],53:[function(require,module,exports){
var _ = require('./locale.js').gettext;

var Ident = function() {
    var ob;

    var visible = ko.observable(false);
    var commonName = ko.observable("");
    var title = ko.observable("");
    var ipn = ko.observable("");
    var givenName = ko.observable("");
    var surname = ko.observable("");
    var localityName = ko.observable("");
    var stateOrProvinceName = ko.observable("");
    var organizationName = ko.observable("");
    var organizationalUnitName = ko.observable("");
    var serialNumber = ko.observable("");
    var pubkey = ko.observable("");
    var validFrom = ko.observable("");
    var validTo = ko.observable("");

    var set_ident = function(x509Name, ext, pubkey_bn, valid_on) {
        title(x509Name.title);
        givenName(x509Name.givenName);
        surname(x509Name.surname);
        stateOrProvinceName(x509Name.stateOrProvinceName);
        organizationName(x509Name.organizationName);
        organizationalUnitName(x509Name.organizationalUnitName);
        localityName(x509Name.localityName);
        serialNumber(x509Name.serialNumber);
        commonName(x509Name.commonName);

        if(ext !== undefined) {
            ipn(ext.ipn.EDRPOU);
        }
        if(pubkey_bn !== undefined) {
            pubkey(pubkey_bn.toString(16));
        }
        if(valid_on !== undefined) {
            validFrom(valid_on.from);
            validTo(valid_on.to);
        }
    };

    var located = function() {
        var city = localityName(),
            province = stateOrProvinceName();

        if(!((city.indexOf(".") !== -1) && (city.indexOf(".") + 1) === city.indexOf(" ")))
        {
            city = 'м. ' + city;
        }

        if((province !== undefined) && province.length > 0) {
            return city + ", " + province + " область";
        }

        return city;
    };

    var label = ko.computed(function() {
        var tpl = _('identity_t');
        var ret;

        ret = tpl.replace('%1', commonName());
        ret = ret.replace('%2', located());
        ret = ret.replace('%3', ipn());
        ret = ret.replace('%4', title());

        return ret;
    }, this);

    ob = {
        visible: visible,
        commonName: commonName,
        ipn: ipn,
        title: title,
        set_ident: set_ident,
        givenName: givenName,
        surname: surname,
        stateOrProvinceName: stateOrProvinceName,
        organizationName: organizationName,
        organizationalUnitName: organizationalUnitName,
        localityName: localityName,
        serialNumber: serialNumber,
        pubkey: pubkey,
        validFrom: validFrom,
        validTo: validTo,
        located: located,
        label: label,
    };
    return ob;
}

module.exports.Ident = Ident;

},{"./locale.js":57}],54:[function(require,module,exports){
var Curve = require('jkurwa'),
    b64_encode = Curve.b64_encode,
    dstu = require('./dstu.js');

var Keyholder = function(cb) {
    var ob, keycoder, certs,
        have, signer, pem, mini,
        ready_sign, have_local, save_cert,
        save_key,
        pub_compressed, cert_lookup;

    keycoder = new Curve.Keycoder();
    certs = {};
    is_ready_sign = function() {
        return (
                (ob.key !== undefined) &&
                (ob.cert !== undefined) &&
                ob.cert_key_match(ob.key, ob.cert)
        )
    };
    pub_compressed = function(p) {
        var key_curve = ob.get_curve(p);
        var key_priv = Curve.Priv(key_curve, ob.key.param_d);
        var key_pub = key_priv.pub();
        var point_cmp = key_pub.point.compress();

        return point_cmp.toString(16);
    };
    cert_key_match = function(key, cert) {
        var key_curve = ob.get_curve(key);
        var key_priv = Curve.Priv(key_curve, ob.key.param_d);
        var key_pub = key_priv.pub();
        var key_pub_compressed = key_pub.point.compress(key);

        return cert.pubkey.equals(key_pub_compressed);
    };
    have_password = function(decoded) {
        if ((decoded === undefined) ||
            (keycoder.is_valid(decoded) !== true)) {
            cb.feedback({password: false});
            cb.need({password: true});
            return;
        }

        cb.feedback({password: true});
        ob.raw_key = decoded;
        have({key: decoded})
    };
    have_key = function(data) {
        data = keycoder.maybe_pem(data);

        try {
            var parsed = keycoder.parse(data);
        } catch(e) {
            cb.feedback({key: false});
            return;
        }

        ob.key_info.format = parsed.format;

        switch(parsed.format) {
        case 'privkey':
            ob.raw_key = data;
            ob.key = parsed;
            cb.feedback({key: true});
            if(ob.cert === undefined) {
                if(ob.cert_lookup(ob.pub_compressed(ob.key))) {
                    cb.feedback({cert: true});
                } else {
                    cb.need({cert: true});
                }
            }
            break;
        case 'IIT':
        case 'PBES2':
            ob.raw_encrypted_key = data;
            ob.encrypted_key = parsed;
            cb.feedback({crypted_key: true})
            cb.need({password: true});
            break;
        case 'x509':
            ob.cert = parsed;
            ob.raw_cert = data;
            cb.feedback({cert: true});
            break;
        default:
            console.log("have something unknown");
        }

    };
    cert_lookup = function(pub_point) {
        var cert = certs[pub_point];
        if(cert === undefined) {
            return false;
        }
        ob.cert = cert.cert;
        ob.raw_cert = cert.raw_cert;

        return true;
    };
    have = function (data) {
        if (data.key !== undefined) {
            have_key(data.key);
        }
        if ((data.password !== undefined) && (ob.encrypted_key !== undefined)) {
            dstu.decode_data(ob.encrypted_key, data.password, have_password);
        }
    };
    get_curve = function(p) {

        return curve = new Curve({
            a: p.curve.a,
            b: p.curve.b,
            m: p.curve.m,
            k1: p.curve.k1,
            k2: 0,
            order: p.curve.order,
            base: p.curve.base,
        });
    };
    signer = function() {
        var p = ob.key;
        var curve = ob.get_curve(p);

        return new Curve.Priv(curve, p.param_d);
    };
    mini = function(do_raw) {
        var ret = '', raw='', bytes, i;
        bytes = ob.key.param_d.toByteArray();

        for(i=0; i<bytes.length; i++) {
            if(bytes[i] < 0) {
                bytes[i] = 255 + bytes[i];
            }
        }
        raw = 'R' + b64_encode(bytes);

        if(do_raw === true) {
            ret = raw;
        }

        return ret;
    };
    pem = function(what) {
        var ret = '';
        if(what === undefined) {
            what = {key: true};
        }

        if(what.key === true) {
            ret = keycoder.to_pem(b64_encode(ob.raw_encrypted_key, 42));
            console.log(ret.length);
            ret += '\n';
        }

        if(what.cert === true) {
            ret = keycoder.to_pem(b64_encode(ob.raw_cert, 42), 'CERTIFICATE');
            ret += '\n';
        }

        return ret;
    };
    have_local = function() {
        var store = window.localStorage;
        var ret = [];
        var keys;
        var i;
        var idx;
        var data;
        var der;
        var cert;
        var key;
        var compressed;

        if(store === undefined) {
            return ret;
        }

        keys = Object.keys(store);
        for(i=0; i<keys.length; i++) {
            idx = keys[i];
            data = store[idx];
            if(idx.indexOf('cert-') === 0) {
                try {
                    der = keycoder.maybe_pem(data);
                    cert = keycoder.parse(der);
                    if(cert.format !== 'x509') {
                        throw new Error("expected cert");
                    }
                } catch(e) {
                    continue;
                }
                certs[cert.pubkey.toString(16)] = {
                    cert: cert,
                    raw_cert: der,
                    idx: idx,
                    have_key: false,
                }
            }
        }
        keys = Object.keys(store);
        for(i=0; i<keys.length; i++) {
            idx = keys[i];
            data = store[idx];
            if(idx.indexOf('key-') === 0) {
                try {
                    der = keycoder.maybe_pem(data);
                    key = keycoder.parse(der);
                    switch(key.format) {
                    case 'IIT':
                    case 'PBES2':
                        break;
                    default:
                        throw new Error("expected compressed key");
                    }
                } catch(e) {
                    continue;
                }

                compressed = idx.substr(4); // string after key- is compressed pub
                if(certs[compressed] !== undefined) {
                    certs[compressed]['have_key'] = true;
                    certs[compressed]['raw_key'] = der;
                }
            }
        }

        keys = Object.keys(certs);
        for(i=0; i<keys.length; i++) {
            ret.push(certs[keys[i]]);
        }

        return ret;
    };

    save_cert = function() {
        var data = ob.get_pem({cert: true});
        var serial = ob.cert.subject.serialNumber;

        var store = window.localStorage;
        if(store === undefined) {
            return;
        }

        store['cert-' + serial] = data;
    };

    save_key = function() {
        var data = ob.get_pem({key: true});
        var compressed = ob.pub_compressed(ob.key);

        var store = window.localStorage;
        if(store === undefined) {
            return;
        }

        store['key-' + compressed] = data;
    };

    ob = {
        have: have,
        get_pem: pem,
        get_mini: mini,
        get_signer: signer,
        get_curve: get_curve,
        is_ready_sign: is_ready_sign,
        cert_key_match: cert_key_match,
        pub_compressed: pub_compressed,
        cert_lookup: cert_lookup,
        have_local: have_local,
        save_cert: save_cert,
        save_key: save_key,
        key_info: {
        }
    };
    return ob;
};

module.exports = Keyholder;

},{"./dstu.js":50,"jkurwa":"B9c0rZ"}],55:[function(require,module,exports){
var locale = {};

locale.ua = {
    dnd_0: "Перетягніть файл ключа сюди",
    dnd_1: "Теперь перетягніть файл сертифікату",
    intro_1: ("Перетягніть на сторінку файл ключа, який вам видали у Центрі Сертифікації. Зазвичай, чей файл має ім\`я \"key_6.dat\", та є прихованим на флешці. Після цього, ви можете зберегти ключ у локальне сховище браузеру."),

    add_sign: "Накласти підпис на документ",
    to_store: "Зберегти у свовище",
    avail_certs: "Доступні сертифікати",
    crypted_key: "Секретний ключ захищений паролем. Введіть пароль у поле",
    crypted_key_0: "Секретний ключ захищений паролем.",
    crypted_key_1: "Введіть пароль у поле",
    label_decrypt: "Розшифрувати",
    label_publish: "Завантажити сертифікат на сайт",
    identity_t: "%1 зареєстрован у %2 та ідентифікується податковим номером %3 ( %4 )",
    login: "Увійти",
    title_dnd: "Додайте свій электронний підпис",
};

locale.ru = {
    dnd_0: "Перетащите файл ключа",
    dnd_1: "Теперь перетащите файл сертификата",
    intro_0: ("Тут можно подписать любой документ цифровой подписью,"+
    " соответствующей Державному Стандарту України. " +
    "Физические лица, предприниматели и юридические лица могут получить "+
    "такую подпись в АЦСК Миндоходов или купить у частных центров "+
    "сертификации. Согласно законов Украины, такая подпись "+
    "эквивалентна автографу на бумаге и может, и уже используется, "+
    "для сдачи отчетов в налоговую, проведения банковских платежей, "+
    "заключения договоров и так далее."),

    intro_1: ("Перетащите на страницу файл секретного ключа, который вам выдали в Центре Сертификации. Обычно этот файл называется \"key_6.dat\" и находится на флешке в скрытом виде"),

    add_sign: "Наложить подпись на документ",
    to_store: "Сохранить в хранилище",
    avail_certs: "Доступные сертификати",
    crypted_key: "Секретный ключ защищен паролем. Введете пароль в поле",
    crypted_key_0: "Секретный ключ защищен паролем.",
    crypted_key_1: "Введете пароль в поле",

    label_decrypt: "Расшифровать",
    label_publish: "Загрузить сертификат на сайт",
    identity_t: "%1 зарегистрирован в %2 и идентифицируется налоговым номером %3 ( %4 )",
    login: "Войти",
    title_dnd: "Добавьте свою электронную подпись",
};

module.exports = locale;

},{}],56:[function(require,module,exports){
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

},{"./locale.js":57}],57:[function(require,module,exports){
var locale = require('./l10n.js'),
    locale_code = ko.observable(),
    cookies = require('cookies-js'),
    label,
    current;

var set_current = function(code) {
    if(locale[code] === undefined) {
        throw new Error("Locale not found");
    }

    current = locale[code];
    locale_code(code);
    locale_code.notifySubscribers();
}

var save = function(code) {
    cookies.set('dstu_ui_locale', code);
};

var read = function() {
    var code;
    code = cookies.get('dstu_ui_locale');
    if((code === undefined) || (code === null) || (code.length !== 2)) {
        code = 'ua';
        cookies.set('dstu_ui_locale', code);
    }

    return code;
}

var gettext = function(msgid) {
    locale_code();
    return current[msgid];
}

var label = function(msgid, state_fn) {
    return ko.computed(function() {
        var _msgid;
        if(state_fn !== undefined) {
            _msgid = msgid + '_' + state_fn();
        } else {
            _msgid = msgid;
        }

        return gettext(_msgid);
    }, this)
}

module.exports.gettext = gettext;
module.exports._ = gettext;
module.exports.set_current = set_current;
module.exports.label = label;
module.exports.read = read;
module.exports.save = save;

},{"./l10n.js":55,"cookies-js":"4U1mNF"}],58:[function(require,module,exports){
var locale = require('./locale.js'),
    _label = locale.label;

var Password = function(have_cb) {
    var ob;

    var password = ko.observable("");
    var visible = ko.observable(false);
    var error = ko.observable(false);
    var busy = ko.observable(false);

    var accept_pw = function() {
        var value = password();
        if (value.length > 0) {
            error(false);
            busy(true);
            have_cb(value);
        } else {
            error(true);
        }
    };

    var settle = function(ret) {
        password("");
        error(ret);
        busy(false);
    };

    ob = {
        password: password, 
        visible: visible,
        accept: accept_pw,
        error: error,
        value: password,
        settle: settle,
        busy: busy,
        crypted_key: _label('crypted_key'),
        crypted_key_0: _label('crypted_key_0'),
        crypted_key_1: _label('crypted_key_1'),
        label_decrypt: _label('label_decrypt'),
    };

    return ob;
}

module.exports.Password = Password;

},{"./locale.js":57}],59:[function(require,module,exports){
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

},{"jsqrcode":39}],60:[function(require,module,exports){
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

},{"qrcode-js":42}],61:[function(require,module,exports){
var locale = require('./locale.js'),
    _label = locale.label;

var StoredEl = function(evt, data) {
    var ob;
    var selected = ko.observable(false);
    var key = ko.observable(false);
    var label = function() {
        var subj = data.cert.subject;
        var is = data.cert.issuer;
        return subj.commonName + ' ' + subj.title + ", " + subj.serialNumber + ' ( ' + is.organizationName + ' )';
    };
    var select = function() {
        selected(true);
        evt.select(data.raw_cert);
        evt.select(data.raw_key);
    };
    var remove = function() {
        var store = window.localStorage;
        if(store === undefined) {
            return;
        }

        store.removeItem(data.idx);
    };
    var state = function() {
        if(selected()) {
            return '[X]';
        }
        if(key()) {
            return '[KEY]';
        }

        return '';
    };
    if(data.have_key === true) {
        key(true);
    }

    ob = {
        "label": label,
        "select": select,
        "state": state,
        "remove": remove,
    };
    return ob;
};

var Stored = function(evt) {
    var ob;
    var items = ko.observableArray();
    var needed = ko.observable(true);
    var feed = function(data) {
        var i, ob;
        for(i=0; ob=data[i]; i++) {
            items.push(new StoredEl(evt, ob));
        }
    };
    var visible = ko.computed(function() {
        return items().length > 0 && needed();
    }, this);

    ob = {
        feed: feed,
        items: items,
        visible: visible,
        needed: needed,
        avail_certs: _label('avail_certs'),
    };

    return ob;
};

module.exports.Stored = Stored;

},{"./locale.js":57}],62:[function(require,module,exports){
var locale = require('./locale.js'),
    _label = locale.label;

var Main = function (cb) {
    var ob;

    var big_visible = ko.observable(true);
    var key_controls_visible = ko.observable(false);
    var key_info_visible = ko.observable(false);
    var key_info = ko.observable("");
    var pem_visible = ko.observable(false);
    var pem_text = ko.observable("");
    var error_visible = ko.observable(false);
    var error_text = ko.observable("");
    var visible = ko.observable(false);

    var do_login = function() {
        cb.login();
    }

    var show_pem = function() {
        if(pem_visible()) {
            set_pem();
        } else {
            cb.pem();
        }
    };
    var do_save = function() {
        cb.to_storage();
    };
    var do_sign = function() {
        cb.sign_box();
    };
    var do_pub = function() {
        cb.cert_pub();
    };

    var set_pem = function(val) {
        if(val === undefined) {
            pem_visible(false);
            pem_text("");
        } else {
            pem_visible(true);
            pem_text(val);
        }
    };

    var set_error = function(val) {
        if(val === undefined) {
            error_visible(false);
        } else {
            error_visible(true);
            error_text(val);
        }
    }

    ob = {
        key_controls_visible: key_controls_visible,
        key_info_visible: key_info_visible,
        key_info: key_info,
        show_pem: show_pem,
        do_save: do_save,
        do_pub: do_pub,
        do_sign: do_sign,
        do_login: do_login,
        label_sign: _label('add_sign'),
        label_store: _label('to_store'),
        label_publish: _label('label_publish'),
        set_pem: set_pem,
        pem_text: pem_text,
        pem_visible: pem_visible,
        set_error: set_error,
        error_text: error_text,
        error_visible: error_visible,
        visible: visible,
        big_visible: big_visible,
        intro_0: _label('intro_0'),
        login: _label('login'),
    };
    return ob;
}

exports.Main = Main;
module.exports.Main = Main;

},{"./locale.js":57}],63:[function(require,module,exports){
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

},{}],64:[function(require,module,exports){
// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// when used in node, this will actually load the util module we depend on
// versus loading the builtin util module as happens otherwise
// this is a bug in node module loading as far as I am concerned
var util = require('util/');

var pSlice = Array.prototype.slice;
var hasOwn = Object.prototype.hasOwnProperty;

// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
  else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = stackStartFunction.name;
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (util.isUndefined(value)) {
    return '' + value;
  }
  if (util.isNumber(value) && (isNaN(value) || !isFinite(value))) {
    return value.toString();
  }
  if (util.isFunction(value) || util.isRegExp(value)) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (util.isString(s)) {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

function getMessage(self) {
  return truncate(JSON.stringify(self.actual, replacer), 128) + ' ' +
         self.operator + ' ' +
         truncate(JSON.stringify(self.expected, replacer), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (util.isBuffer(actual) && util.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (!util.isObject(actual) && !util.isObject(expected)) {
    return actual == expected;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (util.isNullOrUndefined(a) || util.isNullOrUndefined(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (util.isString(expected)) {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

},{"util/":66}],65:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],66:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require("UPikzY"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":65,"UPikzY":72,"inherits":71}],"buffer":[function(require,module,exports){
module.exports=require('VTj7jY');
},{}],"VTj7jY":[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
  // because we need to be able to add all the node Buffer API methods. This is an issue
  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // assume that object is array-like
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str.toString()
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list[, length])')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (totalLength === undefined) {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

Buffer.compare = function (a, b) {
  assert(Buffer.isBuffer(a) && Buffer.isBuffer(b), 'Arguments must be Buffers')
  var x = a.length
  var y = b.length
  for (var i = 0, len = Math.min(x, y); i < len && a[i] === b[i]; i++) {}
  if (i !== len) {
    x = a[i]
    y = b[i]
  }
  if (x < y) {
    return -1
  }
  if (y < x) {
    return 1
  }
  return 0
}

// BUFFER INSTANCE METHODS
// =======================

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function asciiWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function utf16leWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end === undefined) ? self.length : Number(end)

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = asciiSlice(self, start, end)
      break
    case 'binary':
      ret = binarySlice(self, start, end)
      break
    case 'base64':
      ret = base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

Buffer.prototype.equals = function (b) {
  assert(Buffer.isBuffer(b), 'Argument must be a Buffer')
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.compare = function (b) {
  assert(Buffer.isBuffer(b), 'Argument must be a Buffer')
  return Buffer.compare(this, b)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !Buffer._useTypedArrays) {
    for (var i = 0; i < len; i++) {
      target[i + target_start] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function binarySlice (buf, start, end) {
  return asciiSlice(buf, start, end)
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return readUInt16(this, offset, false, noAssert)
}

function readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return readInt16(this, offset, false, noAssert)
}

function readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return readInt32(this, offset, false, noAssert)
}

function readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return readFloat(this, offset, false, noAssert)
}

function readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
  return offset + 1
}

function writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
  return offset + 2
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  return writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  return writeUInt16(this, value, offset, false, noAssert)
}

function writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
  return offset + 4
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  return writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  return writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
  return offset + 1
}

function writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
  return offset + 2
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  return writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  return writeInt16(this, value, offset, false, noAssert)
}

function writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
  return offset + 4
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  return writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  return writeInt32(this, value, offset, false, noAssert)
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F) {
      byteArray.push(b)
    } else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++) {
        byteArray.push(parseInt(h[j], 16))
      }
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":69,"ieee754":70}],69:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var ZERO   = '0'.charCodeAt(0)
	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	module.exports.toByteArray = b64ToByteArray
	module.exports.fromByteArray = uint8ToBase64
}())

},{}],70:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],71:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],72:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],73:[function(require,module,exports){
module.exports=require(65)
},{}],74:[function(require,module,exports){
module.exports=require(66)
},{"./support/isBuffer":73,"UPikzY":72,"inherits":71}],75:[function(require,module,exports){
var indexOf = require('indexof');

var Object_keys = function (obj) {
    if (Object.keys) return Object.keys(obj)
    else {
        var res = [];
        for (var key in obj) res.push(key)
        return res;
    }
};

var forEach = function (xs, fn) {
    if (xs.forEach) return xs.forEach(fn)
    else for (var i = 0; i < xs.length; i++) {
        fn(xs[i], i, xs);
    }
};

var defineProp = (function() {
    try {
        Object.defineProperty({}, '_', {});
        return function(obj, name, value) {
            Object.defineProperty(obj, name, {
                writable: true,
                enumerable: false,
                configurable: true,
                value: value
            })
        };
    } catch(e) {
        return function(obj, name, value) {
            obj[name] = value;
        };
    }
}());

var globals = ['Array', 'Boolean', 'Date', 'Error', 'EvalError', 'Function',
'Infinity', 'JSON', 'Math', 'NaN', 'Number', 'Object', 'RangeError',
'ReferenceError', 'RegExp', 'String', 'SyntaxError', 'TypeError', 'URIError',
'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'escape',
'eval', 'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'undefined', 'unescape'];

function Context() {}
Context.prototype = {};

var Script = exports.Script = function NodeScript (code) {
    if (!(this instanceof Script)) return new Script(code);
    this.code = code;
};

Script.prototype.runInContext = function (context) {
    if (!(context instanceof Context)) {
        throw new TypeError("needs a 'context' argument.");
    }
    
    var iframe = document.createElement('iframe');
    if (!iframe.style) iframe.style = {};
    iframe.style.display = 'none';
    
    document.body.appendChild(iframe);
    
    var win = iframe.contentWindow;
    var wEval = win.eval, wExecScript = win.execScript;

    if (!wEval && wExecScript) {
        // win.eval() magically appears when this is called in IE:
        wExecScript.call(win, 'null');
        wEval = win.eval;
    }
    
    forEach(Object_keys(context), function (key) {
        win[key] = context[key];
    });
    forEach(globals, function (key) {
        if (context[key]) {
            win[key] = context[key];
        }
    });
    
    var winKeys = Object_keys(win);

    var res = wEval.call(win, this.code);
    
    forEach(Object_keys(win), function (key) {
        // Avoid copying circular objects like `top` and `window` by only
        // updating existing context properties or new properties in the `win`
        // that was only introduced after the eval.
        if (key in context || indexOf(winKeys, key) === -1) {
            context[key] = win[key];
        }
    });

    forEach(globals, function (key) {
        if (!(key in context)) {
            defineProp(context, key, win[key]);
        }
    });
    
    document.body.removeChild(iframe);
    
    return res;
};

Script.prototype.runInThisContext = function () {
    return eval(this.code); // maybe...
};

Script.prototype.runInNewContext = function (context) {
    var ctx = Script.createContext(context);
    var res = this.runInContext(ctx);

    forEach(Object_keys(ctx), function (key) {
        context[key] = ctx[key];
    });

    return res;
};

forEach(Object_keys(Script.prototype), function (name) {
    exports[name] = Script[name] = function (code) {
        var s = Script(code);
        return s[name].apply(s, [].slice.call(arguments, 1));
    };
});

exports.createScript = function (code) {
    return exports.Script(code);
};

exports.createContext = Script.createContext = function (context) {
    var copy = new Context();
    if(typeof context === 'object') {
        forEach(Object_keys(context), function (key) {
            copy[key] = context[key];
        });
    }
    return copy;
};

},{"indexof":76}],76:[function(require,module,exports){

var indexOf = [].indexOf;

module.exports = function(arr, obj){
  if (indexOf) return arr.indexOf(obj);
  for (var i = 0; i < arr.length; ++i) {
    if (arr[i] === obj) return i;
  }
  return -1;
};
},{}]},{},[])