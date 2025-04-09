const DataType = require('./data.js').DataType;
const DataTypeSpecial = require('./data.js').DataTypeSpecial;
const getDataTypeSize = require('./data.js').getDataTypeSize;
const getDataTypeScaleFactor = require('./data.js').getDataTypeScaleFactor;
const getDataTypeReadFunc = require('./data.js').getDataTypeReadFunc;
const getDataTypeWriteFunc = require('./data.js').getDataTypeWriteFunc;
const getDataTypeMinValue = require('./data.js').getDataTypeMinValue;
const getDataTypeMaxValue = require('./data.js').getDataTypeMaxValue;
const writeDataType = require('./data.js').writeDataType;
const readDataType = require('./data.js').readDataType;

const PacketType = require('./packet.js').PacketType;
const PacketData = require('./packet.js').PacketData;

const PacketError = require('./stream.js').PacketError;
const serializePacket = require('./stream.js').serializePacket;
const deserializePacket = require('./stream.js').deserializePacket;

module.exports = {
    DataType, DataTypeSpecial, writeDataType, readDataType,
    getDataTypeSize, getDataTypeScaleFactor, getDataTypeReadFunc, getDataTypeWriteFunc, getDataTypeMinValue, getDataTypeMaxValue,
    PacketType, PacketData,
    PacketError, serializePacket, deserializePacket
}