'use strict';

var global$1 = typeof global !== "undefined" ? global :
            typeof self !== "undefined" ? self :
            typeof window !== "undefined" ? window : {};

var lookup = [];
var revLookup = [];
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array;
var inited = false;
function init () {
  inited = true;
  var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (var i = 0, len = code.length; i < len; ++i) {
    lookup[i] = code[i];
    revLookup[code.charCodeAt(i)] = i;
  }

  revLookup['-'.charCodeAt(0)] = 62;
  revLookup['_'.charCodeAt(0)] = 63;
}

function toByteArray (b64) {
  if (!inited) {
    init();
  }
  var i, j, l, tmp, placeHolders, arr;
  var len = b64.length;

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // the number of equal signs (place holders)
  // if there are two placeholders, than the two characters before it
  // represent one byte
  // if there is only one, then the three characters before it represent 2 bytes
  // this is just a cheap hack to not do indexOf twice
  placeHolders = b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0;

  // base64 is 4/3 + up to two characters of the original data
  arr = new Arr(len * 3 / 4 - placeHolders);

  // if there are placeholders, only get up to the last complete 4 chars
  l = placeHolders > 0 ? len - 4 : len;

  var L = 0;

  for (i = 0, j = 0; i < l; i += 4, j += 3) {
    tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)];
    arr[L++] = (tmp >> 16) & 0xFF;
    arr[L++] = (tmp >> 8) & 0xFF;
    arr[L++] = tmp & 0xFF;
  }

  if (placeHolders === 2) {
    tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4);
    arr[L++] = tmp & 0xFF;
  } else if (placeHolders === 1) {
    tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2);
    arr[L++] = (tmp >> 8) & 0xFF;
    arr[L++] = tmp & 0xFF;
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp;
  var output = [];
  for (var i = start; i < end; i += 3) {
    tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
    output.push(tripletToBase64(tmp));
  }
  return output.join('')
}

function fromByteArray (uint8) {
  if (!inited) {
    init();
  }
  var tmp;
  var len = uint8.length;
  var extraBytes = len % 3; // if we have 1 byte left, pad 2 bytes
  var output = '';
  var parts = [];
  var maxChunkLength = 16383; // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)));
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1];
    output += lookup[tmp >> 2];
    output += lookup[(tmp << 4) & 0x3F];
    output += '==';
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + (uint8[len - 1]);
    output += lookup[tmp >> 10];
    output += lookup[(tmp >> 4) & 0x3F];
    output += lookup[(tmp << 2) & 0x3F];
    output += '=';
  }

  parts.push(output);

  return parts.join('')
}

function read (buffer, offset, isLE, mLen, nBytes) {
  var e, m;
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var nBits = -7;
  var i = isLE ? (nBytes - 1) : 0;
  var d = isLE ? -1 : 1;
  var s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

function write (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c;
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0);
  var i = isLE ? 0 : (nBytes - 1);
  var d = isLE ? 1 : -1;
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

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

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128;
}

var toString = {}.toString;

var isArray = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */


var INSPECT_MAX_BYTES = 50;

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Due to various browser bugs, sometimes the Object implementation will be used even
 * when the browser supports typed arrays.
 *
 * Note:
 *
 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *     incorrect length in some situations.

 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
 * get the Object implementation, which is slower but behaves correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = global$1.TYPED_ARRAY_SUPPORT !== undefined
  ? global$1.TYPED_ARRAY_SUPPORT
  : true;

function kMaxLength () {
  return Buffer.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

function createBuffer (that, length) {
  if (kMaxLength() < length) {
    throw new RangeError('Invalid typed array length')
  }
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = new Uint8Array(length);
    that.__proto__ = Buffer.prototype;
  } else {
    // Fallback: Return an object instance of the Buffer class
    if (that === null) {
      that = new Buffer(length);
    }
    that.length = length;
  }

  return that
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  if (!Buffer.TYPED_ARRAY_SUPPORT && !(this instanceof Buffer)) {
    return new Buffer(arg, encodingOrOffset, length)
  }

  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new Error(
        'If encoding is specified then the first argument must be a string'
      )
    }
    return allocUnsafe(this, arg)
  }
  return from(this, arg, encodingOrOffset, length)
}

Buffer.poolSize = 8192; // not used by this implementation

// TODO: Legacy, not needed anymore. Remove in next major version.
Buffer._augment = function (arr) {
  arr.__proto__ = Buffer.prototype;
  return arr
};

function from (that, value, encodingOrOffset, length) {
  if (typeof value === 'number') {
    throw new TypeError('"value" argument must not be a number')
  }

  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return fromArrayBuffer(that, value, encodingOrOffset, length)
  }

  if (typeof value === 'string') {
    return fromString(that, value, encodingOrOffset)
  }

  return fromObject(that, value)
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(null, value, encodingOrOffset, length)
};

if (Buffer.TYPED_ARRAY_SUPPORT) {
  Buffer.prototype.__proto__ = Uint8Array.prototype;
  Buffer.__proto__ = Uint8Array;
  if (typeof Symbol !== 'undefined' && Symbol.species &&
      Buffer[Symbol.species] === Buffer) {
    // Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
    // Object.defineProperty(Buffer, Symbol.species, {
    //   value: null,
    //   configurable: true
    // })
  }
}

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be a number')
  } else if (size < 0) {
    throw new RangeError('"size" argument must not be negative')
  }
}

function alloc (that, size, fill, encoding) {
  assertSize(size);
  if (size <= 0) {
    return createBuffer(that, size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(that, size).fill(fill, encoding)
      : createBuffer(that, size).fill(fill)
  }
  return createBuffer(that, size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(null, size, fill, encoding)
};

function allocUnsafe (that, size) {
  assertSize(size);
  that = createBuffer(that, size < 0 ? 0 : checked(size) | 0);
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < size; ++i) {
      that[i] = 0;
    }
  }
  return that
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(null, size)
};
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(null, size)
};

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8';
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('"encoding" must be a valid string encoding')
  }

  var length = byteLength(string, encoding) | 0;
  that = createBuffer(that, length);

  var actual = that.write(string, encoding);

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    that = that.slice(0, actual);
  }

  return that
}

function fromArrayLike (that, array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0;
  that = createBuffer(that, length);
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255;
  }
  return that
}

function fromArrayBuffer (that, array, byteOffset, length) {
  array.byteLength; // this throws if `array` is not a valid ArrayBuffer

  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('\'offset\' is out of bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('\'length\' is out of bounds')
  }

  if (byteOffset === undefined && length === undefined) {
    array = new Uint8Array(array);
  } else if (length === undefined) {
    array = new Uint8Array(array, byteOffset);
  } else {
    array = new Uint8Array(array, byteOffset, length);
  }

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = array;
    that.__proto__ = Buffer.prototype;
  } else {
    // Fallback: Return an object instance of the Buffer class
    that = fromArrayLike(that, array);
  }
  return that
}

function fromObject (that, obj) {
  if (internalIsBuffer(obj)) {
    var len = checked(obj.length) | 0;
    that = createBuffer(that, len);

    if (that.length === 0) {
      return that
    }

    obj.copy(that, 0, 0, len);
    return that
  }

  if (obj) {
    if ((typeof ArrayBuffer !== 'undefined' &&
        obj.buffer instanceof ArrayBuffer) || 'length' in obj) {
      if (typeof obj.length !== 'number' || isnan(obj.length)) {
        return createBuffer(that, 0)
      }
      return fromArrayLike(that, obj)
    }

    if (obj.type === 'Buffer' && isArray(obj.data)) {
      return fromArrayLike(that, obj.data)
    }
  }

  throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
}

function checked (length) {
  // Note: cannot use `length < kMaxLength()` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}


Buffer.isBuffer = isBuffer;
function internalIsBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!internalIsBuffer(a) || !internalIsBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length;
  var y = b.length;

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i];
      y = b[i];
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
};

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
};

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i;
  if (length === undefined) {
    length = 0;
    for (i = 0; i < list.length; ++i) {
      length += list[i].length;
    }
  }

  var buffer = Buffer.allocUnsafe(length);
  var pos = 0;
  for (i = 0; i < list.length; ++i) {
    var buf = list[i];
    if (!internalIsBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos);
    pos += buf.length;
  }
  return buffer
};

function byteLength (string, encoding) {
  if (internalIsBuffer(string)) {
    return string.length
  }
  if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' &&
      (ArrayBuffer.isView(string) || string instanceof ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    string = '' + string;
  }

  var len = string.length;
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false;
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
      case undefined:
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase();
        loweredCase = true;
    }
  }
}
Buffer.byteLength = byteLength;

function slowToString (encoding, start, end) {
  var loweredCase = false;

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0;
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length;
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0;
  start >>>= 0;

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8';

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase();
        loweredCase = true;
    }
  }
}

// The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
// Buffer instances.
Buffer.prototype._isBuffer = true;

function swap (b, n, m) {
  var i = b[n];
  b[n] = b[m];
  b[m] = i;
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length;
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1);
  }
  return this
};

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length;
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3);
    swap(this, i + 1, i + 2);
  }
  return this
};

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length;
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7);
    swap(this, i + 1, i + 6);
    swap(this, i + 2, i + 5);
    swap(this, i + 3, i + 4);
  }
  return this
};

Buffer.prototype.toString = function toString () {
  var length = this.length | 0;
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
};

Buffer.prototype.equals = function equals (b) {
  if (!internalIsBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
};

Buffer.prototype.inspect = function inspect () {
  var str = '';
  var max = INSPECT_MAX_BYTES;
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ');
    if (this.length > max) str += ' ... ';
  }
  return '<Buffer ' + str + '>'
};

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (!internalIsBuffer(target)) {
    throw new TypeError('Argument must be a Buffer')
  }

  if (start === undefined) {
    start = 0;
  }
  if (end === undefined) {
    end = target ? target.length : 0;
  }
  if (thisStart === undefined) {
    thisStart = 0;
  }
  if (thisEnd === undefined) {
    thisEnd = this.length;
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0;
  end >>>= 0;
  thisStart >>>= 0;
  thisEnd >>>= 0;

  if (this === target) return 0

  var x = thisEnd - thisStart;
  var y = end - start;
  var len = Math.min(x, y);

  var thisCopy = this.slice(thisStart, thisEnd);
  var targetCopy = target.slice(start, end);

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i];
      y = targetCopy[i];
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
};

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset;
    byteOffset = 0;
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff;
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000;
  }
  byteOffset = +byteOffset;  // Coerce to Number.
  if (isNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1);
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1;
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0;
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding);
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (internalIsBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF; // Search for a byte value [0-255]
    if (Buffer.TYPED_ARRAY_SUPPORT &&
        typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1;
  var arrLength = arr.length;
  var valLength = val.length;

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase();
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2;
      arrLength /= 2;
      valLength /= 2;
      byteOffset /= 2;
    }
  }

  function read$$1 (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i;
  if (dir) {
    var foundIndex = -1;
    for (i = byteOffset; i < arrLength; i++) {
      if (read$$1(arr, i) === read$$1(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i;
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex;
        foundIndex = -1;
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
    for (i = byteOffset; i >= 0; i--) {
      var found = true;
      for (var j = 0; j < valLength; j++) {
        if (read$$1(arr, i + j) !== read$$1(val, j)) {
          found = false;
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
};

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
};

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
};

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0;
  var remaining = buf.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = Number(length);
    if (length > remaining) {
      length = remaining;
    }
  }

  // must be an even number of digits
  var strLen = string.length;
  if (strLen % 2 !== 0) throw new TypeError('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2;
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16);
    if (isNaN(parsed)) return i
    buf[offset + i] = parsed;
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write$$1 (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8';
    length = this.length;
    offset = 0;
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset;
    length = this.length;
    offset = 0;
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0;
    if (isFinite(length)) {
      length = length | 0;
      if (encoding === undefined) encoding = 'utf8';
    } else {
      encoding = length;
      length = undefined;
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset;
  if (length === undefined || length > remaining) length = remaining;

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8';

  var loweredCase = false;
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase();
        loweredCase = true;
    }
  }
};

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
};

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return fromByteArray(buf)
  } else {
    return fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end);
  var res = [];

  var i = start;
  while (i < end) {
    var firstByte = buf[i];
    var codePoint = null;
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1;

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint;

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte;
          }
          break
        case 2:
          secondByte = buf[i + 1];
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F);
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint;
            }
          }
          break
        case 3:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F);
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint;
            }
          }
          break
        case 4:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          fourthByte = buf[i + 3];
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F);
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint;
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD;
      bytesPerSequence = 1;
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000;
      res.push(codePoint >>> 10 & 0x3FF | 0xD800);
      codePoint = 0xDC00 | codePoint & 0x3FF;
    }

    res.push(codePoint);
    i += bytesPerSequence;
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000;

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length;
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = '';
  var i = 0;
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    );
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = '';
  end = Math.min(buf.length, end);

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F);
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = '';
  end = Math.min(buf.length, end);

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i]);
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length;

  if (!start || start < 0) start = 0;
  if (!end || end < 0 || end > len) end = len;

  var out = '';
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i]);
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end);
  var res = '';
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length;
  start = ~~start;
  end = end === undefined ? len : ~~end;

  if (start < 0) {
    start += len;
    if (start < 0) start = 0;
  } else if (start > len) {
    start = len;
  }

  if (end < 0) {
    end += len;
    if (end < 0) end = 0;
  } else if (end > len) {
    end = len;
  }

  if (end < start) end = start;

  var newBuf;
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = this.subarray(start, end);
    newBuf.__proto__ = Buffer.prototype;
  } else {
    var sliceLen = end - start;
    newBuf = new Buffer(sliceLen, undefined);
    for (var i = 0; i < sliceLen; ++i) {
      newBuf[i] = this[i + start];
    }
  }

  return newBuf
};

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);

  var val = this[offset];
  var mul = 1;
  var i = 0;
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul;
  }

  return val
};

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length);
  }

  var val = this[offset + --byteLength];
  var mul = 1;
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul;
  }

  return val
};

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length);
  return this[offset]
};

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  return this[offset] | (this[offset + 1] << 8)
};

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  return (this[offset] << 8) | this[offset + 1]
};

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
};

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
};

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);

  var val = this[offset];
  var mul = 1;
  var i = 0;
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul;
  }
  mul *= 0x80;

  if (val >= mul) val -= Math.pow(2, 8 * byteLength);

  return val
};

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);

  var i = byteLength;
  var mul = 1;
  var val = this[offset + --i];
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul;
  }
  mul *= 0x80;

  if (val >= mul) val -= Math.pow(2, 8 * byteLength);

  return val
};

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length);
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
};

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  var val = this[offset] | (this[offset + 1] << 8);
  return (val & 0x8000) ? val | 0xFFFF0000 : val
};

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  var val = this[offset + 1] | (this[offset] << 8);
  return (val & 0x8000) ? val | 0xFFFF0000 : val
};

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
};

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
};

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);
  return read(this, offset, true, 23, 4)
};

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);
  return read(this, offset, false, 23, 4)
};

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length);
  return read(this, offset, true, 52, 8)
};

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length);
  return read(this, offset, false, 52, 8)
};

function checkInt (buf, value, offset, ext, max, min) {
  if (!internalIsBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1;
    checkInt(this, value, offset, byteLength, maxBytes, 0);
  }

  var mul = 1;
  var i = 0;
  this[offset] = value & 0xFF;
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF;
  }

  return offset + byteLength
};

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1;
    checkInt(this, value, offset, byteLength, maxBytes, 0);
  }

  var i = byteLength - 1;
  var mul = 1;
  this[offset + i] = value & 0xFF;
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF;
  }

  return offset + byteLength
};

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0);
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
  this[offset] = (value & 0xff);
  return offset + 1
};

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1;
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; ++i) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8;
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff);
    this[offset + 1] = (value >>> 8);
  } else {
    objectWriteUInt16(this, value, offset, true);
  }
  return offset + 2
};

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8);
    this[offset + 1] = (value & 0xff);
  } else {
    objectWriteUInt16(this, value, offset, false);
  }
  return offset + 2
};

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1;
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; ++i) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff;
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24);
    this[offset + 2] = (value >>> 16);
    this[offset + 1] = (value >>> 8);
    this[offset] = (value & 0xff);
  } else {
    objectWriteUInt32(this, value, offset, true);
  }
  return offset + 4
};

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24);
    this[offset + 1] = (value >>> 16);
    this[offset + 2] = (value >>> 8);
    this[offset + 3] = (value & 0xff);
  } else {
    objectWriteUInt32(this, value, offset, false);
  }
  return offset + 4
};

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1);

    checkInt(this, value, offset, byteLength, limit - 1, -limit);
  }

  var i = 0;
  var mul = 1;
  var sub = 0;
  this[offset] = value & 0xFF;
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1;
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
  }

  return offset + byteLength
};

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1);

    checkInt(this, value, offset, byteLength, limit - 1, -limit);
  }

  var i = byteLength - 1;
  var mul = 1;
  var sub = 0;
  this[offset + i] = value & 0xFF;
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1;
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
  }

  return offset + byteLength
};

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80);
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
  if (value < 0) value = 0xff + value + 1;
  this[offset] = (value & 0xff);
  return offset + 1
};

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff);
    this[offset + 1] = (value >>> 8);
  } else {
    objectWriteUInt16(this, value, offset, true);
  }
  return offset + 2
};

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8);
    this[offset + 1] = (value & 0xff);
  } else {
    objectWriteUInt16(this, value, offset, false);
  }
  return offset + 2
};

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff);
    this[offset + 1] = (value >>> 8);
    this[offset + 2] = (value >>> 16);
    this[offset + 3] = (value >>> 24);
  } else {
    objectWriteUInt32(this, value, offset, true);
  }
  return offset + 4
};

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
  if (value < 0) value = 0xffffffff + value + 1;
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24);
    this[offset + 1] = (value >>> 16);
    this[offset + 2] = (value >>> 8);
    this[offset + 3] = (value & 0xff);
  } else {
    objectWriteUInt32(this, value, offset, false);
  }
  return offset + 4
};

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38);
  }
  write(buf, value, offset, littleEndian, 23, 4);
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
};

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
};

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308);
  }
  write(buf, value, offset, littleEndian, 52, 8);
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
};

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
};

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0;
  if (!end && end !== 0) end = this.length;
  if (targetStart >= target.length) targetStart = target.length;
  if (!targetStart) targetStart = 0;
  if (end > 0 && end < start) end = start;

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length;
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start;
  }

  var len = end - start;
  var i;

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start];
    }
  } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    // ascending copy from start
    for (i = 0; i < len; ++i) {
      target[i + targetStart] = this[i + start];
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, start + len),
      targetStart
    );
  }

  return len
};

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start;
      start = 0;
      end = this.length;
    } else if (typeof end === 'string') {
      encoding = end;
      end = this.length;
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0);
      if (code < 256) {
        val = code;
      }
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
  } else if (typeof val === 'number') {
    val = val & 255;
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0;
  end = end === undefined ? this.length : end >>> 0;

  if (!val) val = 0;

  var i;
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val;
    }
  } else {
    var bytes = internalIsBuffer(val)
      ? val
      : utf8ToBytes(new Buffer(val, encoding).toString());
    var len = bytes.length;
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len];
    }
  }

  return this
};

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g;

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '');
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '=';
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity;
  var codePoint;
  var length = string.length;
  var leadSurrogate = null;
  var bytes = [];

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i);

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
          continue
        }

        // valid lead
        leadSurrogate = codePoint;

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
        leadSurrogate = codePoint;
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000;
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
    }

    leadSurrogate = null;

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      );
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      );
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      );
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = [];
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF);
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo;
  var byteArray = [];
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i);
    hi = c >> 8;
    lo = c % 256;
    byteArray.push(lo);
    byteArray.push(hi);
  }

  return byteArray
}


function base64ToBytes (str) {
  return toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i];
  }
  return i
}

function isnan (val) {
  return val !== val // eslint-disable-line no-self-compare
}


// the following is from is-buffer, also by Feross Aboukhadijeh and with same lisence
// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
function isBuffer(obj) {
  return obj != null && (!!obj._isBuffer || isFastBuffer(obj) || isSlowBuffer(obj))
}

function isFastBuffer (obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer (obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isFastBuffer(obj.slice(0, 0))
}

var commonjsGlobal = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};





function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var bitBuffer = createCommonjsModule(function (module) {
(function (root) {

/**********************************************************
 *
 * BitView
 *
 * BitView provides a similar interface to the standard
 * DataView, but with support for bit-level reads / writes.
 *
 **********************************************************/
var BitView = function (source, byteOffset, byteLength) {
	var isBuffer$$1 = source instanceof ArrayBuffer ||
		(typeof Buffer !== 'undefined' && source instanceof Buffer);

	if (!isBuffer$$1) {
		throw new Error('Must specify a valid ArrayBuffer or Buffer.');
	}

	byteOffset = byteOffset || 0;
	byteLength = byteLength || source.byteLength /* ArrayBuffer */ || source.length /* Buffer */;

	this._view = new Uint8Array(source, byteOffset, byteLength);
};

// Used to massage fp values so we can operate on them
// at the bit level.
BitView._scratch = new DataView(new ArrayBuffer(8));

Object.defineProperty(BitView.prototype, 'buffer', {
	get: function () { return new Buffer(this._view); },
	enumerable: true,
	configurable: false
});

Object.defineProperty(BitView.prototype, 'byteLength', {
	get: function () { return this._view.length; },
	enumerable: true,
	configurable: false
});

BitView.prototype._setBit = function (offset, on) {
	if (on) {
		this._view[offset >> 3] |= 1 << (offset & 7);
	} else {
		this._view[offset >> 3] &= ~(1 << (offset & 7));
	}
};

BitView.prototype.getBits = function (offset, bits, signed) {
	var available = (this._view.length * 8 - offset);

	if (bits > available) {
		throw new Error('Cannot get ' + bits + ' bit(s) from offset ' + offset + ', ' + available + ' available');
	}

	var value = 0;
	for (var i = 0; i < bits;) {
		var remaining = bits - i;
		var bitOffset = offset & 7;
		var currentByte = this._view[offset >> 3];

		// the max number of bits we can read from the current byte
		var read = Math.min(remaining, 8 - bitOffset);

		// create a mask with the correct bit width
		var mask = (1 << read) - 1;
		// shift the bits we want to the start of the byte and mask of the rest
		var readBits = (currentByte >> bitOffset) & mask;
		value |= readBits << i;

		offset += read;
		i += read;
	}

	if (signed) {
		// If we're not working with a full 32 bits, check the
		// imaginary MSB for this bit count and convert to a
		// valid 32-bit signed value if set.
		if (bits !== 32 && value & (1 << (bits - 1))) {
			value |= -1 ^ ((1 << bits) - 1);
		}

		return value;
	}

	return value >>> 0;
};

BitView.prototype.setBits = function (offset, value, bits) {
	var available = (this._view.length * 8 - offset);

	if (bits > available) {
		throw new Error('Cannot set ' + bits + ' bit(s) from offset ' + offset + ', ' + available + ' available');
	}

	for (var i = 0; i < bits;) {
		var wrote;

		// Write an entire byte if we can.
		if ((bits - i) >= 8 && ((offset & 7) === 0)) {
			this._view[offset >> 3] = value & 0xFF;
			wrote = 8;
		} else {
			this._setBit(offset, value & 0x1);
			wrote = 1;
		}

		value = (value >> wrote);

		offset += wrote;
		i += wrote;
	}
};

BitView.prototype.getBoolean = function (offset) {
	return this.getBits(offset, 1, false) !== 0;
};
BitView.prototype.getInt8 = function (offset) {
	return this.getBits(offset, 8, true);
};
BitView.prototype.getUint8 = function (offset) {
	return this.getBits(offset, 8, false);
};
BitView.prototype.getInt16 = function (offset) {
	return this.getBits(offset, 16, true);
};
BitView.prototype.getUint16 = function (offset) {
	return this.getBits(offset, 16, false);
};
BitView.prototype.getInt32 = function (offset) {
	return this.getBits(offset, 32, true);
};
BitView.prototype.getUint32 = function (offset) {
	return this.getBits(offset, 32, false);
};
BitView.prototype.getFloat32 = function (offset) {
	BitView._scratch.setUint32(0, this.getUint32(offset));
	return BitView._scratch.getFloat32(0);
};
BitView.prototype.getFloat64 = function (offset) {
	BitView._scratch.setUint32(0, this.getUint32(offset));
	// DataView offset is in bytes.
	BitView._scratch.setUint32(4, this.getUint32(offset+32));
	return BitView._scratch.getFloat64(0);
};

BitView.prototype.setBoolean = function (offset, value) {
	this.setBits(offset, value ? 1 : 0, 1);
};
BitView.prototype.setInt8  =
BitView.prototype.setUint8 = function (offset, value) {
	this.setBits(offset, value, 8);
};
BitView.prototype.setInt16  =
BitView.prototype.setUint16 = function (offset, value) {
	this.setBits(offset, value, 16);
};
BitView.prototype.setInt32  =
BitView.prototype.setUint32 = function (offset, value) {
	this.setBits(offset, value, 32);
};
BitView.prototype.setFloat32 = function (offset, value) {
	BitView._scratch.setFloat32(0, value);
	this.setBits(offset, BitView._scratch.getUint32(0), 32);
};
BitView.prototype.setFloat64 = function (offset, value) {
	BitView._scratch.setFloat64(0, value);
	this.setBits(offset, BitView._scratch.getUint32(0), 32);
	this.setBits(offset+32, BitView._scratch.getUint32(4), 32);
};
BitView.prototype.getArrayBuffer = function (offset, byteLength) {
	var buffer = new Uint8Array(byteLength);
	for (var i = 0; i < byteLength; i++) {
		buffer[i] = this.getUint8(offset + (i * 8));
	}
	return buffer;
};

/**********************************************************
 *
 * BitStream
 *
 * Small wrapper for a BitView to maintain your position,
 * as well as to handle reading / writing of string data
 * to the underlying buffer.
 *
 **********************************************************/
var reader = function (name, size) {
	return function () {
		if (this._index + size > this._length) {
			throw new Error('Trying to read past the end of the stream');
		}
		var val = this._view[name](this._index);
		this._index += size;
		return val;
	};
};

var writer = function (name, size) {
	return function (value) {
		this._view[name](this._index, value);
		this._index += size;
	};
};

function readASCIIString(stream, bytes) {
	return readString(stream, bytes, false);
}

function readUTF8String(stream, bytes) {
	return readString(stream, bytes, true);
}

function readString(stream, bytes, utf8) {
	if (bytes === 0) {
		return '';
	}
	var i = 0;
	var chars = [];
	var append = true;
	var fixedLength = !!bytes;
	if (!bytes) {
		bytes = Math.floor((stream._length - stream._index) / 8);
	}

	// Read while we still have space available, or until we've
	// hit the fixed byte length passed in.
	while (i < bytes) {
		var c = stream.readUint8();

		// Stop appending chars once we hit 0x00
		if (c === 0x00) {
			append = false;

			// If we don't have a fixed length to read, break out now.
			if (!fixedLength) {
				break;
			}
		}
		if (append) {
			chars.push(c);
		}

		i++;
	}

	var string = String.fromCharCode.apply(null, chars);
	if (utf8) {
		try {
			return decodeURIComponent(escape(string)); // https://stackoverflow.com/a/17192845
		} catch (e) {
			return string;
		}
	} else {
		return string;
	}
}

function writeASCIIString(stream, string, bytes) {
	var length = bytes || string.length + 1;  // + 1 for NULL

	for (var i = 0; i < length; i++) {
		stream.writeUint8(i < string.length ? string.charCodeAt(i) : 0x00);
	}
}

function writeUTF8String(stream, string, bytes) {
	var byteArray = stringToByteArray(string);

	var length = bytes || byteArray.length + 1;  // + 1 for NULL
	for (var i = 0; i < length; i++) {
		stream.writeUint8(i < byteArray.length ? byteArray[i] : 0x00);
	}
}

function stringToByteArray(str) { // https://gist.github.com/volodymyr-mykhailyk/2923227
	var b = [], i, unicode;
	for (i = 0; i < str.length; i++) {
		unicode = str.charCodeAt(i);
		// 0x00000000 - 0x0000007f -> 0xxxxxxx
		if (unicode <= 0x7f) {
			b.push(unicode);
			// 0x00000080 - 0x000007ff -> 110xxxxx 10xxxxxx
		} else if (unicode <= 0x7ff) {
			b.push((unicode >> 6) | 0xc0);
			b.push((unicode & 0x3F) | 0x80);
			// 0x00000800 - 0x0000ffff -> 1110xxxx 10xxxxxx 10xxxxxx
		} else if (unicode <= 0xffff) {
			b.push((unicode >> 12) | 0xe0);
			b.push(((unicode >> 6) & 0x3f) | 0x80);
			b.push((unicode & 0x3f) | 0x80);
			// 0x00010000 - 0x001fffff -> 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
		} else {
			b.push((unicode >> 18) | 0xf0);
			b.push(((unicode >> 12) & 0x3f) | 0x80);
			b.push(((unicode >> 6) & 0x3f) | 0x80);
			b.push((unicode & 0x3f) | 0x80);
		}
	}

	return b;
}

var BitStream = function (source, byteOffset, byteLength) {
	var isBuffer$$1 = source instanceof ArrayBuffer ||
		(typeof Buffer !== 'undefined' && source instanceof Buffer);

	if (!(source instanceof BitView) && !isBuffer$$1) {
		throw new Error('Must specify a valid BitView, ArrayBuffer or Buffer');
	}

	if (isBuffer$$1) {
		this._view = new BitView(source, byteOffset, byteLength);
	} else {
		this._view = source;
	}

	this._index = 0;
	this._startIndex = 0;
	this._length = this._view.byteLength * 8;
};

Object.defineProperty(BitStream.prototype, 'index', {
	get: function () { return this._index - this._startIndex },
	set: function (val) { this._index = val + this._startIndex; },
	enumerable: true,
	configurable: true
});

Object.defineProperty(BitStream.prototype, 'length', {
	get: function () {return this._length - this._startIndex},
	set: function (val) {this._length = val + this._startIndex;},
	enumerable  : true,
	configurable: true
});

Object.defineProperty(BitStream.prototype, 'bitsLeft', {
	get: function () {return this._length - this._index},
	enumerable  : true,
	configurable: true
});

Object.defineProperty(BitStream.prototype, 'byteIndex', {
	// Ceil the returned value, over compensating for the amount of
	// bits written to the stream.
	get: function () { return Math.ceil(this._index / 8); },
	set: function (val) { this._index = val * 8; },
	enumerable: true,
	configurable: true
});

Object.defineProperty(BitStream.prototype, 'buffer', {
	get: function () { return new Buffer(this._view); },
	enumerable: true,
	configurable: false
});

Object.defineProperty(BitStream.prototype, 'view', {
	get: function () { return this._view; },
	enumerable: true,
	configurable: false
});

BitStream.prototype.readBits = function (bits, signed) {
	var val = this._view.getBits(this._index, bits, signed);
	this._index += bits;
	return val;
};

BitStream.prototype.writeBits = function (value, bits) {
	this._view.setBits(this._index, value, bits);
	this._index += bits;
};

BitStream.prototype.readBoolean = reader('getBoolean', 1);
BitStream.prototype.readInt8 = reader('getInt8', 8);
BitStream.prototype.readUint8 = reader('getUint8', 8);
BitStream.prototype.readInt16 = reader('getInt16', 16);
BitStream.prototype.readUint16 = reader('getUint16', 16);
BitStream.prototype.readInt32 = reader('getInt32', 32);
BitStream.prototype.readUint32 = reader('getUint32', 32);
BitStream.prototype.readFloat32 = reader('getFloat32', 32);
BitStream.prototype.readFloat64 = reader('getFloat64', 64);

BitStream.prototype.writeBoolean = writer('setBoolean', 1);
BitStream.prototype.writeInt8 = writer('setInt8', 8);
BitStream.prototype.writeUint8 = writer('setUint8', 8);
BitStream.prototype.writeInt16 = writer('setInt16', 16);
BitStream.prototype.writeUint16 = writer('setUint16', 16);
BitStream.prototype.writeInt32 = writer('setInt32', 32);
BitStream.prototype.writeUint32 = writer('setUint32', 32);
BitStream.prototype.writeFloat32 = writer('setFloat32', 32);
BitStream.prototype.writeFloat64 = writer('setFloat64', 64);

BitStream.prototype.readASCIIString = function (bytes) {
	return readASCIIString(this, bytes);
};

BitStream.prototype.readUTF8String = function (bytes) {
	return readUTF8String(this, bytes);
};

BitStream.prototype.writeASCIIString = function (string, bytes) {
	writeASCIIString(this, string, bytes);
};

BitStream.prototype.writeUTF8String = function (string, bytes) {
	writeUTF8String(this, string, bytes);
};
BitStream.prototype.readBitStream = function(bitLength) {
	var slice = new BitStream(this._view);
	slice._startIndex = this._index;
	slice._index = this._index;
	slice.length = bitLength;
	this._index += bitLength;
	return slice;
};
BitStream.prototype.readArrayBuffer = function(byteLength) {
	var buffer = this._view.getArrayBuffer(this._index, byteLength);
	this._index += (byteLength * 8);
	return buffer;
};

// AMD / RequireJS
if (typeof undefined !== 'undefined' && undefined.amd) {
	undefined(function () {
		return {
			BitView: BitView,
			BitStream: BitStream
		};
	});
}
// Node.js
else if ('object' !== 'undefined' && module.exports) {
	module.exports = {
		BitView: BitView,
		BitStream: BitStream
	};
}

}(commonjsGlobal));
});

var bitBuffer_2 = bitBuffer.BitStream;

function make(name, definition) {
    var parts = definition.substr(0, definition.length - 1).split('}'); //remove leading } to prevent empty part
    var items = parts.map(function (part) {
        return part.split('{');
    });
    return function (stream) {
        var result = {
            'packetType': name
        };
        try {
            for (var i = 0; i < items.length; i++) {
                var value = readItem(stream, items[i][1], result);
                if (items[i][0] !== '_') {
                    result[items[i][0]] = value;
                }
            }
        }
        catch (e) {
            throw new Error('Failed reading pattern ' + definition + '. ' + e);
        }
        return result;
    };
}
var readItem = function (stream, description, data) {
    var length;
    if (description[0] === 'b') {
        return stream.readBoolean();
    }
    else if (description[0] === 's') {
        if (description.length === 1) {
            return stream.readUTF8String();
        }
        else {
            length = parseInt(description.substr(1), 10);
            return stream.readASCIIString(length);
        }
    }
    else if (description === 'f32') {
        return stream.readFloat32();
    }
    else if (description[0] === 'u') {
        length = parseInt(description.substr(1), 10);
        return stream.readBits(length);
    }
    else if (description[0] === '$') {
        var variable = description.substr(1);
        return stream.readBits(data[variable]);
    }
    else {
        return stream.readBits(parseInt(description, 10), true);
    }
};

var Parser$1 = (function () {
    function Parser(type, tick, stream, length, match) {
        this.type = type;
        this.tick = tick;
        this.stream = stream;
        this.length = length; //length in bytes
        this.match = match;
    }
    return Parser;
}());

var getCoord = function (stream) {
    var hasInt = !!stream.readBits(1);
    var hasFract = !!stream.readBits(1);
    var value = 0;
    if (hasInt || hasFract) {
        var sign = !!stream.readBits(1);
        if (hasInt) {
            value += stream.readBits(14) + 1;
        }
        if (hasFract) {
            value += stream.readBits(5) * (1 / 32);
        }
        if (sign) {
            value = -value;
        }
    }
    return value;
};
var getVecCoord = function (stream) {
    var hasX = !!stream.readBits(1);
    var hasY = !!stream.readBits(1);
    var hasZ = !!stream.readBits(1);
    return {
        x: hasX ? getCoord(stream) : 0,
        y: hasY ? getCoord(stream) : 0,
        z: hasZ ? getCoord(stream) : 0
    };
};
function BSPDecal(stream) {
    var modelIndex, entIndex;
    var position = getVecCoord(stream);
    var textureIndex = stream.readBits(9);
    if (stream.readBits(1)) {
        entIndex = stream.readBits(11);
        modelIndex = stream.readBits(12);
    }
    var lowPriority = stream.readBoolean();
    return {
        packetType: 'bspDecal',
        position: position,
        textureIndex: textureIndex,
        entIndex: entIndex,
        modelIndex: modelIndex,
        lowPriority: lowPriority
    };
}

function logBase2(num) {
    var result = 0;
    while ((num >>= 1) != 0) {
        result++;
    }
    return result;
}

function ClassInfo(stream) {
    var number = stream.readBits(16);
    var create = stream.readBoolean();
    var entries = [];
    if (!create) {
        var bits = logBase2(number) + 1;
        for (var i = 0; i < number; i++) {
            var entry = {
                'classId': stream.readBits(bits),
                'className': stream.readASCIIString(),
                'dataTableName': stream.readASCIIString()
            };
            entries.push(entry);
        }
    }
    return {
        'packetType': 'classInfo',
        number: number,
        create: create,
        entries: entries
    };
}

function readBitVar(stream, signed) {
    var type = stream.readBits(2);
    switch (type) {
        case 0:
            return stream.readBits(4, signed);
        case 1:
            return stream.readBits(8, signed);
        case 2:
            return stream.readBits(12, signed);
        case 3:
            return stream.readBits(32, signed);
    }
    throw new Error('Invalid var bit');
}
var readUBitVar = readBitVar;
function readVarInt(stream, signed) {
    if (signed === void 0) { signed = false; }
    var result = 0;
    for (var i = 0; i < 35; i += 7) {
        var byte = stream.readBits(8);
        result |= ((byte & 0x7F) << i);
        if ((byte >> 7) === 0) {
            break;
        }
    }
    if (signed) {
        return ((result >> 1) ^ -(result & 1));
    }
    else {
        return result;
    }
}

// shim for using process in browser
// based off https://github.com/defunctzombie/node-process/blob/master/browser.js

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
var cachedSetTimeout = defaultSetTimout;
var cachedClearTimeout = defaultClearTimeout;
if (typeof global$1.setTimeout === 'function') {
    cachedSetTimeout = setTimeout;
}
if (typeof global$1.clearTimeout === 'function') {
    cachedClearTimeout = clearTimeout;
}

function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}
function nextTick(fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
}
// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
var title = 'browser';
var platform = 'browser';
var browser = true;
var env = {};
var argv = [];
var version = ''; // empty string to avoid regexp issues
var versions = {};
var release = {};
var config = {};

function noop() {}

var on = noop;
var addListener = noop;
var once = noop;
var off = noop;
var removeListener = noop;
var removeAllListeners = noop;
var emit = noop;

function binding(name) {
    throw new Error('process.binding is not supported');
}

function cwd () { return '/' }
function chdir (dir) {
    throw new Error('process.chdir is not supported');
}
function umask() { return 0; }

// from https://github.com/kumavis/browser-process-hrtime/blob/master/index.js
var performance = global$1.performance || {};
var performanceNow =
  performance.now        ||
  performance.mozNow     ||
  performance.msNow      ||
  performance.oNow       ||
  performance.webkitNow  ||
  function(){ return (new Date()).getTime() };

// generate timestamp or delta
// see http://nodejs.org/api/process.html#process_process_hrtime
function hrtime(previousTimestamp){
  var clocktime = performanceNow.call(performance)*1e-3;
  var seconds = Math.floor(clocktime);
  var nanoseconds = Math.floor((clocktime%1)*1e9);
  if (previousTimestamp) {
    seconds = seconds - previousTimestamp[0];
    nanoseconds = nanoseconds - previousTimestamp[1];
    if (nanoseconds<0) {
      seconds--;
      nanoseconds += 1e9;
    }
  }
  return [seconds,nanoseconds]
}

var startTime = new Date();
function uptime() {
  var currentTime = new Date();
  var dif = currentTime - startTime;
  return dif / 1000;
}

var process = {
  nextTick: nextTick,
  title: title,
  browser: browser,
  env: env,
  argv: argv,
  version: version,
  versions: versions,
  on: on,
  addListener: addListener,
  once: once,
  off: off,
  removeListener: removeListener,
  removeAllListeners: removeAllListeners,
  emit: emit,
  binding: binding,
  cwd: cwd,
  chdir: chdir,
  umask: umask,
  hrtime: hrtime,
  platform: platform,
  release: release,
  config: config,
  uptime: uptime
};

// The MIT License (MIT)
//
// Copyright (c) 2016 Zhipeng Jia
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

var WORD_MASK = [0, 0xff, 0xffff, 0xffffff, 0xffffffff];

function copyBytes (from_array, from_pos, to_array, to_pos, length) {
  var i;
  for (i = 0; i < length; i++) {
    to_array[to_pos + i] = from_array[from_pos + i];
  }
}

function selfCopyBytes (array, pos, offset, length) {
  var i;
  for (i = 0; i < length; i++) {
    array[pos + i] = array[pos - offset + i];
  }
}

function SnappyDecompressor$1 (compressed) {
  this.array = compressed;
  this.pos = 0;
}

SnappyDecompressor$1.prototype.readUncompressedLength = function () {
  var result = 0;
  var shift = 0;
  var c, val;
  while (shift < 32 && this.pos < this.array.length) {
    c = this.array[this.pos];
    this.pos += 1;
    val = c & 0x7f;
    if (((val << shift) >>> shift) !== val) {
      return -1
    }
    result |= val << shift;
    if (c < 128) {
      return result
    }
    shift += 7;
  }
  return -1
};

SnappyDecompressor$1.prototype.uncompressToBuffer = function (out_buffer) {
  var array = this.array;
  var array_length = array.length;
  var pos = this.pos;
  var out_pos = 0;

  var c, len, small_len;
  var offset;

  while (pos < array.length) {
    c = array[pos];
    pos += 1;
    if ((c & 0x3) === 0) {
      // Literal
      len = (c >>> 2) + 1;
      if (len > 60) {
        if (pos + 3 >= array_length) {
          return false
        }
        small_len = len - 60;
        len = array[pos] + (array[pos + 1] << 8) + (array[pos + 2] << 16) + (array[pos + 3] << 24);
        len = (len & WORD_MASK[small_len]) + 1;
        pos += small_len;
      }
      if (pos + len > array_length) {
        return false
      }
      copyBytes(array, pos, out_buffer, out_pos, len);
      pos += len;
      out_pos += len;
    } else {
      switch (c & 0x3) {
        case 1:
          len = ((c >>> 2) & 0x7) + 4;
          offset = array[pos] + ((c >>> 5) << 8);
          pos += 1;
          break
        case 2:
          if (pos + 1 >= array_length) {
            return false
          }
          len = (c >>> 2) + 1;
          offset = array[pos] + (array[pos + 1] << 8);
          pos += 2;
          break
        case 3:
          if (pos + 3 >= array_length) {
            return false
          }
          len = (c >>> 2) + 1;
          offset = array[pos] + (array[pos + 1] << 8) + (array[pos + 2] << 16) + (array[pos + 3] << 24);
          pos += 4;
          break
        default:
          break
      }
      if (offset === 0 || offset > out_pos) {
        return false
      }
      selfCopyBytes(out_buffer, out_pos, offset, len);
      out_pos += len;
    }
  }
  return true
};

var SnappyDecompressor_1 = SnappyDecompressor$1;

var snappy_decompressor = {
	SnappyDecompressor: SnappyDecompressor_1
};

// The MIT License (MIT)
//
// Copyright (c) 2016 Zhipeng Jia
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

function isNode () {
  if (typeof process === 'object') {
    if (typeof process.versions === 'object') {
      if (typeof process.versions.node !== 'undefined') {
        return true
      }
    }
  }
  return false
}

var is_node = isNode();

function isUint8Array (object) {
  return object instanceof Uint8Array && (!is_node || !isBuffer(object))
}

function isArrayBuffer (object) {
  return object instanceof ArrayBuffer
}

function isBuffer$1 (object) {
  if (!is_node) {
    return false
  }
  return isBuffer(object)
}

var SnappyDecompressor = snappy_decompressor.SnappyDecompressor;
var TYPE_ERROR_MSG = 'Argument compressed must be type of ArrayBuffer, Buffer, or Uint8Array';

function uncompress (compressed) {
  if (!isUint8Array(compressed) && !isArrayBuffer(compressed) && !isBuffer$1(compressed)) {
    throw new TypeError(TYPE_ERROR_MSG)
  }
  var uint8_mode = false;
  var array_buffer_mode = false;
  if (isUint8Array(compressed)) {
    uint8_mode = true;
  } else if (isArrayBuffer(compressed)) {
    array_buffer_mode = true;
    compressed = new Uint8Array(compressed);
  }
  var decompressor = new SnappyDecompressor(compressed);
  var length = decompressor.readUncompressedLength();
  if (length === -1) {
    throw new Error('Invalid Snappy bitstream')
  }
  var uncompressed, uncompressed_view;
  if (uint8_mode) {
    uncompressed = new Uint8Array(length);
    if (!decompressor.uncompressToBuffer(uncompressed)) {
      throw new Error('Invalid Snappy bitstream')
    }
  } else if (array_buffer_mode) {
    uncompressed = new ArrayBuffer(length);
    uncompressed_view = new Uint8Array(uncompressed);
    if (!decompressor.uncompressToBuffer(uncompressed_view)) {
      throw new Error('Invalid Snappy bitstream')
    }
  } else {
    uncompressed = new Buffer(length);
    if (!decompressor.uncompressToBuffer(uncompressed)) {
      throw new Error('Invalid Snappy bitstream')
    }
  }
  return uncompressed
}

var uncompress_1 = uncompress;

function parseStringTable(stream, table, entries, match) {
    var entryBits = logBase2(table.maxEntries);
    var lastEntry = -1;
    var history = [];
    for (var i = 0; i < entries; i++) {
        var entryIndex = lastEntry + 1;
        if (!stream.readBoolean()) {
            entryIndex = stream.readBits(entryBits);
        }
        lastEntry = entryIndex;
        if (entryIndex < 0 || entryIndex > table.maxEntries) {
            throw new Error("Invalid string index for stringtable");
        }
        var value = void 0;
        if (stream.readBoolean()) {
            var subStringCheck = stream.readBoolean();
            if (subStringCheck) {
                var index = stream.readBits(5);
                var bytesToCopy = stream.readBits(5);
                var restOfString = stream.readASCIIString();
                if (!history[index].text) {
                    value = restOfString; // best guess, happens in some pov demos but only for unimported tables it seems
                }
                else {
                    value = history[index].text.substr(0, bytesToCopy) + restOfString;
                }
            }
            else {
                value = stream.readASCIIString();
            }
        }
        var userData = void 0;
        if (stream.readBoolean()) {
            if (table.fixedUserDataSize && table.fixedUserDataSizeBits) {
                userData = stream.readBitStream(table.fixedUserDataSizeBits);
            }
            else {
                var userDataBytes = stream.readBits(14);
                userData = stream.readBitStream(userDataBytes * 8);
            }
        }
        if (table.entries[entryIndex]) {
            var existingEntry = table.entries[entryIndex];
            if (userData) {
                existingEntry.extraData = userData;
            }
            if (value) {
                existingEntry.text = value;
            }
            history.push(existingEntry);
        }
        else {
            table.entries[entryIndex] = {
                text: value,
                extraData: userData
            };
            history.push(table.entries[entryIndex]);
        }
        if (history.length > 32) {
            history.shift();
        }
    }
}

function CreateStringTable(stream, match) {
    var tableName = stream.readASCIIString();
    var maxEntries = stream.readUint16();
    var encodeBits = logBase2(maxEntries);
    var entityCount = stream.readBits(encodeBits + 1);
    var bitCount = readVarInt(stream);
    var userDataSize = 0;
    var userDataSizeBits = 0;
    // userdata fixed size
    if (stream.readBoolean()) {
        userDataSize = stream.readBits(12);
        userDataSizeBits = stream.readBits(4);
    }
    var isCompressed = stream.readBoolean();
    var data = stream.readBitStream(bitCount);
    if (isCompressed) {
        var decompressedByteSize = data.readUint32();
        var compressedByteSize = data.readUint32();
        var magic = data.readASCIIString(4);
        var compressedData = data.readArrayBuffer(compressedByteSize - 4); // 4 magic bytes
        if (magic !== 'SNAP') {
            throw new Error("Unknown compressed stringtable format");
        }
        var decompressedData = uncompress_1(compressedData);
        if (decompressedData.byteLength !== decompressedByteSize) {
            throw new Error("Incorrect length of decompressed stringtable");
        }
        data = new bitBuffer_2(decompressedData.buffer);
    }
    var table = {
        name: tableName,
        entries: [],
        maxEntries: maxEntries,
        fixedUserDataSize: userDataSize,
        fixedUserDataSizeBits: userDataSizeBits
    };
    parseStringTable(data, table, entityCount, match);
    match.stringTables.push(table);
    return {
        packetType: 'stringTable',
        tables: [table]
    };
}

var baseParser = make('entityMessage', 'index{11}classId{9}length{11}data{$length}');
function EntityMessage(stream, match) {
    var result = baseParser(stream); //todo parse data further?
    return result;
}

var GameEventType;
(function (GameEventType) {
    GameEventType[GameEventType["STRING"] = 1] = "STRING";
    GameEventType[GameEventType["FLOAT"] = 2] = "FLOAT";
    GameEventType[GameEventType["LONG"] = 3] = "LONG";
    GameEventType[GameEventType["SHORT"] = 4] = "SHORT";
    GameEventType[GameEventType["BYTE"] = 5] = "BYTE";
    GameEventType[GameEventType["BOOLEAN"] = 6] = "BOOLEAN";
    GameEventType[GameEventType["LOCAL"] = 7] = "LOCAL";
})(GameEventType || (GameEventType = {}));

var parseGameEvent = function (eventId, stream, events) {
    if (!events[eventId]) {
        throw new Error('unknown event type');
    }
    var eventDescription = events[eventId];
    var values = {};
    for (var i = 0; i < eventDescription.entries.length; i++) {
        var entry = eventDescription.entries[i];
        var value = getGameEventValue(stream, entry);
        if (value) {
            values[entry.name] = value;
        }
    }
    return {
        name: eventDescription.name,
        values: values
    };
};
var getGameEventValue = function (stream, entry) {
    switch (entry.type) {
        case GameEventType.STRING:
            return stream.readUTF8String();
        case GameEventType.FLOAT:
            return stream.readFloat32();
        case GameEventType.LONG:
            return stream.readUint32();
        case GameEventType.SHORT:
            return stream.readUint16();
        case GameEventType.BYTE:
            return stream.readUint8();
        case GameEventType.BOOLEAN:
            return stream.readBoolean();
        case GameEventType.LOCAL:
            return null;
        default:
            throw new Error('invalid game event type');
    }
};
function GameEvent(stream, match) {
    var length = stream.readBits(11);
    var end = stream.index + length;
    var eventId = stream.readBits(9);
    var event = parseGameEvent(eventId, stream, match.eventDefinitions);
    stream.index = end;
    return {
        packetType: 'gameEvent',
        event: event
    };
}

function GameEventList(stream, match) {
    // list of game events and parameters
    var numEvents = stream.readBits(9);
    var length = stream.readBits(20);
    var eventList = {};
    for (var i = 0; i < numEvents; i++) {
        var id = stream.readBits(9);
        var name_1 = stream.readASCIIString();
        var type = stream.readBits(3);
        var entries = [];
        while (type !== 0) {
            entries.push({
                type: type,
                name: stream.readASCIIString()
            });
            type = stream.readBits(3);
        }
        eventList[id] = {
            id: id,
            name: name_1,
            entries: entries
        };
    }
    return {
        packetType: 'gameEventList',
        eventList: eventList
    };
}

var PVS;
(function (PVS) {
    PVS[PVS["PRESERVE"] = 0] = "PRESERVE";
    PVS[PVS["ENTER"] = 1] = "ENTER";
    PVS[PVS["LEAVE"] = 2] = "LEAVE";
    PVS[PVS["DELETE"] = 4] = "DELETE";
})(PVS || (PVS = {}));
var PacketEntity = (function () {
    function PacketEntity(serverClass, entityIndex, pvs) {
        this.serverClass = serverClass;
        this.entityIndex = entityIndex;
        this.props = [];
        this.inPVS = false;
        this.pvs = pvs;
    }
    PacketEntity.prototype.getPropByDefinition = function (definition) {
        for (var i = 0; i < this.props.length; i++) {
            if (this.props[i].definition === definition) {
                return this.props[i];
            }
        }
        return null;
    };
    PacketEntity.prototype.getProperty = function (originTable, name) {
        for (var _i = 0, _a = this.props; _i < _a.length; _i++) {
            var prop = _a[_i];
            if (prop.definition.ownerTableName === originTable && prop.definition.name === name) {
                return prop;
            }
        }
        throw new Error("Property not found in entity (" + originTable + "." + name + ")");
    };
    PacketEntity.prototype.clone = function () {
        var result = new PacketEntity(this.serverClass, this.entityIndex, this.pvs);
        for (var _i = 0, _a = this.props; _i < _a.length; _i++) {
            var prop = _a[_i];
            result.props.push(prop.clone());
        }
        return result;
    };
    return PacketEntity;
}());

var SendProp = (function () {
    function SendProp(definition) {
        this.definition = definition;
        this.value = null;
    }
    SendProp.prototype.clone = function () {
        var prop = new SendProp(this.definition);
        prop.value = this.value;
        return prop;
    };
    return SendProp;
}());

var SendPropDefinition = (function () {
    function SendPropDefinition(type, name, flags, ownerTableName) {
        this.type = type;
        this.name = name;
        this.flags = flags;
        this.excludeDTName = null;
        this.lowValue = 0;
        this.highValue = 0;
        this.bitCount = 0;
        this.table = null;
        this.numElements = null;
        this.arrayProperty = null;
        this.ownerTableName = ownerTableName;
    }
    SendPropDefinition.prototype.hasFlag = function (flag) {
        return (this.flags & flag) != 0;
    };
    SendPropDefinition.prototype.isExcludeProp = function () {
        return this.hasFlag(SendPropFlag.SPROP_EXCLUDE);
    };
    SendPropDefinition.prototype.inspect = function () {
        var data = {
            fromTable: this.ownerTableName,
            name: this.name,
            type: SendPropType[this.type],
            flags: SendPropDefinition.formatFlags(this.flags),
            bitCount: this.bitCount
        };
        if (this.type === SendPropType.DPT_Float) {
            data.lowValue = this.lowValue;
            data.highValue = this.highValue;
        }
        if (this.type === SendPropType.DPT_DataTable && this.table) {
            data.tableName = this.table.name;
        }
        return data;
    };
    SendPropDefinition.formatFlags = function (flags) {
        var names = [];
        for (var name_1 in SendPropFlag) {
            var flagValue = SendPropFlag[name_1];
            if (typeof flagValue === 'number') {
                if (flags & flagValue) {
                    names.push(name_1);
                }
            }
        }
        return names;
    };
    return SendPropDefinition;
}());
var SendPropType;
(function (SendPropType) {
    SendPropType[SendPropType["DPT_Int"] = 0] = "DPT_Int";
    SendPropType[SendPropType["DPT_Float"] = 1] = "DPT_Float";
    SendPropType[SendPropType["DPT_Vector"] = 2] = "DPT_Vector";
    SendPropType[SendPropType["DPT_VectorXY"] = 3] = "DPT_VectorXY";
    SendPropType[SendPropType["DPT_String"] = 4] = "DPT_String";
    SendPropType[SendPropType["DPT_Array"] = 5] = "DPT_Array";
    SendPropType[SendPropType["DPT_DataTable"] = 6] = "DPT_DataTable";
    SendPropType[SendPropType["DPT_NUMSendPropTypes"] = 7] = "DPT_NUMSendPropTypes";
})(SendPropType || (SendPropType = {}));
var SendPropFlag;
(function (SendPropFlag) {
    SendPropFlag[SendPropFlag["SPROP_UNSIGNED"] = 1] = "SPROP_UNSIGNED";
    SendPropFlag[SendPropFlag["SPROP_COORD"] = 2] = "SPROP_COORD";
    // Note that the bit count is ignored in this case.
    SendPropFlag[SendPropFlag["SPROP_NOSCALE"] = 4] = "SPROP_NOSCALE";
    SendPropFlag[SendPropFlag["SPROP_ROUNDDOWN"] = 8] = "SPROP_ROUNDDOWN";
    SendPropFlag[SendPropFlag["SPROP_ROUNDUP"] = 16] = "SPROP_ROUNDUP";
    SendPropFlag[SendPropFlag["SPROP_NORMAL"] = 32] = "SPROP_NORMAL";
    SendPropFlag[SendPropFlag["SPROP_EXCLUDE"] = 64] = "SPROP_EXCLUDE";
    SendPropFlag[SendPropFlag["SPROP_XYZE"] = 128] = "SPROP_XYZE";
    SendPropFlag[SendPropFlag["SPROP_INSIDEARRAY"] = 256] = "SPROP_INSIDEARRAY";
    // flattened property list. Its array will point at it when it needs to.
    SendPropFlag[SendPropFlag["SPROP_PROXY_ALWAYS_YES"] = 512] = "SPROP_PROXY_ALWAYS_YES";
    // SendProxy_DataTableToDataTable that always send the data to all clients.
    SendPropFlag[SendPropFlag["SPROP_CHANGES_OFTEN"] = 1024] = "SPROP_CHANGES_OFTEN";
    SendPropFlag[SendPropFlag["SPROP_IS_A_VECTOR_ELEM"] = 2048] = "SPROP_IS_A_VECTOR_ELEM";
    SendPropFlag[SendPropFlag["SPROP_COLLAPSIBLE"] = 4096] = "SPROP_COLLAPSIBLE";
    // (ie: for all automatically-chained base classes).
    // In this case, it can get rid of this SendPropDataTable altogether and spare the
    // trouble of walking the hierarchy more than necessary.
    SendPropFlag[SendPropFlag["SPROP_COORD_MP"] = 8192] = "SPROP_COORD_MP";
    SendPropFlag[SendPropFlag["SPROP_COORD_MP_LOWPRECISION"] = 16384] = "SPROP_COORD_MP_LOWPRECISION";
    SendPropFlag[SendPropFlag["SPROP_COORD_MP_INTEGRAL"] = 32768] = "SPROP_COORD_MP_INTEGRAL";
    SendPropFlag[SendPropFlag["SPROP_VARINT"] = 32] = "SPROP_VARINT";
})(SendPropFlag || (SendPropFlag = {}));

var Vector = (function () {
    function Vector(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    return Vector;
}());

var SendPropParser = (function () {
    function SendPropParser() {
    }
    SendPropParser.decode = function (propDefinition, stream) {
        switch (propDefinition.type) {
            case SendPropType.DPT_Int:
                return SendPropParser.readInt(propDefinition, stream);
            case SendPropType.DPT_Vector:
                return SendPropParser.readVector(propDefinition, stream);
            case SendPropType.DPT_VectorXY:
                return SendPropParser.readVectorXY(propDefinition, stream);
            case SendPropType.DPT_Float:
                return SendPropParser.readFloat(propDefinition, stream);
            case SendPropType.DPT_String:
                return SendPropParser.readString(stream);
            case SendPropType.DPT_Array:
                return SendPropParser.readArray(propDefinition, stream);
        }
        throw new Error('Unknown property type');
    };
    SendPropParser.readInt = function (propDefinition, stream) {
        if (propDefinition.hasFlag(SendPropFlag.SPROP_VARINT)) {
            return readVarInt(stream, !propDefinition.hasFlag(SendPropFlag.SPROP_UNSIGNED));
        }
        else {
            return stream.readBits(propDefinition.bitCount, !propDefinition.hasFlag(SendPropFlag.SPROP_UNSIGNED));
        }
    };
    SendPropParser.readArray = function (propDefinition, stream) {
        var maxElements = propDefinition.numElements || 0;
        var numBits = 1;
        while ((maxElements >>= 1) != 0)
            numBits++;
        var count = stream.readBits(numBits);
        var values = [];
        if (!propDefinition.arrayProperty) {
            throw new Error('Array of undefined type');
        }
        for (var i = 0; i < count; i++) {
            var value = SendPropParser.decode(propDefinition.arrayProperty, stream);
            if (value instanceof Array) {
                throw new Error('Nested arrays not supported');
            }
            values.push(value);
        }
        return values;
    };
    SendPropParser.readString = function (stream) {
        var length = stream.readBits(9);
        return stream.readASCIIString(length);
    };
    SendPropParser.readVector = function (propDefinition, stream) {
        var x = SendPropParser.readFloat(propDefinition, stream);
        var y = SendPropParser.readFloat(propDefinition, stream);
        var z = SendPropParser.readFloat(propDefinition, stream);
        return new Vector(x, y, z);
    };
    SendPropParser.readVectorXY = function (propDefinition, stream) {
        var x = SendPropParser.readFloat(propDefinition, stream);
        var y = SendPropParser.readFloat(propDefinition, stream);
        return new Vector(x, y, 0);
    };
    SendPropParser.readFloat = function (propDefinition, stream) {
        if (propDefinition.hasFlag(SendPropFlag.SPROP_COORD)) {
            return SendPropParser.readBitCoord(stream);
        }
        else if (propDefinition.hasFlag(SendPropFlag.SPROP_COORD_MP)) {
            return SendPropParser.readBitCoordMP(propDefinition, stream, false, false);
        }
        else if (propDefinition.hasFlag(SendPropFlag.SPROP_COORD_MP_LOWPRECISION)) {
            return SendPropParser.readBitCoordMP(propDefinition, stream, false, true);
        }
        else if (propDefinition.hasFlag(SendPropFlag.SPROP_COORD_MP_INTEGRAL)) {
            return SendPropParser.readBitCoordMP(propDefinition, stream, true, false);
        }
        else if (propDefinition.hasFlag(SendPropFlag.SPROP_NOSCALE)) {
            return stream.readFloat32();
        }
        else if (propDefinition.hasFlag(SendPropFlag.SPROP_NORMAL)) {
            return SendPropParser.readBitNormal(stream);
        }
        else {
            var raw = stream.readBits(propDefinition.bitCount);
            var percentage = raw / ((1 << propDefinition.bitCount) - 1);
            return propDefinition.lowValue + (propDefinition.highValue - propDefinition.lowValue) * percentage;
        }
    };
    SendPropParser.readBitNormal = function (stream) {
        var isNegative = stream.readBoolean();
        var fractVal = stream.readBits(11);
        var value = fractVal * (1 / ((1 << 11) - 1));
        return (isNegative) ? -value : value;
    };
    SendPropParser.readBitCoord = function (stream) {
        var hasIntVal = stream.readBoolean();
        var hasFractVal = stream.readBoolean();
        if (hasIntVal || hasFractVal) {
            var isNegative = stream.readBoolean();
            var intVal = (hasIntVal) ? stream.readBits(14) + 1 : 0;
            var fractVal = (hasFractVal) ? stream.readBits(5) : 0;
            var value = intVal + fractVal * (1 / (1 << 5));
            return (isNegative) ? -value : value;
        }
        return 0;
    };
    SendPropParser.readBitCoordMP = function (propDefinition, stream, isIntegral, isLowPrecision) {
        var value = 0;
        var isNegative = false;
        var inBounds = stream.readBoolean();
        var hasIntVal = stream.readBoolean();
        if (isIntegral) {
            if (hasIntVal) {
                isNegative = stream.readBoolean();
                if (inBounds) {
                    value = stream.readBits(11) + 1;
                }
                else {
                    value = stream.readBits(14) + 1;
                    if (value < (1 << 11)) {
                        throw new Error("Something's fishy...");
                    }
                }
            }
        }
        else {
            isNegative = stream.readBoolean();
            if (hasIntVal) {
                if (inBounds) {
                    value = stream.readBits(11) + 1;
                }
                else {
                    value = stream.readBits(14) + 1;
                    if (value < (1 << 11)) {
                        // console.log(propDefinition, value);
                        // throw new Error("Something's fishy...");
                    }
                }
            }
            var fractalVal = stream.readBits(isLowPrecision ? 3 : 5);
            value += fractalVal * (1 / (1 << (isLowPrecision ? 3 : 5)));
        }
        if (isNegative) {
            value = -value;
        }
        return value;
    };
    return SendPropParser;
}());

function applyEntityUpdate(entity, sendTable, stream) {
    var index = -1;
    var allProps = sendTable.flattenedProps;
    while ((index = readFieldIndex(stream, index)) != -1) {
        if (index >= 4096 || index > allProps.length) {
            throw new Error('prop index out of bounds while applying update for ' + sendTable.name + ' got ' + index
                + ' property only has ' + allProps.length + ' properties');
        }
        var propDefinition = allProps[index];
        var existingProp = entity.getPropByDefinition(propDefinition);
        var prop = existingProp ? existingProp : new SendProp(propDefinition);
        prop.value = SendPropParser.decode(propDefinition, stream);
        if (!existingProp) {
            entity.props.push(prop);
        }
    }
    return entity;
}
var readFieldIndex = function (stream, lastIndex) {
    if (!stream.readBoolean()) {
        return -1;
    }
    var diff = readUBitVar(stream);
    return lastIndex + diff + 1;
};

var pvsMap = {
    0: PVS.PRESERVE,
    2: PVS.ENTER,
    1: PVS.LEAVE,
    3: PVS.LEAVE + PVS.DELETE
};
function readPVSType(stream) {
    var pvs = stream.readBits(2);
    // console.log(pvs);
    return pvsMap[pvs];
}
function readEnterPVS(stream, entityId, match) {
    // https://github.com/PazerOP/DemoLib/blob/5f9467650f942a4a70f9ec689eadcd3e0a051956/TF2Net/NetMessages/NetPacketEntitiesMessage.cs#L198
    var serverClass = match.serverClasses[stream.readBits(match.classBits)];
    var serial = stream.readBits(10); // unused serial number
    if (match.baseLineCache[serverClass.id]) {
        var result = match.baseLineCache[serverClass.id].clone();
        result.entityIndex = entityId;
        result.serialNumber = serial;
        return result;
    }
    else {
        var entity = new PacketEntity(serverClass, entityId, PVS.ENTER);
        var sendTable = match.getSendTable(serverClass.dataTable);
        if (!sendTable) {
            throw new Error('Unknown SendTable for serverclass');
        }
        var staticBaseLine = match.staticBaseLines[serverClass.id];
        if (staticBaseLine) {
            staticBaseLine.index = 0;
            applyEntityUpdate(entity, sendTable, staticBaseLine);
            match.baseLineCache[serverClass.id] = entity.clone();
            // if (staticBaseLine.bitsLeft > 7) {
            // console.log(staticBaseLine.length, staticBaseLine.index);
            // throw new Error('Unexpected data left at the end of staticBaseline, ' + staticBaseLine.bitsLeft + ' bits left');
            // }
        }
        entity.serialNumber = serial;
        return entity;
    }
}
function getPacketEntityForExisting(entityId, match, pvs) {
    if (!match.entityClasses[entityId]) {
        throw new Error("\"unknown entity " + entityId + " for " + PVS[pvs] + "(" + pvs + ")");
    }
    var serverClass = match.entityClasses[entityId];
    return new PacketEntity(serverClass, entityId, pvs);
}
function PacketEntities(stream, match) {
    // https://github.com/skadistats/smoke/blob/master/smoke/replay/handler/svc_packetentities.pyx
    // https://github.com/StatsHelix/demoinfo/blob/3d28ea917c3d44d987b98bb8f976f1a3fcc19821/DemoInfo/DP/Handler/PacketEntitesHandler.cs
    // https://github.com/StatsHelix/demoinfo/blob/3d28ea917c3d44d987b98bb8f976f1a3fcc19821/DemoInfo/DP/Entity.cs
    // https://github.com/PazerOP/DemoLib/blob/5f9467650f942a4a70f9ec689eadcd3e0a051956/TF2Net/NetMessages/NetPacketEntitiesMessage.cs
    var maxEntries = stream.readBits(11);
    var isDelta = !!stream.readBits(1);
    var delta = (isDelta) ? stream.readInt32() : 0;
    var baseLine = stream.readBits(1);
    var updatedEntries = stream.readBits(11);
    var length = stream.readBits(20);
    var updatedBaseLine = stream.readBoolean();
    var end = stream.index + length;
    var entityId = -1;
    var receivedEntities = [];
    for (var i = 0; i < updatedEntries; i++) {
        var diff = readUBitVar(stream);
        entityId += 1 + diff;
        var pvs = readPVSType(stream);
        if (pvs === PVS.ENTER) {
            var packetEntity = readEnterPVS(stream, entityId, match);
            applyEntityUpdate(packetEntity, match.getSendTable(packetEntity.serverClass.dataTable), stream);
            if (updatedBaseLine) {
                var newBaseLine = [];
                newBaseLine.concat(packetEntity.props);
                match.baseLineCache[packetEntity.serverClass.id] = packetEntity.clone();
            }
            packetEntity.inPVS = true;
            receivedEntities.push(packetEntity);
        }
        else if (pvs === PVS.PRESERVE) {
            var packetEntity = getPacketEntityForExisting(entityId, match, pvs);
            applyEntityUpdate(packetEntity, match.getSendTable(packetEntity.serverClass.dataTable), stream);
            receivedEntities.push(packetEntity);
        }
        else {
            if (match.entityClasses[entityId]) {
                var packetEntity = getPacketEntityForExisting(entityId, match, pvs);
                receivedEntities.push(packetEntity);
            }
        }
    }
    var removedEntityIds = [];
    if (isDelta) {
        while (stream.readBoolean()) {
            var entityId_1 = stream.readBits(11);
            removedEntityIds.push(entityId_1);
        }
    }
    stream.index = end;
    return {
        packetType: 'packetEntities',
        entities: receivedEntities,
        removedEntities: removedEntityIds,
        maxEntries: maxEntries,
        isDelta: isDelta,
        delta: delta,
        baseLine: baseLine,
        updatedEntries: updatedEntries,
        length: length,
        updatedBaseLine: updatedBaseLine
    };
}

function ParseSounds(stream) {
    var reliable = stream.readBoolean();
    var num = (reliable) ? 1 : stream.readUint8();
    var length = (reliable) ? stream.readUint8() : stream.readUint16();
    stream.index += length;
    return {
        packetType: 'parseSounds',
        reliable: reliable,
        num: num,
        length: length
    };
}

function SetConVar(stream) {
    var count = stream.readBits(8);
    var vars = {};
    for (var i = 0; i < count; i++) {
        vars[stream.readUTF8String()] = stream.readUTF8String();
    }
    return {
        packetType: 'setConVar',
        vars: vars
    };
}

function UpdateStringTable(stream, match) {
    var tableId = stream.readBits(5);
    var multipleChanged = stream.readBoolean();
    var changedEntries = (multipleChanged) ? stream.readBits(16) : 1;
    var bitCount = stream.readBits(20);
    var data = stream.readBitStream(bitCount);
    if (!match.stringTables[tableId]) {
        throw new Error('Table not found for update');
    }
    var table = match.stringTables[tableId];
    parseStringTable(data, table, changedEntries, match);
    return {
        packetType: 'stringTable',
        tables: [table]
    };
}

function SayText2(stream) {
    var client = stream.readBits(8);
    var raw = stream.readBits(8);
    var pos = stream.index;
    var from, text, kind, arg1, arg2;
    if (stream.readBits(8) === 1) {
        var first = stream.readBits(8);
        if (first === 7) {
            var color = stream.readUTF8String(6);
        }
        else {
            stream.index = pos + 8;
        }
        text = stream.readUTF8String();
        if (text.substr(0, 6) === '*DEAD*') {
            // grave talk is in the format '*DEAD* \u0003$from\u0001:    $text'
            var start = text.indexOf('\u0003');
            var end = text.indexOf('\u0001');
            from = text.substr(start + 1, end - start - 1);
            text = text.substr(end + 5);
            kind = 'TF_Chat_AllDead';
        }
    }
    else {
        stream.index = pos;
        kind = stream.readUTF8String();
        from = stream.readUTF8String();
        text = stream.readUTF8String();
        stream.readASCIIString();
        stream.readASCIIString();
    }
    // cleanup color codes
    text = text.replace(/\u0001/g, '');
    text = text.replace(/\u0003/g, '');
    while ((pos = text.indexOf('\u0007')) !== -1) {
        text = text.slice(0, pos) + text.slice(pos + 7);
    }
    return {
        packetType: 'sayText2',
        client: client,
        raw: raw,
        kind: kind,
        from: from,
        text: text
    };
}

var UserMessageType;
(function (UserMessageType) {
    UserMessageType[UserMessageType["Geiger"] = 0] = "Geiger";
    UserMessageType[UserMessageType["Train"] = 1] = "Train";
    UserMessageType[UserMessageType["HudText"] = 2] = "HudText";
    UserMessageType[UserMessageType["SayText"] = 3] = "SayText";
    UserMessageType[UserMessageType["SayText2"] = 4] = "SayText2";
    UserMessageType[UserMessageType["TextMsg"] = 5] = "TextMsg";
    UserMessageType[UserMessageType["ResetHUD"] = 6] = "ResetHUD";
    UserMessageType[UserMessageType["GameTitle"] = 7] = "GameTitle";
    UserMessageType[UserMessageType["ItemPickup"] = 8] = "ItemPickup";
    UserMessageType[UserMessageType["ShowMenu"] = 9] = "ShowMenu";
    UserMessageType[UserMessageType["Shake"] = 10] = "Shake";
    UserMessageType[UserMessageType["Fade"] = 11] = "Fade";
    UserMessageType[UserMessageType["VGUIMenu"] = 12] = "VGUIMenu";
    UserMessageType[UserMessageType["Rumble"] = 13] = "Rumble";
    UserMessageType[UserMessageType["CloseCaption"] = 14] = "CloseCaption";
    UserMessageType[UserMessageType["SendAudio"] = 15] = "SendAudio";
    UserMessageType[UserMessageType["VoiceMask"] = 16] = "VoiceMask";
    UserMessageType[UserMessageType["RequestState"] = 17] = "RequestState";
    UserMessageType[UserMessageType["Damage"] = 18] = "Damage";
    UserMessageType[UserMessageType["HintText"] = 19] = "HintText";
    UserMessageType[UserMessageType["KeyHintText"] = 20] = "KeyHintText";
    UserMessageType[UserMessageType["HudMsg"] = 21] = "HudMsg";
    UserMessageType[UserMessageType["AmmoDenied"] = 22] = "AmmoDenied";
    UserMessageType[UserMessageType["AchievementEvent"] = 23] = "AchievementEvent";
    UserMessageType[UserMessageType["UpdateRadar"] = 24] = "UpdateRadar";
    UserMessageType[UserMessageType["VoiceSubtitle"] = 25] = "VoiceSubtitle";
    UserMessageType[UserMessageType["HudNotify"] = 26] = "HudNotify";
    UserMessageType[UserMessageType["HudNotifyCustom"] = 27] = "HudNotifyCustom";
    UserMessageType[UserMessageType["PlayerStatsUpdate"] = 28] = "PlayerStatsUpdate";
    UserMessageType[UserMessageType["PlayerIgnited"] = 29] = "PlayerIgnited";
    UserMessageType[UserMessageType["PlayerIgnitedInv"] = 30] = "PlayerIgnitedInv";
    UserMessageType[UserMessageType["HudArenaNotify"] = 31] = "HudArenaNotify";
    UserMessageType[UserMessageType["UpdateAchievement"] = 32] = "UpdateAchievement";
    UserMessageType[UserMessageType["TrainingMsg"] = 33] = "TrainingMsg";
    UserMessageType[UserMessageType["TrainingObjective"] = 34] = "TrainingObjective";
    UserMessageType[UserMessageType["DamageDodged"] = 35] = "DamageDodged";
    UserMessageType[UserMessageType["PlayerJarated"] = 36] = "PlayerJarated";
    UserMessageType[UserMessageType["PlayerExtinguished"] = 37] = "PlayerExtinguished";
    UserMessageType[UserMessageType["PlayerJaratedFade"] = 38] = "PlayerJaratedFade";
    UserMessageType[UserMessageType["PlayerShieldBlocked"] = 39] = "PlayerShieldBlocked";
    UserMessageType[UserMessageType["BreakModel"] = 40] = "BreakModel";
    UserMessageType[UserMessageType["CheapBreakModel"] = 41] = "CheapBreakModel";
    UserMessageType[UserMessageType["BreakModel_Pumpkin"] = 42] = "BreakModel_Pumpkin";
    UserMessageType[UserMessageType["BreakModelRocketDud"] = 43] = "BreakModelRocketDud";
    UserMessageType[UserMessageType["CallVoteFailed"] = 44] = "CallVoteFailed";
    UserMessageType[UserMessageType["VoteStart"] = 45] = "VoteStart";
    UserMessageType[UserMessageType["VotePass"] = 46] = "VotePass";
    UserMessageType[UserMessageType["VoteFailed"] = 47] = "VoteFailed";
    UserMessageType[UserMessageType["VoteSetup"] = 48] = "VoteSetup";
    UserMessageType[UserMessageType["PlayerBonusPoints"] = 49] = "PlayerBonusPoints";
    UserMessageType[UserMessageType["SpawnFlyingBird"] = 50] = "SpawnFlyingBird";
    UserMessageType[UserMessageType["PlayerGodRayEffect"] = 51] = "PlayerGodRayEffect";
    UserMessageType[UserMessageType["SPHapWeapEvent"] = 52] = "SPHapWeapEvent";
    UserMessageType[UserMessageType["HapDmg"] = 53] = "HapDmg";
    UserMessageType[UserMessageType["HapPunch"] = 54] = "HapPunch";
    UserMessageType[UserMessageType["HapSetDrag"] = 55] = "HapSetDrag";
    UserMessageType[UserMessageType["HapSet"] = 56] = "HapSet";
    UserMessageType[UserMessageType["HapMeleeContact"] = 57] = "HapMeleeContact";
})(UserMessageType || (UserMessageType = {}));
var userMessageParsers = {
    4: SayText2,
    5: make('textMsg', 'destType{8}text{s}')
};
function UserMessage(stream) {
    var type = stream.readBits(8);
    var length = stream.readBits(11);
    var pos = stream.index;
    var result;
    if (userMessageParsers[type]) {
        result = userMessageParsers[type](stream);
    }
    else {
        result = {
            packetType: 'unknownUserMessage',
            type: type
        };
    }
    stream.index = pos + length;
    return result;
}

function TempEntities(stream, match) {
    var entityCount = stream.readBits(8);
    var length = readVarInt$1(stream);
    var end = stream.index + length;
    var entity = null;
    var entities = [];
    for (var i = 0; i < entityCount; i++) {
        var delay = (stream.readBoolean()) ? stream.readUint8() / 100 : 0; //unused it seems
        if (stream.readBoolean()) {
            var classId = stream.readBits(match.classBits);
            var serverClass = match.serverClasses[classId - 1];
            // no clue why the -1 but it works
            // maybe because world (id=0) can never be temp
            // but it's not like the -1 saves any space
            var sendTable = match.getSendTable(serverClass.dataTable);
            entity = new PacketEntity(serverClass, 0, PVS.ENTER);
            applyEntityUpdate(entity, sendTable, stream);
            entities.push(entity);
        }
        else {
            if (entity) {
                applyEntityUpdate(entity, match.getSendTable(entity.serverClass.dataTable), stream);
            }
            else {
                throw new Error("no entity set to update");
            }
        }
    }
    if (end - stream.index > 8) {
        throw new Error("unexpected content after TempEntities");
    }
    stream.index = end;
    return {
        packetType: 'tempEntities',
        entities: entities
    };
}
function readVarInt$1(stream) {
    var result = 0;
    for (var run_1 = 0; run_1 < 35; run_1 += 7) {
        var byte = stream.readUint8();
        result |= ((byte & 0x7F) << run_1);
        if ((byte >> 7) == 0) {
            return result;
        }
    }
    return result;
}

function VoiceInit(stream) {
    var codec = stream.readASCIIString();
    var quality = stream.readUint8();
    // no clue, from 2017-2-14 update
    var extraData = (codec === 'vaudio_celt' && quality === 255) ? stream.readUint16() : 0;
    return {
        packetType: 'voiceInit',
        codec: codec,
        quality: quality,
        extraData: extraData
    };
}

function VoiceData(stream) {
    // 'client{8}proximity{8}length{16}_{$length}'
    var client = stream.readUint8();
    var proximity = stream.readUint8();
    var length = stream.readUint16();
    var data = stream.readBitStream(length);
    return {
        packetType: 'voiceData',
        client: client,
        proximity: proximity,
        length: length,
        data: data
    };
}

function Menu(stream) {
    //'type{16}length{16}_{$length}_{$length}_{$length}_{$length}_{$length}_{$length}_{$length}'
    var type = stream.readUint16();
    var length = stream.readUint16();
    var data = stream.readBitStream(length * 8); //length is in bytes
    return {
        packetType: 'menu',
        type: type,
        length: length,
        data: data
    };
}

function CmdKeyValues(stream) {
    //'length{32}data{$length}'
    var length = stream.readUint32();
    var data = stream.readBitStream(length);
    return {
        packetType: 'cmdKeyValues',
        length: length,
        data: data
    };
}

var __extends$1 = (undefined && undefined.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
// https://code.google.com/p/coldemoplayer/source/browse/branches/2.0/compLexity+Demo+Player/CDP.Source/Messages/?r=219
// https://github.com/TimePath/hl2-toolkit/tree/master/src/main/java/com/timepath/hl2/io/demo
// https://github.com/stgn/netdecode/blob/master/Packet.cs
// https://github.com/LestaD/SourceEngine2007/blob/master/src_main/common/netmessages.cpp
var Packet = (function (_super) {
    __extends$1(Packet, _super);
    function Packet() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    Packet.prototype.parse = function () {
        var packets = [];
        var lastPacketType = 0;
        while (this.bitsLeft > 6) {
            var type = this.stream.readBits(6);
            if (type !== 0) {
                if (Packet.parsers[type]) {
                    var packet = Packet.parsers[type].call(this, this.stream, this.match);
                    packets.push(packet);
                }
                else {
                    throw new Error('Unknown packet type ' + type + " just parsed a " + PacketType[lastPacketType]);
                }
                lastPacketType = type;
            }
        }
        return packets;
    };
    Object.defineProperty(Packet.prototype, "bitsLeft", {
        get: function () {
            return (this.length * 8) - this.stream.index;
        },
        enumerable: true,
        configurable: true
    });
    return Packet;
}(Parser$1));
Packet.parsers = {
    2: make('file', 'transferId{32}fileName{s}requested{b}'),
    3: make('netTick', 'tick{32}frameTime{16}stdDev{16}'),
    4: make('stringCmd', 'command{s}'),
    5: SetConVar,
    6: make('sigOnState', 'state{8}count{32}'),
    7: make('print', 'value{s}'),
    8: make('serverInfo', 'version{16}serverCount{32}stv{b}dedicated{b}maxCrc{32}maxClasses{16}' +
        'mapHash{128}playerCount{8}maxPlayerCount{8}intervalPerTick{f32}platform{s1}' +
        'game{s}map{s}skybox{s}serverName{s}replay{b}'),
    10: ClassInfo,
    11: make('setPause', 'paused{b}'),
    12: CreateStringTable,
    13: UpdateStringTable,
    14: VoiceInit,
    15: VoiceData,
    17: ParseSounds,
    18: make('setView', 'index{11}'),
    19: make('fixAngle', 'relative{b}x{16}y{16}z{16}'),
    21: BSPDecal,
    23: UserMessage,
    24: EntityMessage,
    25: GameEvent,
    26: PacketEntities,
    27: TempEntities,
    28: make('preFetch', 'index{14}'),
    29: Menu,
    30: GameEventList,
    31: make('getCvarValue', 'cookie{32}value{s}'),
    32: CmdKeyValues
};
var PacketType;
(function (PacketType) {
    PacketType[PacketType["file"] = 2] = "file";
    PacketType[PacketType["netTick"] = 3] = "netTick";
    PacketType[PacketType["stringCmd"] = 4] = "stringCmd";
    PacketType[PacketType["setConVar"] = 5] = "setConVar";
    PacketType[PacketType["sigOnState"] = 6] = "sigOnState";
    PacketType[PacketType["print"] = 7] = "print";
    PacketType[PacketType["serverInfo"] = 8] = "serverInfo";
    PacketType[PacketType["classInfo"] = 10] = "classInfo";
    PacketType[PacketType["setPause"] = 11] = "setPause";
    PacketType[PacketType["createStringTable"] = 12] = "createStringTable";
    PacketType[PacketType["updateStringTable"] = 13] = "updateStringTable";
    PacketType[PacketType["voiceInit"] = 14] = "voiceInit";
    PacketType[PacketType["voiceData"] = 15] = "voiceData";
    PacketType[PacketType["parseSounds"] = 17] = "parseSounds";
    PacketType[PacketType["setView"] = 18] = "setView";
    PacketType[PacketType["fixAngle"] = 19] = "fixAngle";
    PacketType[PacketType["bspDecal"] = 21] = "bspDecal";
    PacketType[PacketType["userMessage"] = 23] = "userMessage";
    PacketType[PacketType["entityMessage"] = 24] = "entityMessage";
    PacketType[PacketType["gameEvent"] = 25] = "gameEvent";
    PacketType[PacketType["packetEntities"] = 26] = "packetEntities";
    PacketType[PacketType["tempEntities"] = 27] = "tempEntities";
    PacketType[PacketType["preFetch"] = 28] = "preFetch";
    PacketType[PacketType["menu"] = 29] = "menu";
    PacketType[PacketType["gameEventList"] = 30] = "gameEventList";
    PacketType[PacketType["getCvarValue"] = 30] = "getCvarValue";
    PacketType[PacketType["cmdKeyValues"] = 32] = "cmdKeyValues";
})(PacketType || (PacketType = {}));

var __extends$2 = (undefined && undefined.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var ConsoleCmd = (function (_super) {
    __extends$2(ConsoleCmd, _super);
    function ConsoleCmd() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    ConsoleCmd.prototype.parse = function () {
        return [{
                packetType: 'consoleCmd',
                command: this.stream.readUTF8String()
            }];
    };
    return ConsoleCmd;
}(Parser$1));

var __extends$3 = (undefined && undefined.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var StringTable = (function (_super) {
    __extends$3(StringTable, _super);
    function StringTable() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    StringTable.prototype.parse = function () {
        // we get the tables from the packets
        return [{
                packetType: 'stringTable',
                tables: []
            }];
        // https://github.com/StatsHelix/demoinfo/blob/3d28ea917c3d44d987b98bb8f976f1a3fcc19821/DemoInfo/ST/StringTableParser.cs
        // const tableCount = this.stream.readUint8();
        // let tables       = {};
        // let extraDataLength;
        // for (let i = 0; i < tableCount; i++) {
        // 	let entries: StringTableEntry[] = [];
        // 	const tableName                 = this.stream.readASCIIString();
        // 	const entryCount                = this.stream.readUint16();
        // 	for (let j = 0; j < entryCount; j++) {
        // 		let entry;
        // 		try {
        // 			entry = {
        // 				text: this.stream.readUTF8String()
        // 			};
        // 		} catch (e) {
        // 			return [{
        // 				packetType: 'stringTable',
        // 				tables:     tables
        // 			}];
        // 		}
        // 		if (this.stream.readBoolean()) {
        // 			extraDataLength = this.stream.readUint16();
        // 			if ((extraDataLength * 8) > this.stream.bitsLeft) {
        // 				// extradata to long, can't continue parsing the tables
        // 				// seems to happen in POV demos after the MyM update
        // 				return [{
        // 					packetType: 'stringTable',
        // 					tables:     tables
        // 				}];
        // 			}
        // 			if (tableName === 'instancebaseline') {
        // 				this.match.staticBaseLines[parseInt(entry.text, 10)] = this.stream.readBitStream(8 * extraDataLength);
        // 			} else {
        // 				entry.extraData = this.readExtraData(extraDataLength);
        // 			}
        // 		}
        // 		entries.push(entry);
        // 	}
        // 	tables[tableName] = entries;
        // 	this.match.stringTables.push({
        // 		name:       tableName,
        // 		entries:    entries,
        // 		maxEntries: 0
        // 	});
        // 	if (this.stream.readBits(1)) {
        // 		this.stream.readASCIIString();
        // 		if (this.stream.readBits(1)) {
        // 			//throw 'more extra data not implemented';
        // 			extraDataLength = this.stream.readBits(16);
        // 			this.stream.readBits(extraDataLength);
        // 		}
        // 	}
        // }
        // return [{
        // 	packetType: 'stringTable',
        // 	tables:     tables
        // }];
    };
    StringTable.prototype.readExtraData = function (length) {
        var end = this.stream.index + (length * 8);
        var data = [];
        //console.log(this.stream.readUTF8String());
        data.push(this.stream.readUTF8String());
        while (this.stream.index < end && this.stream.index < (this.stream.length - 7)) {
            try {
                var string = this.stream.readUTF8String();
                if (string) {
                    data.push(string);
                }
            }
            catch (e) {
                return data;
            }
        }
        this.stream.index = end;
        return data;
    };
    return StringTable;
}(Parser$1));

var SendTable = (function () {
    function SendTable(name) {
        this.name = name;
        this.props = [];
        this._flattenedProps = [];
    }
    SendTable.prototype.addProp = function (prop) {
        this.props.push(prop);
    };
    SendTable.prototype.flatten = function () {
        var excludes = this.excludes;
        var props = [];
        this.getAllProps(excludes, props);
        // sort often changed props before the others
        var start = 0;
        for (var i = 0; i < props.length; i++) {
            if (props[i].hasFlag(SendPropFlag.SPROP_CHANGES_OFTEN)) {
                if (i != start) {
                    var temp = props[i];
                    props[i] = props[start];
                    props[start] = temp;
                }
                start++;
            }
        }
        this._flattenedProps = props;
    };
    SendTable.prototype.getAllProps = function (excludes, props) {
        var localProps = [];
        this.getAllPropsIteratorProps(excludes, localProps, props);
        for (var _i = 0, localProps_1 = localProps; _i < localProps_1.length; _i++) {
            var localProp = localProps_1[_i];
            props.push(localProp);
        }
    };
    SendTable.prototype.getAllPropsIteratorProps = function (excludes, props, childProps) {
        var _loop_1 = function (prop) {
            if (prop.hasFlag(SendPropFlag.SPROP_EXCLUDE) || excludes.indexOf(prop) !== -1) {
                return "continue";
            }
            if (excludes.filter(function (exclude) {
                return exclude.name == prop.name && exclude.excludeDTName == prop.ownerTableName;
            }).length > 0) {
                return "continue";
            }
            if (prop.type === SendPropType.DPT_DataTable && prop.table) {
                if (prop.hasFlag(SendPropFlag.SPROP_COLLAPSIBLE)) {
                    prop.table.getAllPropsIteratorProps(excludes, props, childProps);
                }
                else {
                    prop.table.getAllProps(excludes, childProps);
                }
            }
            else {
                props.push(prop);
            }
        };
        for (var _i = 0, _a = this.props; _i < _a.length; _i++) {
            var prop = _a[_i];
            _loop_1(prop);
        }
    };
    Object.defineProperty(SendTable.prototype, "flattenedProps", {
        get: function () {
            if (this._flattenedProps.length === 0) {
                this.flatten();
            }
            return this._flattenedProps;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SendTable.prototype, "excludes", {
        get: function () {
            var result = [];
            for (var _i = 0, _a = this.props; _i < _a.length; _i++) {
                var prop = _a[_i];
                if (prop.hasFlag(SendPropFlag.SPROP_EXCLUDE)) {
                    result.push(prop);
                }
                else if (prop.type === SendPropType.DPT_DataTable && prop.table) {
                    result = result.concat(prop.table.excludes);
                }
            }
            return result;
        },
        enumerable: true,
        configurable: true
    });
    return SendTable;
}());

var ServerClass = (function () {
    function ServerClass(id, name, dataTable) {
        this.id = id;
        this.name = name;
        this.dataTable = dataTable;
    }
    return ServerClass;
}());

var __extends$4 = (undefined && undefined.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var DataTable = (function (_super) {
    __extends$4(DataTable, _super);
    function DataTable() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    DataTable.prototype.parse = function () {
        // https://github.com/LestaD/SourceEngine2007/blob/43a5c90a5ada1e69ca044595383be67f40b33c61/src_main/engine/dt_common_eng.cpp#L356
        // https://github.com/LestaD/SourceEngine2007/blob/43a5c90a5ada1e69ca044595383be67f40b33c61/src_main/engine/dt_recv_eng.cpp#L310
        // https://github.com/PazerOP/DemoLib/blob/master/DemoLib/Commands/DemoDataTablesCommand.cs
        var tables = [];
        var i, j;
        var tableMap = {};
        while (this.stream.readBoolean()) {
            var needsDecoder = this.stream.readBoolean();
            var tableName = this.stream.readASCIIString();
            var numProps = this.stream.readBits(10);
            var table = new SendTable(tableName);
            // get props metadata
            var arrayElementProp = void 0;
            for (i = 0; i < numProps; i++) {
                var propType = this.stream.readBits(5);
                var propName = this.stream.readASCIIString();
                var nFlagsBits = 16; // might be 11 (old?), 13 (new?), 16(networked) or 17(??)
                var flags = this.stream.readBits(nFlagsBits);
                var prop = new SendPropDefinition(propType, propName, flags, tableName);
                if (propType === SendPropType.DPT_DataTable) {
                    prop.excludeDTName = this.stream.readASCIIString();
                }
                else {
                    if (prop.isExcludeProp()) {
                        prop.excludeDTName = this.stream.readASCIIString();
                    }
                    else if (prop.type === SendPropType.DPT_Array) {
                        prop.numElements = this.stream.readBits(10);
                    }
                    else {
                        prop.lowValue = this.stream.readFloat32();
                        prop.highValue = this.stream.readFloat32();
                        prop.bitCount = this.stream.readBits(7);
                    }
                }
                if (prop.hasFlag(SendPropFlag.SPROP_NOSCALE)) {
                    if (prop.type === SendPropType.DPT_Float) {
                        prop.bitCount = 32;
                    }
                    else if (prop.type === SendPropType.DPT_Vector) {
                        if (!prop.hasFlag(SendPropFlag.SPROP_NORMAL)) {
                            prop.bitCount = 32 * 3;
                        }
                    }
                }
                if (arrayElementProp) {
                    if (prop.type !== SendPropType.DPT_Array) {
                        throw "expected prop of type array";
                    }
                    prop.arrayProperty = arrayElementProp;
                    arrayElementProp = null;
                }
                if (prop.hasFlag(SendPropFlag.SPROP_INSIDEARRAY)) {
                    if (arrayElementProp) {
                        throw new Error("array element already set");
                    }
                    if (prop.hasFlag(SendPropFlag.SPROP_CHANGES_OFTEN)) {
                        throw new Error("unexpected CHANGES_OFTEN prop in array");
                    }
                    arrayElementProp = prop;
                }
                else {
                    table.addProp(prop);
                }
            }
            tables.push(table);
            tableMap[table.name] = table;
        }
        // link referenced tables
        for (var _i = 0, tables_1 = tables; _i < tables_1.length; _i++) {
            var table = tables_1[_i];
            for (var _a = 0, _b = table.props; _a < _b.length; _a++) {
                var prop = _b[_a];
                if (prop.type === SendPropType.DPT_DataTable) {
                    if (prop.excludeDTName) {
                        prop.table = tableMap[prop.excludeDTName];
                        prop.excludeDTName = null;
                    }
                }
            }
        }
        var numServerClasses = this.stream.readUint16(); // short
        var serverClasses = [];
        if (numServerClasses <= 0) {
            throw "expected one or more serverclasses";
        }
        for (i = 0; i < numServerClasses; i++) {
            var classId = this.stream.readUint16();
            if (classId > numServerClasses) {
                throw "invalid class id";
            }
            var className = this.stream.readASCIIString();
            var dataTable = this.stream.readASCIIString();
            serverClasses.push(new ServerClass(classId, className, dataTable));
        }
        var bitsLeft = (this.length * 8) - this.stream.index;
        if (bitsLeft > 7 || bitsLeft < 0) {
            throw "unexpected remaining data in datatable (" + bitsLeft + " bits)";
        }
        return [{
                packetType: 'dataTable',
                tables: tables,
                serverClasses: serverClasses
            }];
    };
    return DataTable;
}(Parser$1));

var __extends$5 = (undefined && undefined.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var UserCmd = (function (_super) {
    __extends$5(UserCmd, _super);
    function UserCmd() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    UserCmd.prototype.parse = function () {
        return [];
    };
    return UserCmd;
}(Parser$1));

var domain;

// This constructor is used to store event handlers. Instantiating this is
// faster than explicitly calling `Object.create(null)` to get a "clean" empty
// object (tested with v8 v4.9).
function EventHandlers() {}
EventHandlers.prototype = Object.create(null);

function EventEmitter() {
  EventEmitter.init.call(this);
}
EventEmitter.usingDomains = false;

EventEmitter.prototype.domain = undefined;
EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

EventEmitter.init = function() {
  this.domain = null;
  if (EventEmitter.usingDomains) {
    // if there is an active domain, then attach to it.
    if (domain.active && !(this instanceof domain.Domain)) {
      this.domain = domain.active;
    }
  }

  if (!this._events || this._events === Object.getPrototypeOf(this)._events) {
    this._events = new EventHandlers();
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
};

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n))
    throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn)
    handler.call(self);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self);
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn)
    handler.call(self, arg1);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1);
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn)
    handler.call(self, arg1, arg2);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2);
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn)
    handler.call(self, arg1, arg2, arg3);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2, arg3);
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn)
    handler.apply(self, args);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].apply(self, args);
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events, domain;
  var needDomainExit = false;
  var doError = (type === 'error');

  events = this._events;
  if (events)
    doError = (doError && events.error == null);
  else if (!doError)
    return false;

  domain = this.domain;

  // If there is no 'error' event listener then throw.
  if (doError) {
    er = arguments[1];
    if (domain) {
      if (!er)
        er = new Error('Uncaught, unspecified "error" event');
      er.domainEmitter = this;
      er.domain = domain;
      er.domainThrown = false;
      domain.emit('error', er);
    } else if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
    return false;
  }

  handler = events[type];

  if (!handler)
    return false;

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
    // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
    // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++)
        args[i - 1] = arguments[i];
      emitMany(handler, isFn, this, args);
  }

  if (needDomainExit)
    domain.exit();

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');

  events = target._events;
  if (!events) {
    events = target._events = new EventHandlers();
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      target.emit('newListener', type,
                  listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] = prepend ? [listener, existing] :
                                          [existing, listener];
    } else {
      // If we've already got an array, just append.
      if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(target);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        var w = new Error('Possible EventEmitter memory leak detected. ' +
                            existing.length + ' ' + type + ' listeners added. ' +
                            'Use emitter.setMaxListeners() to increase limit');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        emitWarning(w);
      }
    }
  }

  return target;
}
function emitWarning(e) {
  typeof console.warn === 'function' ? console.warn(e) : console.log(e);
}
EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function _onceWrap(target, type, listener) {
  var fired = false;
  function g() {
    target.removeListener(type, g);
    if (!fired) {
      fired = true;
      listener.apply(target, arguments);
    }
  }
  g.listener = listener;
  return g;
}

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');

      events = this._events;
      if (!events)
        return this;

      list = events[type];
      if (!list)
        return this;

      if (list === listener || (list.listener && list.listener === listener)) {
        if (--this._eventsCount === 0)
          this._events = new EventHandlers();
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length; i-- > 0;) {
          if (list[i] === listener ||
              (list[i].listener && list[i].listener === listener)) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (list.length === 1) {
          list[0] = undefined;
          if (--this._eventsCount === 0) {
            this._events = new EventHandlers();
            return this;
          } else {
            delete events[type];
          }
        } else {
          spliceOne(list, position);
        }

        if (events.removeListener)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events;

      events = this._events;
      if (!events)
        return this;

      // not listening for removeListener, no need to emit
      if (!events.removeListener) {
        if (arguments.length === 0) {
          this._events = new EventHandlers();
          this._eventsCount = 0;
        } else if (events[type]) {
          if (--this._eventsCount === 0)
            this._events = new EventHandlers();
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = Object.keys(events);
        for (var i = 0, key; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = new EventHandlers();
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners) {
        // LIFO order
        do {
          this.removeListener(type, listeners[listeners.length - 1]);
        } while (listeners[0]);
      }

      return this;
    };

EventEmitter.prototype.listeners = function listeners(type) {
  var evlistener;
  var ret;
  var events = this._events;

  if (!events)
    ret = [];
  else {
    evlistener = events[type];
    if (!evlistener)
      ret = [];
    else if (typeof evlistener === 'function')
      ret = [evlistener.listener || evlistener];
    else
      ret = unwrapListeners(evlistener);
  }

  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
    list[i] = list[k];
  list.pop();
}

function arrayClone(arr, i) {
  var copy = new Array(i);
  while (i--)
    copy[i] = arr[i];
  return copy;
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function handleStringTable(packet, match) {
    for (var _i = 0, _a = packet.tables; _i < _a.length; _i++) {
        var table = _a[_i];
        if (table.name === 'userinfo') {
            //          console.log(table); //require('util').inspect(table, {depth: null}));
            for (var _b = 0, _c = table.entries; _b < _c.length; _b++) {
                var userData = _c[_b];
                if (userData.extraData) {
                    if (userData.extraData.bitsLeft > (32 * 8)) {
                        var name_1 = userData.extraData.readUTF8String(32);
                        var userId = userData.extraData.readUint32();
                        var steamId = userData.extraData.readUTF8String();
                        if (steamId) {
                            var userState = match.getUserInfo(userId);
                            userState.name = name_1;
                            userState.steamId = steamId;
                            userState.entityId = parseInt(userData.text, 10) + 1;
                        }
                    }
                }
            }
        }
        if (table.name === 'instancebaseline') {
            for (var _d = 0, _e = table.entries; _d < _e.length; _d++) {
                var instanceBaseLine = _e[_d];
                if (instanceBaseLine) {
                    saveInstanceBaseLine(instanceBaseLine, match);
                }
            }
        }
    }
}
function saveInstanceBaseLine(entry, match) {
    if (entry.extraData) {
        match.staticBaseLines[parseInt(entry.text, 10)] = entry.extraData;
    }
    else {
        throw new Error('Missing baseline');
    }
}

function handleSayText2(packet, match) {
    match.chat.push({
        kind: packet.kind,
        from: packet.from,
        text: packet.text,
        tick: match.tick
    });
}

function handleGameEvent(packet, match) {
    switch (packet.event.name) {
        case 'player_death':
            {
                var values = packet.event.values;
                while (values.assister > 256 && values.assister < (1024 * 16)) {
                    values.assister -= 256;
                }
                var assister = values.assister < 256 ? values.assister : null;
                // todo get player names, not same id as the name string table (entity id?)
                while (values.attacker > 256) {
                    values.attacker -= 256;
                }
                while (values.userid > 256) {
                    values.userid -= 256;
                }
                match.deaths.push({
                    killer: values.attacker,
                    assister: assister,
                    victim: values.userid,
                    weapon: values.weapon,
                    tick: match.tick
                });
            }
            break;
        case 'teamplay_round_win':
            {
                var values = packet.event.values;
                if (values.winreason !== 6) {
                    match.rounds.push({
                        winner: values.team === 2 ? 'red' : 'blue',
                        length: values.round_time,
                        end_tick: match.tick
                    });
                }
            }
            break;
        case 'player_spawn':
            {
                var values = packet.event.values;
                var userId = values.userid;
                var userState = match.getUserInfo(userId);
                var player = match.playerMap[userState.entityId];
                userState.team = values.team === 2 ? 'red' : 'blue';
                var classId = values.class;
                if (player) {
                    player.classId = classId;
                    player.team = values.team;
                }
                if (!userState.classes[classId]) {
                    userState.classes[classId] = 0;
                }
                userState.classes[classId]++;
            }
            break;
        case 'object_destroyed':
            {
                var values = packet.event.values;
                delete match.buildings[values.index];
            }
            break;
        case 'teamplay_round_start':
            match.buildings = {};
            break;
    }
}

var LifeState;
(function (LifeState) {
    LifeState[LifeState["ALIVE"] = 0] = "ALIVE";
    LifeState[LifeState["DYING"] = 1] = "DYING";
    LifeState[LifeState["DEATH"] = 2] = "DEATH";
    LifeState[LifeState["RESPAWNABLE"] = 3] = "RESPAWNABLE";
})(LifeState || (LifeState = {}));
var Player = (function () {
    function Player(match, userInfo) {
        this.position = new Vector(0, 0, 0);
        this.health = 0;
        this.maxHealth = 0;
        this.classId = 0;
        this.team = 0;
        this.viewAngle = 0;
        this.weaponIds = [];
        this.ammo = [];
        this.lifeState = LifeState.DEATH;
        this.activeWeapon = 0;
        this.match = match;
        this.user = userInfo;
    }
    Object.defineProperty(Player.prototype, "weapons", {
        get: function () {
            var _this = this;
            return this.weaponIds.map(function (id) { return _this.match.weaponMap[_this.match.outerMap[id]]; });
        },
        enumerable: true,
        configurable: true
    });
    return Player;
}());

function handlePacketEntities(packet, match) {
    for (var _i = 0, _a = packet.removedEntities; _i < _a.length; _i++) {
        var removedEntityId = _a[_i];
        delete match.entityClasses[removedEntityId];
    }
    for (var _b = 0, _c = packet.entities; _b < _c.length; _b++) {
        var entity = _c[_b];
        saveEntity(entity, match);
        handleEntity(entity, match);
    }
}
function saveEntity(packetEntity, match) {
    if (packetEntity.pvs === PVS.DELETE) {
        delete match.entityClasses[packetEntity.entityIndex];
    }
    match.entityClasses[packetEntity.entityIndex] = packetEntity.serverClass;
}
function handleEntity(entity, match) {
    for (var _i = 0, _a = entity.props; _i < _a.length; _i++) {
        var prop = _a[_i];
        if (prop.definition.ownerTableName === 'DT_AttributeContainer' && prop.definition.name === 'm_hOuter') {
            if (!match.outerMap[prop.value]) {
                match.outerMap[prop.value] = entity.entityIndex;
            }
        }
    }
    for (var _b = 0, _c = entity.props; _b < _c.length; _b++) {
        var prop = _c[_b];
        if (prop.definition.ownerTableName === 'DT_BaseCombatWeapon' && prop.definition.name === 'm_hOwner') {
            if (!match.weaponMap[entity.entityIndex]) {
                match.weaponMap[entity.entityIndex] = {
                    className: entity.serverClass.name,
                    owner: prop.value
                };
            }
        }
    }
    switch (entity.serverClass.name) {
        case 'CWorld':
            match.world.boundaryMin = entity.getProperty('DT_WORLD', 'm_WorldMins').value;
            match.world.boundaryMax = entity.getProperty('DT_WORLD', 'm_WorldMaxs').value;
            break;
        case 'CTFPlayer':
            /**
             "DT_TFPlayerScoringDataExclusive.m_iCaptures": 0,
             "DT_TFPlayerScoringDataExclusive.m_iDefenses": 0,
             "DT_TFPlayerScoringDataExclusive.m_iKills": 5,
             "DT_TFPlayerScoringDataExclusive.m_iDeaths": 17,
             "DT_TFPlayerScoringDataExclusive.m_iSuicides": 7,
             "DT_TFPlayerScoringDataExclusive.m_iDominations": 0,
             "DT_TFPlayerScoringDataExclusive.m_iRevenge": 0,
             "DT_TFPlayerScoringDataExclusive.m_iBuildingsBuilt": 0,
             "DT_TFPlayerScoringDataExclusive.m_iBuildingsDestroyed": 0,
             "DT_TFPlayerScoringDataExclusive.m_iHeadshots": 0,
             "DT_TFPlayerScoringDataExclusive.m_iBackstabs": 0,
             "DT_TFPlayerScoringDataExclusive.m_iHealPoints": 0,
             "DT_TFPlayerScoringDataExclusive.m_iInvulns": 0,
             "DT_TFPlayerScoringDataExclusive.m_iTeleports": 0,
             "DT_TFPlayerScoringDataExclusive.m_iDamageDone": 847,
             "DT_TFPlayerScoringDataExclusive.m_iCrits": 0,
             "DT_TFPlayerScoringDataExclusive.m_iResupplyPoints": 0,
             "DT_TFPlayerScoringDataExclusive.m_iKillAssists": 0,
             "DT_TFPlayerScoringDataExclusive.m_iBonusPoints": 0,
             "DT_TFPlayerScoringDataExclusive.m_iPoints": 6,
             "DT_TFPlayerSharedLocal.m_nDesiredDisguiseTeam": 0,
             "DT_TFPlayerSharedLocal.m_nDesiredDisguiseClass": 0,
             "DT_TFPlayerShared.m_iKillStreak": 0,
             "DT_TFPlayerShared.m_flCloakMeter": 100,
             */
            var player = void 0;
            if (match.playerMap[entity.entityIndex]) {
                player = match.playerMap[entity.entityIndex];
            }
            else {
                var maybeP = match.getUserInfoForEntity(entity);
                if (maybeP) {
                    player = new Player(match, maybeP);
                    match.playerMap[entity.entityIndex] = player;
                    match.players.push(player);
                }
                else {
                    //              console.warn('CTFPlayer with unknown player entity', require('util').inspect(entity, {depth: null}));
                    break;
                }
            }
            for (var _d = 0, _e = entity.props; _d < _e.length; _d++) {
                var prop = _e[_d];
                if (prop.definition.ownerTableName === 'm_hMyWeapons') {
                    if (prop.value !== 2097151) {
                        player.weaponIds[parseInt(prop.definition.name, 10)] = prop.value;
                    }
                }
                if (prop.definition.ownerTableName === 'm_iAmmo') {
                    if (prop.value && prop.value > 0) {
                        player.ammo[parseInt(prop.definition.name, 10)] = prop.value;
                    }
                }
                var propName = prop.definition.ownerTableName + '.' + prop.definition.name;
                switch (propName) {
                    case 'DT_BasePlayer.m_iHealth':
                        player.health = prop.value;
                        break;
                    case 'DT_BasePlayer.m_iMaxHealth':
                        player.maxHealth = prop.value;
                        break;
                    case 'DT_TFLocalPlayerExclusive.m_vecOrigin':
                        player.position.x = prop.value.x;
                        player.position.y = prop.value.y;
                        break;
                    case 'DT_TFNonLocalPlayerExclusive.m_vecOrigin':
                        player.position.x = prop.value.x;
                        player.position.y = prop.value.y;
                        break;
                    case 'DT_TFLocalPlayerExclusive.m_vecOrigin[2]':
                        player.position.z = prop.value;
                        break;
                    case 'DT_TFNonLocalPlayerExclusive.m_vecOrigin[2]':
                        player.position.z = prop.value;
                        break;
                    case 'DT_TFNonLocalPlayerExclusive.m_angEyeAngles[1]':
                        player.viewAngle = prop.value;
                        break;
                    case 'DT_TFLocalPlayerExclusive.m_angEyeAngles[1]':
                        player.viewAngle = prop.value;
                        break;
                    case 'DT_BasePlayer.m_lifeState':
                        player.lifeState = prop.value;
                        break;
                    case 'DT_BaseCombatCharacter.m_hActiveWeapon':
                        for (var i = 0; i < player.weapons.length; i++) {
                            if (player.weaponIds[i] === prop.value) {
                                player.activeWeapon = i;
                            }
                        }
                }
            }
            break;
        case 'CWeaponMedigun':
            var weapon = match.weaponMap[entity.entityIndex];
            for (var _f = 0, _g = entity.props; _f < _g.length; _f++) {
                var prop = _g[_f];
                var propName = prop.definition.ownerTableName + '.' + prop.definition.name;
                switch (propName) {
                    case 'DT_WeaponMedigun.m_hHealingTarget':
                        weapon.healTarget = prop.value;
                        break;
                    case 'DT_TFWeaponMedigunDataNonLocal.m_flChargeLevel':
                        weapon.chargeLevel = prop.value;
                        break;
                    case 'DT_LocalTFWeaponMedigunData.m_flChargeLevel':
                        weapon.chargeLevel = prop.value;
                        break;
                }
            }
            break;
        case 'CTFTeam':
            try {
                var teamId = entity.getProperty('DT_Team', 'm_iTeamNum').value;
                if (!match.teams[teamId]) {
                    match.teams[teamId] = {
                        name: entity.getProperty('DT_Team', 'm_szTeamname').value,
                        score: entity.getProperty('DT_Team', 'm_iScore').value,
                        roundsWon: entity.getProperty('DT_Team', 'm_iRoundsWon').value,
                        players: entity.getProperty('DT_Team', '"player_array"').value,
                        teamNumber: teamId
                    };
                    match.teamMap[entity.entityIndex] = match.teams[teamId];
                }
            }
            catch (e) {
                var team = match.teamMap[entity.entityIndex];
                for (var _h = 0, _j = entity.props; _h < _j.length; _h++) {
                    var prop = _j[_h];
                    var propName = prop.definition.ownerTableName + '.' + prop.definition.name;
                    switch (propName) {
                        case 'DT_Team.m_iScore':
                            team.score = prop.value;
                            break;
                        case 'DT_Team.m_szTeamname':
                            team.name = prop.value;
                            break;
                        case 'DT_Team.m_iRoundsWon':
                            team.roundsWon = prop.value;
                            break;
                        case 'DT_Team."player_array"':
                            team.players = prop.value;
                            break;
                    }
                }
                // process.exit();
            }
            break;
        case 'CObjectSentrygun':
            if (!match.buildings[entity.entityIndex]) {
                match.buildings[entity.entityIndex] = {
                    type: 'sentry',
                    ammoRockets: 0,
                    ammoShells: 0,
                    autoAimTarget: 0,
                    builder: 0,
                    health: 0,
                    isBuilding: false,
                    isSapped: false,
                    level: 0,
                    maxHealth: 0,
                    playerControlled: false,
                    position: new Vector(0, 0, 0),
                    shieldLevel: 0,
                    isMini: false,
                    team: 0,
                    angle: 0
                };
            }
            var sentry = match.buildings[entity.entityIndex];
            for (var _k = 0, _l = entity.props; _k < _l.length; _k++) {
                var prop = _l[_k];
                var propName = prop.definition.ownerTableName + '.' + prop.definition.name;
                applyBuildingProp(sentry, prop, propName);
                switch (propName) {
                    case 'DT_ObjectSentrygun.m_bPlayerControlled':
                        sentry.playerControlled = prop.value > 0;
                        break;
                    case 'DT_ObjectSentrygun.m_hAutoAimTarget':
                        sentry.autoAimTarget = prop.value;
                        break;
                    case 'DT_ObjectSentrygun.m_nShieldLevel':
                        sentry.shieldLevel = prop.value;
                        break;
                    case 'DT_ObjectSentrygun.m_iAmmoShells':
                        sentry.ammoShells = prop.value;
                        break;
                    case 'DT_ObjectSentrygun.m_iAmmoRockets':
                        sentry.ammoRockets = prop.value;
                        break;
                    case 'DT_BaseObject.m_bMiniBuilding':
                        sentry.isMini = prop.value > 1;
                        break;
                    case 'DT_TFNonLocalPlayerExclusive.m_angEyeAngles[1]':
                        sentry.angle = prop.value;
                        break;
                }
            }
            if (entity.pvs & PVS.LEAVE) {
                delete match.buildings[entity.entityIndex];
            }
            break;
        case 'CObjectDispenser':
            if (!match.buildings[entity.entityIndex]) {
                match.buildings[entity.entityIndex] = {
                    type: 'dispenser',
                    builder: 0,
                    health: 0,
                    isBuilding: false,
                    isSapped: false,
                    level: 0,
                    maxHealth: 0,
                    position: new Vector(0, 0, 0),
                    team: 0,
                    healing: [],
                    metal: 0,
                    angle: 0
                };
            }
            var dispenser = match.buildings[entity.entityIndex];
            for (var _m = 0, _o = entity.props; _m < _o.length; _m++) {
                var prop = _o[_m];
                var propName = prop.definition.ownerTableName + '.' + prop.definition.name;
                applyBuildingProp(dispenser, prop, propName);
                switch (propName) {
                    case 'DT_ObjectDispenser.m_iAmmoMetal':
                        dispenser.metal = prop.value;
                        break;
                    case 'DT_ObjectDispenser."healing_array"':
                        dispenser.healing = prop.value;
                        break;
                }
            }
            if (entity.pvs & PVS.LEAVE) {
                delete match.buildings[entity.entityIndex];
            }
            break;
        case 'CObjectTeleporter':
            if (!match.buildings[entity.entityIndex]) {
                match.buildings[entity.entityIndex] = {
                    type: 'teleporter',
                    builder: 0,
                    health: 0,
                    isBuilding: false,
                    isSapped: false,
                    level: 0,
                    maxHealth: 0,
                    position: new Vector(0, 0, 0),
                    team: 0,
                    isEntrance: false,
                    otherEnd: 0,
                    rechargeTime: 0,
                    rechargeDuration: 0,
                    timesUsed: 0,
                    angle: 0,
                    yawToExit: 0
                };
            }
            var teleporter = match.buildings[entity.entityIndex];
            for (var _p = 0, _q = entity.props; _p < _q.length; _p++) {
                var prop = _q[_p];
                var propName = prop.definition.ownerTableName + '.' + prop.definition.name;
                applyBuildingProp(teleporter, prop, propName);
                switch (propName) {
                    case 'DT_ObjectTeleporter.m_flRechargeTime':
                        teleporter.rechargeTime = prop.value;
                        break;
                    case 'DT_ObjectTeleporter.m_flCurrentRechargeDuration':
                        teleporter.rechargeDuration = prop.value;
                        break;
                    case 'DT_ObjectTeleporter.m_iTimesUsed':
                        teleporter.timesUsed = prop.value;
                        break;
                    case 'DT_ObjectTeleporter.m_bMatchBuilding':
                        teleporter.otherEnd = prop.value;
                        break;
                    case 'DT_ObjectTeleporter.m_flYawToExit':
                        teleporter.yawToExit = prop.value;
                        break;
                    case 'DT_BaseObject.m_iObjectMode':
                        teleporter.isEntrance = prop.value === 0;
                        break;
                }
            }
            if (entity.pvs & PVS.LEAVE) {
                delete match.buildings[entity.entityIndex];
            }
            break;
        case 'CTFPlayerResource':
            for (var _r = 0, _s = entity.props; _r < _s.length; _r++) {
                var prop = _s[_r];
                var playerId = parseInt(prop.definition.name, 10);
                var value = prop.value;
                if (!match.playerResources[playerId]) {
                    match.playerResources[playerId] = {
                        alive: false,
                        arenaSpectator: false,
                        bonusPoints: 0,
                        chargeLevel: 0,
                        connected: false,
                        damageAssists: 0,
                        damageBlocked: 0,
                        deaths: 0,
                        dominations: 0,
                        healing: 0,
                        healingAssist: 0,
                        health: 0,
                        killStreak: 0,
                        maxBuffedHealth: 0,
                        maxHealth: 0,
                        nextRespawn: 0,
                        ping: 0,
                        playerClass: 0,
                        playerLevel: 0,
                        score: 0,
                        team: 0,
                        totalScore: 0,
                        damage: 0
                    };
                }
                var playerResource = match.playerResources[playerId];
                switch (prop.definition.ownerTableName) {
                    case 'm_iPing':
                        playerResource.ping = value;
                        break;
                    case 'm_iScore':
                        playerResource.score = value;
                        break;
                    case 'm_iDeaths':
                        playerResource.deaths = value;
                        break;
                    case 'm_bConnected':
                        playerResource.connected = value > 0;
                        break;
                    case 'm_iTeam':
                        playerResource.team = value;
                        break;
                    case 'm_bAlive':
                        playerResource.alive = value > 0;
                        break;
                    case 'm_iHealth':
                        playerResource.health = value;
                        break;
                    case 'm_iTotalScore':
                        playerResource.totalScore = value;
                        break;
                    case 'm_iMaxHealth':
                        playerResource.maxHealth = value;
                        break;
                    case 'm_iMaxBuffedHealth':
                        playerResource.maxBuffedHealth = value;
                        break;
                    case 'm_iPlayerClass':
                        playerResource.playerClass = value;
                        break;
                    case 'm_bArenaSpectator':
                        playerResource.arenaSpectator = value > 0;
                        break;
                    case 'm_iActiveDominations':
                        playerResource.dominations = value;
                        break;
                    case 'm_flNextRespawnTime':
                        playerResource.nextRespawn = value;
                        break;
                    case 'm_iChargeLevel':
                        playerResource.chargeLevel = value;
                        break;
                    case 'm_iDamage':
                        playerResource.damage = value;
                        break;
                    case 'm_iDamageAssist':
                        playerResource.damageAssists = value;
                        break;
                    case 'm_iHealing':
                        playerResource.healing = value;
                        break;
                    case 'm_iHealingAssist':
                        playerResource.healingAssist = value;
                        break;
                    case 'm_iDamageBlocked':
                        playerResource.damageBlocked = value;
                        break;
                    case 'm_iBonusPoints':
                        playerResource.bonusPoints = value;
                        break;
                    case 'm_iPlayerLevel':
                        playerResource.playerLevel = value;
                        break;
                    case 'm_iKillstreak':
                        playerResource.killStreak = value;
                        break;
                }
            }
            break;
        case 'CTeamRoundTimer':
            break;
        case 'CLaserDot':
            // for (const prop of entity.props) {
            // 	const propName = prop.definition.ownerTableName + '.' + prop.definition.name;
            // 	switch (propName) {
            // 		case 'DT_BaseEntity.m_iParentAttachment':
            // 			console.log(prop.value);
            // 			process.exit();
            // 			break;
            //
            // 	}
            // }
            // console.log(match.getSendTable(entity.serverClass.dataTable).flattenedProps);
            break;
    }
}
function applyBuildingProp(building, prop, propName) {
    switch (propName) {
        case 'DT_BaseObject.m_iUpgradeLevel':
            building.level = prop.value;
            break;
        case 'DT_BaseObject.m_hBuilder':
            building.builder = prop.value;
            break;
        case 'DT_BaseObject.m_iMaxHealth':
            building.maxHealth = prop.value;
            break;
        case 'DT_BaseObject.m_iHealth':
            building.health = prop.value;
            break;
        case 'DT_BaseObject.m_bBuilding':
            building.isBuilding = prop.value > 0;
            break;
        case 'DT_BaseObject.m_bHasSapper':
            building.isSapped = prop.value > 0;
            break;
        case 'DT_BaseEntity.m_vecOrigin':
            building.position = prop.value;
            break;
        case 'DT_BaseEntity.m_iTeamNum':
            building.team = prop.value;
            break;
        case 'DT_BaseEntity.m_angRotation':
            building.angle = prop.value.y;
            break;
    }
}

function handleGameEventList(packet, match) {
    match.eventDefinitions = packet.eventList;
}

function handleDataTable(packet, match) {
    match.sendTables = packet.tables;
    match.serverClasses = packet.serverClasses;
}

var Match = (function () {
    function Match() {
        this.buildings = {};
        this.playerResources = [];
        this.pov = {
            name: '',
            userId: 0,
            steamId: '',
            classes: {},
            entityId: 0,
            team: ''
        };
        this.tick = 0;
        this.chat = [];
        this.users = {};
        this.deaths = [];
        this.rounds = [];
        this.startTick = 0;
        this.intervalPerTick = 0;
        this.stringTables = [];
        this.sendTables = [];
        this.serverClasses = [];
        this.staticBaseLines = [];
        this.eventDefinitions = {};
        this.players = [];
        this.playerMap = {};
        this.world = {
            boundaryMin: { x: 0, y: 0, z: 0 },
            boundaryMax: { x: 0, y: 0, z: 0 }
        };
        this.entityClasses = {};
        this.sendTableMap = {};
        this.baseLineCache = {};
        this.weaponMap = {};
        this.outerMap = {};
        this.teams = [];
        this.teamMap = {};
        this.version = 0;
    }
    Match.prototype.getSendTable = function (name) {
        if (this.sendTableMap[name]) {
            return this.sendTableMap[name];
        }
        for (var _i = 0, _a = this.sendTables; _i < _a.length; _i++) {
            var table = _a[_i];
            if (table.name === name) {
                this.sendTableMap[name] = table;
                return table;
            }
        }
        throw new Error("unknown SendTable " + name);
    };
    Match.prototype.getStringTable = function (name) {
        for (var _i = 0, _a = this.stringTables; _i < _a.length; _i++) {
            var table = _a[_i];
            if (table.name === name) {
                return table;
            }
        }
        return null;
    };
    Match.prototype.getState = function () {
        var users = {};
        for (var key in this.users) {
            var user = this.users[key];
            if (this.users.hasOwnProperty(key)) {
                users[key] = {
                    classes: user.classes,
                    name: user.name,
                    steamId: user.steamId,
                    userId: user.userId,
                };
                if (user.team) {
                    users[key].team = user.team;
                }
            }
        }
        return {
            'chat': this.chat,
            'users': users,
            'deaths': this.deaths,
            'rounds': this.rounds,
            'startTick': this.startTick,
            'intervalPerTick': this.intervalPerTick
        };
    };
    Match.prototype.handlePacket = function (packet) {
        switch (packet.packetType) {
            case 'packetEntities':
                handlePacketEntities(packet, this);
                break;
            case 'consoleCmd':
                //        console.log(packet.command);
                break;
            case 'netTick':
                if (this.startTick === 0) {
                    this.startTick = packet.tick;
                }
                this.tick = packet.tick;
                break;
            case 'serverInfo':
                this.intervalPerTick = packet.intervalPerTick;
                this.version = packet.version;
                break;
            case 'sayText2':
                handleSayText2(packet, this);
                break;
            case 'dataTable':
                handleDataTable(packet, this);
                break;
            case 'stringTable':
                handleStringTable(packet, this);
                break;
            case 'gameEventList':
                handleGameEventList(packet, this);
                break;
            case 'gameEvent':
                handleGameEvent(packet, this);
                break;
            default:
                //        console.log('unhandled', packet.packetType, packet);
                break;
        }
    };
    Match.prototype.getUserInfo = function (userId) {
        // no clue why it does this
        // only seems to be the case with per user ready
        while (userId > 256) {
            userId -= 256;
        }
        if (!this.users[userId]) {
            //          console.log('missing userid', userId);
            this.users[userId] = {
                name: '',
                userId: userId,
                steamId: '',
                classes: {},
                entityId: 0,
                team: ''
            };
        }
        return this.users[userId];
    };
    Match.prototype.getUserInfoForEntity = function (entity) {
        for (var _i = 0, _a = Object.keys(this.users); _i < _a.length; _i++) {
            var id = _a[_i];
            var user = this.users[id];
            if (user && user.entityId === entity.entityIndex) {
                return user;
            }
        }
        return this.pov;
        //    return undefined;
    };
    Match.prototype.getPlayerByUserId = function (userId) {
        for (var _i = 0, _a = this.players; _i < _a.length; _i++) {
            var player = _a[_i];
            if (player.user.userId === userId) {
                return player;
            }
        }
        throw new Error('player not found for user id');
    };
    Object.defineProperty(Match.prototype, "classBits", {
        get: function () {
            return Math.ceil(Math.log(this.serverClasses.length) * Math.LOG2E);
        },
        enumerable: true,
        configurable: true
    });
    return Match;
}());

var __extends = (undefined && undefined.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var Parser$$1 = (function (_super) {
    __extends(Parser$$1, _super);
    function Parser$$1(stream) {
        var _this = _super.call(this) || this;
        _this.stream = stream;
        _this.match = new Match();
        _this.on('packet', _this.match.handlePacket.bind(_this.match));
        return _this;
    }
    Parser$$1.prototype.readHeader = function () {
        return this.parseHeader(this.stream);
    };
    Parser$$1.prototype.parseHeader = function (stream) {
        return {
            'type': stream.readASCIIString(8),
            'version': stream.readInt32(),
            'protocol': stream.readInt32(),
            'server': stream.readASCIIString(260),
            'nick': stream.readASCIIString(260),
            'map': stream.readASCIIString(260),
            'game': stream.readASCIIString(260),
            'duration': stream.readFloat32(),
            'ticks': stream.readInt32(),
            'frames': stream.readInt32(),
            'sigon': stream.readInt32()
        };
    };
    Parser$$1.prototype.parseBody = function () {
        var hasNext = true;
        while (hasNext) {
            hasNext = this.tick();
        }
        this.emit('done', this.match);
        return this.match;
    };
    Parser$$1.prototype.tick = function () {
        var message = this.readMessage(this.stream, this.match);
        if (message instanceof Parser$1) {
            this.handleMessage(message);
            //        console.log('is a message!');
        }
        else {
            //        console.log('not a messageparser', message);
        }
        return !!message;
    };
    Parser$$1.prototype.parseMessage = function (data, type, tick, length, match) {
        /*
                switch (type) {
                case MessageType.Sigon: console.log('MessageType.Sigon:');break;
            case MessageType.Packet: console.log('MessageType.Packet:');break;
                case MessageType.ConsoleCmd: console.log('MessageType.ConsoleCmd:');break;
                case MessageType.UserCmd: console.log('MessageType.UserCmd:');break;
                case MessageType.DataTables: console.log('MessageType.DataTables:');break;
                case MessageType.StringTables: console.log('MessageType.StringTables:');break;
                    default:
                        throw new Error("unknown message type");
                }
        */
        switch (type) {
            case MessageType.Sigon:
            case MessageType.Packet:
                return new Packet(type, tick, data, length, match);
            case MessageType.ConsoleCmd:
                return new ConsoleCmd(type, tick, data, length, match);
            case MessageType.UserCmd:
                return new UserCmd(type, tick, data, length, match);
            case MessageType.DataTables:
                return new DataTable(type, tick, data, length, match);
            case MessageType.StringTables:
            default:
                return new StringTable(type, tick, data, length, match);
        }
        //				return new StringTable(type, tick, data, length, match);
    };
    Parser$$1.prototype.handleMessage = function (message) {
        if (message.parse) {
            var packets = message.parse();
            for (var i = 0; i < packets.length; i++) {
                var packet = packets[i];
                if (packet) {
                    this.emit('packet', packet);
                }
            }
        }
    };
    Parser$$1.prototype.readMessage = function (stream, match) {
        if (stream.bitsLeft < 8) {
            return false;
        }
        var type = stream.readBits(8);
        if (type === MessageType.Stop) {
            return false;
        }
        var tick = stream.readInt32();
        var viewOrigin = [];
        var viewAngles = [];
        switch (type) {
            case MessageType.Sigon:
            case MessageType.Packet:
                this.stream.readInt32(); // flags
                for (var j = 0; j < 2; j++) {
                    viewOrigin[j] = [];
                    viewAngles[j] = [];
                    for (var i = 0; i < 3; i++) {
                        viewOrigin[j][i] = this.stream.readInt32();
                    }
                    for (var i = 0; i < 3; i++) {
                        viewAngles[j][i] = this.stream.readInt32();
                    }
                    for (var i = 0; i < 3; i++) {
                        this.stream.readInt32(); // local viewAngles
                    }
                }
                this.stream.readInt32(); // sequence in
                this.stream.readInt32(); // sequence out
                break;
            case MessageType.UserCmd:
                stream.byteIndex += 0x04; // unknown / outgoing sequence
                break;
            case MessageType.SyncTick:
                return true;
        }
        var length = stream.readInt32();
        var buffer = stream.readBitStream(length * 8);
        return this.parseMessage(buffer, type, tick, length, match);
    };
    return Parser$$1;
}(EventEmitter));
var MessageType;
(function (MessageType) {
    MessageType[MessageType["Sigon"] = 1] = "Sigon";
    MessageType[MessageType["Packet"] = 2] = "Packet";
    MessageType[MessageType["SyncTick"] = 3] = "SyncTick";
    MessageType[MessageType["ConsoleCmd"] = 4] = "ConsoleCmd";
    MessageType[MessageType["UserCmd"] = 5] = "UserCmd";
    MessageType[MessageType["DataTables"] = 6] = "DataTables";
    MessageType[MessageType["Stop"] = 7] = "Stop";
    MessageType[MessageType["StringTables"] = 8] = "StringTables";
})(MessageType || (MessageType = {}));

var __extends$6 = (undefined && undefined.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var StreamParser = (function (_super) {
    __extends$6(StreamParser, _super);
    function StreamParser(stream) {
        var _this = _super.call(this, new bitBuffer_2(new ArrayBuffer(0))) || this;
        _this.sourceStream = stream;
        _this.on('packet', _this.match.handlePacket.bind(_this.match));
        _this.header = null;
        _this.buffer = new Buffer(0);
        return _this;
    }
    StreamParser.prototype.eatBuffer = function (length) {
        this.buffer = shrinkBuffer(this.buffer, length);
    };
    StreamParser.prototype.start = function () {
        this.sourceStream.on('data', this.handleData.bind(this));
        this.sourceStream.on('end', function () {
            this.emit('done', this.match);
        }.bind(this));
    };
    StreamParser.prototype.handleData = function (data) {
        this.buffer = Buffer.concat([this.buffer, data]);
        if (this.header === null) {
            if (this.buffer.length > 1072) {
                this.header = this.parseHeader(new bitBuffer_2(this.buffer));
                this.eatBuffer(1072);
            }
        }
        else {
            this.readStreamMessage();
        }
    };
    StreamParser.prototype.readStreamMessage = function () {
        if (this.buffer.length < 9) {
            return;
        }
        var stream = new bitBuffer_2(this.buffer);
        var type = stream.readBits(8);
        if (type === MessageType.Stop) {
            console.log('stop');
            return;
        }
        var tick = stream.readInt32();
        var headerSize = 5;
        var extraHeader = 0;
        switch (type) {
            case MessageType.Sigon:
            case MessageType.Packet:
                extraHeader += 0x54; // command/sequence info
                break;
            case MessageType.UserCmd:
                extraHeader += 0x04; // unknown / outgoing sequence
                break;
            case MessageType.Stop:
            case MessageType.SyncTick:
                this.eatBuffer(headerSize);
                return;
        }
        stream.byteIndex += extraHeader;
        var length = stream.readInt32();
        headerSize += extraHeader + 4;
        if (this.buffer.length < (headerSize + length)) {
            console.log('wants ' + length);
            return;
        }
        console.log('got message ' + tick);
        var messageStream = stream.readBitStream(length * 8);
        var message = this.parseMessage(messageStream, type, tick, length, this.match);
        this.handleMessage(message);
    };
    return StreamParser;
}(Parser$$1));
function shrinkBuffer(buffer, length) {
    if (length < 0) {
        throw 'cant shrink by negative length ' + length;
    }
    return buffer.slice(length, buffer.length);
}

var Demo = (function () {
    function Demo(arrayBuffer) {
        this.stream = new bitBuffer_2(arrayBuffer);
    }
    Demo.prototype.getParser = function () {
        if (!this.parser) {
            this.parser = new Parser$$1(this.stream);
        }
        return this.parser;
    };
    Demo.fromNodeBuffer = function (nodeBuffer) {
        var arrayBuffer = new ArrayBuffer(nodeBuffer.length);
        var view = new Uint8Array(arrayBuffer);
        for (var i = 0; i < nodeBuffer.length; ++i) {
            view[i] = nodeBuffer[i];
        }
        return new Demo(arrayBuffer);
    };
    Demo.fromNodeStream = function (nodeStream) {
        return new StreamDemo(nodeStream);
    };
    return Demo;
}());
var StreamDemo = (function () {
    function StreamDemo(nodeStream) {
        this.stream = nodeStream;
    }
    StreamDemo.prototype.getParser = function () {
        return new StreamParser(this.stream);
    };
    return StreamDemo;
}());

var PlayerCondition;
(function (PlayerCondition) {
    PlayerCondition[PlayerCondition["TF_COND_AIMIN"] = 1] = "TF_COND_AIMIN";
    PlayerCondition[PlayerCondition["TF_COND_ZOOMED"] = 2] = "TF_COND_ZOOMED";
    PlayerCondition[PlayerCondition["TF_COND_DISGUISING"] = 4] = "TF_COND_DISGUISING";
    PlayerCondition[PlayerCondition["TF_COND_DISGUISED"] = 8] = "TF_COND_DISGUISED";
    PlayerCondition[PlayerCondition["TF_COND_STEALTHED"] = 16] = "TF_COND_STEALTHED";
    PlayerCondition[PlayerCondition["TF_COND_INVULNERABL"] = 32] = "TF_COND_INVULNERABL";
    PlayerCondition[PlayerCondition["TF_COND_TELEPORTED"] = 64] = "TF_COND_TELEPORTED";
    PlayerCondition[PlayerCondition["TF_COND_TAUNTING"] = 128] = "TF_COND_TAUNTING";
    PlayerCondition[PlayerCondition["TF_COND_INVULNERABLE_WEARINGOFF"] = 256] = "TF_COND_INVULNERABLE_WEARINGOFF";
    PlayerCondition[PlayerCondition["TF_COND_STEALTHED_BLIN"] = 512] = "TF_COND_STEALTHED_BLIN";
    PlayerCondition[PlayerCondition["TF_COND_SELECTED_TO_TELEPOR"] = 1024] = "TF_COND_SELECTED_TO_TELEPOR";
    PlayerCondition[PlayerCondition["TF_COND_CRITBOOSTED"] = 2048] = "TF_COND_CRITBOOSTED";
    PlayerCondition[PlayerCondition["TF_COND_TMPDAMAGEBONUS"] = 4096] = "TF_COND_TMPDAMAGEBONUS";
    PlayerCondition[PlayerCondition["TF_COND_FEIGN_DEATH"] = 8192] = "TF_COND_FEIGN_DEATH";
    PlayerCondition[PlayerCondition["TF_COND_PHAS"] = 16384] = "TF_COND_PHAS";
    PlayerCondition[PlayerCondition["TF_COND_STUNNED"] = 32768] = "TF_COND_STUNNED";
    PlayerCondition[PlayerCondition["TF_COND_OFFENSEBUF"] = 65536] = "TF_COND_OFFENSEBUF";
    PlayerCondition[PlayerCondition["TF_COND_SHIELD_CHARG"] = 131072] = "TF_COND_SHIELD_CHARG";
    PlayerCondition[PlayerCondition["TF_COND_DEMO_BUF"] = 262144] = "TF_COND_DEMO_BUF";
    PlayerCondition[PlayerCondition["TF_COND_ENERGY_BUF"] = 524288] = "TF_COND_ENERGY_BUF";
    PlayerCondition[PlayerCondition["TF_COND_RADIUSHEA"] = 1048576] = "TF_COND_RADIUSHEA";
    PlayerCondition[PlayerCondition["TF_COND_HEALTH_BUF"] = 2097152] = "TF_COND_HEALTH_BUF";
    PlayerCondition[PlayerCondition["TF_COND_BURNING"] = 4194304] = "TF_COND_BURNING";
    PlayerCondition[PlayerCondition["TF_COND_HEALTH_OVERHEALE"] = 8388608] = "TF_COND_HEALTH_OVERHEALE";
    PlayerCondition[PlayerCondition["TF_COND_URINE"] = 16777216] = "TF_COND_URINE";
    PlayerCondition[PlayerCondition["TF_COND_BLEEDING"] = 33554432] = "TF_COND_BLEEDING";
    PlayerCondition[PlayerCondition["TF_COND_DEFENSEBUFF"] = 67108864] = "TF_COND_DEFENSEBUFF";
    PlayerCondition[PlayerCondition["TF_COND_MAD_MILK"] = 134217728] = "TF_COND_MAD_MILK";
    PlayerCondition[PlayerCondition["TF_COND_MEGAHEAL"] = 268435456] = "TF_COND_MEGAHEAL";
    PlayerCondition[PlayerCondition["TF_COND_REGENONDAMAGEBUF"] = 536870912] = "TF_COND_REGENONDAMAGEBUF";
    PlayerCondition[PlayerCondition["TF_COND_MARKEDFORDEATH"] = 1073741824] = "TF_COND_MARKEDFORDEATH";
    PlayerCondition[PlayerCondition["TF_COND_NOHEALINGDAMAGEBUF"] = -2147483648] = "TF_COND_NOHEALINGDAMAGEBUF";
    PlayerCondition[PlayerCondition["TF_COND_SPEED_BOOST"] = 1] = "TF_COND_SPEED_BOOST";
    PlayerCondition[PlayerCondition["TF_COND_CRITBOOSTED_PUMPKIN"] = 2] = "TF_COND_CRITBOOSTED_PUMPKIN";
    PlayerCondition[PlayerCondition["TF_COND_CRITBOOSTED_USER_BUFF"] = 4] = "TF_COND_CRITBOOSTED_USER_BUFF";
    PlayerCondition[PlayerCondition["TF_COND_CRITBOOSTED_DEMO_CHARGE"] = 8] = "TF_COND_CRITBOOSTED_DEMO_CHARGE";
    PlayerCondition[PlayerCondition["TF_COND_CRITBOOSTED_HYPE"] = 16] = "TF_COND_CRITBOOSTED_HYPE";
    PlayerCondition[PlayerCondition["TF_COND_CRITBOOSTED_FIRST_BLOOD"] = 32] = "TF_COND_CRITBOOSTED_FIRST_BLOOD";
    PlayerCondition[PlayerCondition["TF_COND_CRITBOOSTED_BONUS_TIME"] = 64] = "TF_COND_CRITBOOSTED_BONUS_TIME";
    PlayerCondition[PlayerCondition["TF_COND_CRITBOOSTED_CTF_CAPTURE"] = 128] = "TF_COND_CRITBOOSTED_CTF_CAPTURE";
    PlayerCondition[PlayerCondition["TF_COND_CRITBOOSTED_ON_KILL"] = 256] = "TF_COND_CRITBOOSTED_ON_KILL";
    PlayerCondition[PlayerCondition["TF_COND_CANNOT_SWITCH_FROM_MELEE"] = 512] = "TF_COND_CANNOT_SWITCH_FROM_MELEE";
    PlayerCondition[PlayerCondition["TF_COND_DEFENSEBUFF_NO_CRIT_BLOCK"] = 1024] = "TF_COND_DEFENSEBUFF_NO_CRIT_BLOCK";
    PlayerCondition[PlayerCondition["TF_COND_REPROGRAMME"] = 2048] = "TF_COND_REPROGRAMME";
    PlayerCondition[PlayerCondition["TF_COND_CRITBOOSTED_RAGE_BUF"] = 4096] = "TF_COND_CRITBOOSTED_RAGE_BUF";
    PlayerCondition[PlayerCondition["TF_COND_DEFENSEBUFF_HIG"] = 8192] = "TF_COND_DEFENSEBUFF_HIG";
    PlayerCondition[PlayerCondition["TF_COND_SNIPERCHARGE_RAGE_BUFF"] = 16384] = "TF_COND_SNIPERCHARGE_RAGE_BUFF";
    PlayerCondition[PlayerCondition["TF_COND_DISGUISE_WEARINGOF"] = 32768] = "TF_COND_DISGUISE_WEARINGOF";
    PlayerCondition[PlayerCondition["TF_COND_MARKEDFORDEATH_SILENT"] = 65536] = "TF_COND_MARKEDFORDEATH_SILENT";
    PlayerCondition[PlayerCondition["TF_COND_DISGUISED_AS_DISPENSE"] = 131072] = "TF_COND_DISGUISED_AS_DISPENSE";
    PlayerCondition[PlayerCondition["TF_COND_SAPPED"] = 262144] = "TF_COND_SAPPED";
    PlayerCondition[PlayerCondition["TF_COND_INVULNERABLE_HIDE_UNLESS_DAMAGE"] = 524288] = "TF_COND_INVULNERABLE_HIDE_UNLESS_DAMAGE";
    PlayerCondition[PlayerCondition["TF_COND_INVULNERABLE_USER_BUF"] = 1048576] = "TF_COND_INVULNERABLE_USER_BUF";
    PlayerCondition[PlayerCondition["TF_COND_HALLOWEEN_BOMB_HEAD"] = 2097152] = "TF_COND_HALLOWEEN_BOMB_HEAD";
    PlayerCondition[PlayerCondition["TF_COND_HALLOWEEN_THRILLER"] = 4194304] = "TF_COND_HALLOWEEN_THRILLER";
    PlayerCondition[PlayerCondition["TF_COND_RADIUSHEAL_ON_DAMAGE"] = 8388608] = "TF_COND_RADIUSHEAL_ON_DAMAGE";
    PlayerCondition[PlayerCondition["TF_COND_CRITBOOSTED_CARD_EFFECT"] = 16777216] = "TF_COND_CRITBOOSTED_CARD_EFFECT";
    PlayerCondition[PlayerCondition["TF_COND_INVULNERABLE_CARD_EFFECT"] = 33554432] = "TF_COND_INVULNERABLE_CARD_EFFECT";
    PlayerCondition[PlayerCondition["TF_COND_MEDIGUN_UBER_BULLET_RESIST"] = 67108864] = "TF_COND_MEDIGUN_UBER_BULLET_RESIST";
    PlayerCondition[PlayerCondition["TF_COND_MEDIGUN_UBER_BLAST_RESIST"] = 134217728] = "TF_COND_MEDIGUN_UBER_BLAST_RESIST";
    PlayerCondition[PlayerCondition["TF_COND_MEDIGUN_UBER_FIRE_RESIST"] = 268435456] = "TF_COND_MEDIGUN_UBER_FIRE_RESIST";
    PlayerCondition[PlayerCondition["TF_COND_MEDIGUN_SMALL_BULLET_RESIST"] = 536870912] = "TF_COND_MEDIGUN_SMALL_BULLET_RESIST";
    PlayerCondition[PlayerCondition["TF_COND_MEDIGUN_SMALL_BLAST_RESIST"] = 1073741824] = "TF_COND_MEDIGUN_SMALL_BLAST_RESIST";
    PlayerCondition[PlayerCondition["TF_COND_MEDIGUN_SMALL_FIRE_RESIST"] = -2147483648] = "TF_COND_MEDIGUN_SMALL_FIRE_RESIST";
    PlayerCondition[PlayerCondition["TF_COND_STEALTHED_USER_BUF"] = 1] = "TF_COND_STEALTHED_USER_BUF";
    PlayerCondition[PlayerCondition["TF_COND_MEDIGUN_DEBUF"] = 2] = "TF_COND_MEDIGUN_DEBUF";
    PlayerCondition[PlayerCondition["TF_COND_STEALTHED_USER_BUFF_FADING"] = 4] = "TF_COND_STEALTHED_USER_BUFF_FADING";
    PlayerCondition[PlayerCondition["TF_COND_BULLET_IMMUNE"] = 8] = "TF_COND_BULLET_IMMUNE";
    PlayerCondition[PlayerCondition["TF_COND_BLAST_IMMUNE"] = 16] = "TF_COND_BLAST_IMMUNE";
    PlayerCondition[PlayerCondition["TF_COND_FIRE_IMMUNE"] = 32] = "TF_COND_FIRE_IMMUNE";
    PlayerCondition[PlayerCondition["TF_COND_PREVENT_DEATH"] = 64] = "TF_COND_PREVENT_DEATH";
    PlayerCondition[PlayerCondition["TF_COND_MVM_BOT_STUN_RADIOWAVE"] = 128] = "TF_COND_MVM_BOT_STUN_RADIOWAVE";
    PlayerCondition[PlayerCondition["TF_COND_HALLOWEEN_SPEED_BOOST"] = 256] = "TF_COND_HALLOWEEN_SPEED_BOOST";
    PlayerCondition[PlayerCondition["TF_COND_HALLOWEEN_QUICK_HEAL"] = 512] = "TF_COND_HALLOWEEN_QUICK_HEAL";
    PlayerCondition[PlayerCondition["TF_COND_HALLOWEEN_GIANT"] = 1024] = "TF_COND_HALLOWEEN_GIANT";
    PlayerCondition[PlayerCondition["TF_COND_HALLOWEEN_TINY"] = 2048] = "TF_COND_HALLOWEEN_TINY";
    PlayerCondition[PlayerCondition["TF_COND_HALLOWEEN_IN_HELL"] = 4096] = "TF_COND_HALLOWEEN_IN_HELL";
    PlayerCondition[PlayerCondition["TF_COND_HALLOWEEN_GHOST_MODE"] = 8192] = "TF_COND_HALLOWEEN_GHOST_MODE";
    PlayerCondition[PlayerCondition["TF_COND_MINICRITBOOSTED_ON_KILL"] = 16384] = "TF_COND_MINICRITBOOSTED_ON_KILL";
})(PlayerCondition || (PlayerCondition = {}));



var index = Object.freeze({
	Demo: Demo,
	Parser: Parser$$1,
	StreamParser: StreamParser,
	Match: Match,
	Player: Player,
	get PlayerCondition () { return PlayerCondition; },
	PacketEntity: PacketEntity,
	SendPropDefinition: SendPropDefinition,
	get SendPropFlag () { return SendPropFlag; },
	get SendPropType () { return SendPropType; },
	SendProp: SendProp,
	Vector: Vector
});

var require$$0$1 = ( index && undefined ) || index;

window.tf2demo = require$$0$1;
