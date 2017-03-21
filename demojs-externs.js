/**
 * @nosideeffects
 * @constructor
 */
var Header = {};

/**
 * @nosideeffects
 * @constructor
 */
var MessageParser = function(){};
MessageParser.prototype.parse = function(){};

/**
 * @constructor
 */
var Demo = function(){};

/**
 * @return {Parser}
 */
Demo.prototype.getParser = function(demo){};

/**
 * @constructor
 */
var Parser = function(){};
Parser.prototype.stream = {};
Parser.prototype.match = {};

/**
 * @return {Parser}
 */
Parser.prototype.on = function(name, fn){};

/**
 * @return {Header}
 */
Parser.prototype.readHeader = function(){};

/**
 * @return {MessageParser}
 */
Parser.prototype.readMessage = function(){};

Parser.prototype.parseBody = function(){};
Parser.prototype.emit = function(){};

var SendPropDefinition = {};
var SendPropFlag = {};
var SendPropType = {};
var StreamParser = {};
var Match = {};
var Player = {};
var PlayerCondition = {};
var GameEvent = {};
var Vector = {};
var World = {};
var UserInfo = {};
var Packet = {};
var PacketEntity = function(){};
var SendProp = function(){};
var ServerClass = function(){};
