/**
 * @nosideeffects
 * @constructor
 */
var Header = {};

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

/**
 * @return {Parser}
 */
Parser.prototype.on = function(name, fn){};

/**
 * @return {Header}
 */
Parser.prototype.readHeader = function(){};

Parser.prototype.parseBody = function(){};

var SendPropDefinition = {};
var SendPropFlag = {};
var SendPropType = {};
var StreamParser = {};
var Match = {};
var Player = {};
var PlayerCondition = {};
var GameEvent = {};
var PacketEntity = {};
var SendProp = {};
var Vector = {};
var World = {};
var UserInfo = {};
var Packet = {};
