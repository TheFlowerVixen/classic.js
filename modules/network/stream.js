// Network helper module for data packets

const DataType = require('./data.js').DataType;
const DataTypeInfo = require('./data.js').DataTypeInfo;
const PacketType = require('./packet.js').PacketType;
const PacketData = require('./packet.js').PacketData;

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
		var buffer = Buffer.alloc(DataTypeInfo[type].size);
		buffer[DataTypeInfo[type].writeFunc](data * DataTypeInfo[type].scaleFactor);
		this.chunks.push(buffer);
	}

	readData(type)
	{
		return this.buf[DataTypeInfo[type].readFunc](this.increasePosition(DataTypeInfo[type].size)) / DataTypeInfo[type].scaleFactor;
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

	checkEndOfStream(offset)
	{
		return this.position + offset > this.buf.length;
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
		return [PacketError.EndOfStream, null];
	const packetID = netStream.readData(DataType.UByte);

	const packetType = PacketData[packetID];
	if (packetType == undefined)
		return [PacketError.InvalidID, packetID];

	var packet = {
		id: packetID,
		data: {},
		size: 0
	};
	for (const [key, value] of Object.entries(packetType))
	{
		if (netStream.checkEndOfStream(DataTypeInfo[value].size))
			return [PacketError.EndOfStream, packetID];

		switch (value)
		{
			case DataType.String:
			case DataType.UntrimmedString:
			case DataType.DoubleString:
			case DataType.DoubleUntrimmedString:
				packet.data[key] = netStream.readString((value - DataType.String) % 2 == 0, DataTypeInfo[value].size);
				break;
			
			case DataType.ByteArray:
				packet.data[key] = netStream.readByteArray();
				break;
			
			default:
				packet.data[key] = netStream.readData(value);
				break;
		}
	}
	packet.size = netStream.getPosition() - offset;
	return packet;
}

function serializePacket(packetID, data)
{
	var netStream = new NetStream(); // for writing

	const packetType = PacketData[packetID];
	if (packetType == undefined)
		return [PacketError.InvalidID, packetID];

	netStream.writeData(DataType.UByte, packetID);
	for (const [key, value] of Object.entries(packetType))
	{
		if (data[key] == undefined)
			console.error(`Missing ${key} from packet data!`);
		if (value == undefined || value < 0 || value > DataTypeInfo.length)
			console.error(`Invalid data type ${value}!`);

		switch (value)
		{
			case DataType.String:
			case DataType.UntrimmedString:
			case DataType.DoubleString:
			case DataType.DoubleUntrimmedString:
				netStream.writeString(data[key], DataTypeInfo[value].size);
				break;
			
			case DataType.ByteArray:
				netStream.writeByteArray(data[key]);
				break;
			
			default:
				netStream.writeData(value, data[key]);
				break;
		}
	}

	return netStream.getData();
}

module.exports = { PacketError, serializePacket, deserializePacket };

