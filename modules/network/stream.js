// @ts-check
// Network helper module for data packets

const PacketData = require('./packet.js').PacketData;
const DataType = require('./data.js').DataType;
const DataTypeStruct = require('./data.js').DataTypeStruct;
const getDataTypeSize = require('./data.js').getDataTypeSize;
const getDataTypeScaleFactor = require('./data.js').getDataTypeScaleFactor;
const getDataTypeReadFunc = require('./data.js').getDataTypeReadFunc;
const getDataTypeWriteFunc = require('./data.js').getDataTypeWriteFunc;
const getDataTypeMinValue = require('./data.js').getDataTypeMinValue;
const getDataTypeMaxValue = require('./data.js').getDataTypeMaxValue;
const writeDataType = require('./data.js').writeDataType;
const readDataType = require('./data.js').readDataType;

const PacketError = {
	InvalidID: 0,
	EndOfStream: 1
}
const PacketErrorCount = 2;

class NetStream
{
	constructor(buf, offset)
	{
		this.buf = buf
		this.chunks = [];
		this.position = offset;
	}

	increasePosition(by)
	{
		var prevPosition = this.position;
		this.position += by;
		return prevPosition;
	}

	writeData(type, data)
	{
		if (type >= 100)
		{
			for (const [key, value] of Object.entries(DataTypeStruct[type]))
				this.writeData(value, data[key]);
		}
		else
		{
			var buffer = Buffer.alloc(getDataTypeSize(type));
			var value = data * getDataTypeScaleFactor(type);
			// @ts-ignore
			buffer[getDataTypeWriteFunc(type)](value);
			this.chunks.push(buffer);
		}
	}

	readData(type)
	{
		if (type >= 100)
		{
			var data = {};
			for (const [key, value] of Object.entries(DataTypeStruct[type]))
				data[key] = this.readData(value);
			return data;
		}
		else
			return this.buf[getDataTypeReadFunc(type)](this.increasePosition(getDataTypeSize(type))) / getDataTypeScaleFactor(type);
	}

	writeString(string, length)
	{
		var buffer = Buffer.alloc(length, 0x20);
		var offs = 0;
		for (var i = 0; i < Math.min(string.length, buffer.length); i++)
			offs = buffer.writeUInt8(string.charCodeAt(i) & 0xFF, offs);
		this.chunks.push(buffer);
	}

	readString(trim, length)
	{
		var finalString = "";
		for (var i = 0; i < length; i++)
			finalString += String.fromCharCode(this.buf.readInt8(this.increasePosition(1)));
		return trim ? finalString.trimEnd() : finalString;
	}

	writeByteArray(array)
	{
		this.chunks.push(array);
	}

	readByteArray()
	{
		var array = new Array(1024);
		for (var i = 0; i < array.length; i++)
			array[i] = this.buf.getInt8(this.increasePosition(1));
		return array;
	}

	checkEndOfStream(type)
	{
		return this.position + getDataTypeSize(type) > this.buf.length;
	}

	getPosition()
	{
		return this.position;
	}

	setPosition(pos)
	{
		this.position = pos;
	}

	getData()
	{
		return Buffer.concat(this.chunks);
	}
}

function deserializePacket(data, offset)
{
	var netStream = new NetStream(data, offset);

	if (netStream.checkEndOfStream(1))
		return { error: PacketError.EndOfStream };
	const packetID = netStream.readData(DataType.UByte);

	const packetType = PacketData[packetID];
	if (packetType == undefined)
		return { id: packetID, error: PacketError.InvalidID };

	var packet = {
		id: packetID,
		data: {},
		size: 0
	};
	for (const [key, value] of Object.entries(packetType))
	{
		if (netStream.checkEndOfStream(value))
			return { id: packetID, error: PacketError.EndOfStream };

		packet.data[key] = readDataType(value, netStream);
	}
	packet.size = netStream.getPosition() - offset;
	return packet;
}

function serializePacket(packetID, data)
{
	var netStream = new NetStream(); // for writing

	const packetType = PacketData[packetID];
	if (packetType == undefined)
		return PacketError.InvalidID

	netStream.writeData(DataType.UByte, packetID);
	for (const [key, value] of Object.entries(packetType))
	{
		if (data[key] == undefined)
			console.error(`Missing ${key} from packet data!`);
		if (value == undefined || value < 0)
			console.error(`Invalid data type ${value}!`);

		writeDataType(value, data[key], netStream);
	}

	return netStream.getData();
}

module.exports = { PacketError, serializePacket, deserializePacket };

