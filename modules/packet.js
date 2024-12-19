// Network helper module for data packets

const DataType = {
	Byte: 0,
	UByte: 1,
	UShort: 2,
	UInt: 3,
	Fixed: 4,
	String: 5,
	UntrimmedString: 6,
	ByteArray: 7
}
const DataTypeCount = 7;

const PacketError = {
	InvalidID: 0,
	EndOfStream: 1
}
const PacketErrorCount = 2;

const PacketType = {
	Handshake: 0x00,
	ClientPing: 0x01,
	LevelInit: 0x02,
	LevelChunk: 0x03,
	LevelEnd: 0x04,
	SetBlockClient: 0x05,
	SetBlockServer: 0x06,
	AddPlayer: 0x07,
	PlayerPosition: 0x08,
	PosRotUpdate: 0x09,
	PosUpdate: 0x0A,
	RotUpdate: 0x0B,
	RemovePlayer: 0x0C,
	Message: 0x0D,
	DisconnectPlayer: 0x0E,
	OpUser: 0x0F,

	ExtInfo: 0x10,
	ExtEntry: 0x11
}
const PacketTypeCount = 0x12;

const PacketData = [
	// Handshake:
	{
		protocolVersion: DataType.UByte,
		name: DataType.String,
		extra: DataType.String,
		supportByte: DataType.UByte
	},
	// ClientPing:
	{},
	// LevelInit:
	{},
	// LevelChunk:
	{
		chunkLength: DataType.UShort,
		chunkData: DataType.ByteArray,
		percentComplete: DataType.UByte
	},
	// LevelEnd:
	{
		sizeX: DataType.UShort,
		sizeY: DataType.UShort,
		sizeZ: DataType.UShort
	},
	// SetBlockClient:
	{
		posX: DataType.UShort,
		posY: DataType.UShort,
		posZ: DataType.UShort,
		mode: DataType.UByte,
		blockType: DataType.UByte
	},
	// SetBlockServer:
	{
		posX: DataType.UShort,
		posY: DataType.UShort,
		posZ: DataType.UShort,
		blockType: DataType.UByte
	},
	// AddPlayer:
	{
		playerID: DataType.Byte,
		playerName: DataType.String,
		posX: DataType.Fixed,
		posY: DataType.Fixed,
		posZ: DataType.Fixed,
		yaw: DataType.UByte,
		pitch: DataType.UByte
	},
	// PlayerPosition:
	{
		playerID: DataType.UByte,
		posX: DataType.Fixed,
		posY: DataType.Fixed,
		posZ: DataType.Fixed,
		yaw: DataType.UByte,
		pitch: DataType.UByte
	},
	// PlayerMovePosRot:
	{
		playerID: DataType.Byte,
		deltaX: DataType.Byte,
		deltaY: DataType.Byte,
		deltaZ: DataType.Byte,
		deltaYaw: DataType.UByte,
		deltaPitch: DataType.UByte
	},
	// PlayerMovePos:
	{
		playerID: DataType.Byte,
		deltaX: DataType.Byte,
		deltaY: DataType.Byte,
		deltaZ: DataType.Byte,
	},
	// PlayerMoveRot:
	{
		playerID: DataType.Byte,
		deltaYaw: DataType.UByte,
		deltaPitch: DataType.UByte
	},
	// RemovePlayer:
	{
		playerID: DataType.Byte
	},
	// Message:
	{
		messageType: DataType.Byte,
		message: DataType.String
	},
	// DisconnectPlayer:
	{
		reason: DataType.String
	},
	// SetRank:
	{
		rank: DataType.UByte
	},
	// ExtInfo:
	{
		software: DataType.String,
		extensionCount: DataType.UShort
	},
	// ExtEntry:
	{
		extName: DataType.String,
		version: DataType.UInt
	}
]

function definePacketType(id, data)
{
	PacketData[id] = data;
}

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
	
	writeByte(b)
	{
		var buffer = Buffer.alloc(1);
		buffer.writeInt8(b & 0xFF);
		this.chunks.push(buffer);
	}

	readByte()
	{
		return this.buf.readInt8(this.increasePosition(1));
	}

	writeUByte(b)
	{
		var buffer = Buffer.alloc(1);
		buffer.writeUInt8(b & 0xFF);
		this.chunks.push(buffer);
	}

	readUByte()
	{
		return this.buf.readUInt8(this.increasePosition(1));
	}

	writeFixed(f)
	{
		var buffer = Buffer.alloc(2);
		buffer.writeInt16BE(f * 32);
		this.chunks.push(buffer);
	}

	readFixed()
	{
		return this.buf.readInt16BE(this.increasePosition(2)) / 32;
	}

	writeUShort(s)
	{
		var buffer = Buffer.alloc(2);
		buffer.writeUInt16BE(s & 0xFFFF);
		this.chunks.push(buffer);
	}

	readUShort()
	{
		return this.buf.readUInt16BE(this.increasePosition(2));
	}

	writeUInt(i)
	{
		var buffer = Buffer.alloc(4);
		buffer.writeUInt32BE(i & 0xFFFFFFFF);
		this.chunks.push(buffer);
	}

	readUInt()
	{
		return this.buf.readUInt32BE(this.increasePosition(4));
	}

	writeString(string)
	{
		var buffer = Buffer.alloc(64, 0x20);
		var offs = 0;
		for (var i = 0; i < Math.min(string.length, buffer.length); i++)
			offs = buffer.writeUInt8(string.charCodeAt(i), offs);
		this.chunks.push(buffer);
	}

	readString(trim)
	{
		var finalString = "";
		for (var i = 0; i < 64; i++)
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
	const packetID = netStream.readUByte();

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
		switch (value)
		{
			case DataType.Byte:
				if (netStream.checkEndOfStream(1))
					return [PacketError.EndOfStream, packetID];
				packet.data[key] = netStream.readByte();
				break;
			
			case DataType.UByte:
				if (netStream.checkEndOfStream(1))
					return [PacketError.EndOfStream, packetID];
				packet.data[key] = netStream.readUByte();
				break;
			
			case DataType.UInt:
				if (netStream.checkEndOfStream(2))
					return [PacketError.EndOfStream, packetID];
				packet.data[key] = netStream.readUInt();
				break;
			
			case DataType.UShort:
				if (netStream.checkEndOfStream(2))
					return [PacketError.EndOfStream, packetID];
				packet.data[key] = netStream.readUShort();
				break;
			
			case DataType.Fixed:
				if (netStream.checkEndOfStream(2))
					return [PacketError.EndOfStream, packetID];
				packet.data[key] = netStream.readFixed();
				break;
			
			case DataType.String:
			case DataType.UntrimmedString:
				if (netStream.checkEndOfStream(64))
					return [PacketError.EndOfStream, packetID];
				packet.data[key] = netStream.readString(value == DataType.String);
				break;
			
			case DataType.ByteArray:
				if (netStream.checkEndOfStream(1024))
					return [PacketError.EndOfStream, packetID];
				packet.data[key] = netStream.readByteArray();
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

	netStream.writeUByte(packetID);
	for (const [key, value] of Object.entries(packetType))
	{
		if (data[key] == undefined)
			console.error(`Missing ${key} from packet data!`);
		if (value == undefined || value < 0 || value > DataTypeCount)
			console.error(`Invalid data type ${value}!`)
		switch (value)
		{
			case DataType.Byte:
				netStream.writeByte(data[key]);
				break;
			
			case DataType.UByte:
				netStream.writeUByte(data[key]);
				break;
			
			case DataType.UInt:
				netStream.writeUInt(data[key]);
				break;
			
			case DataType.UShort:
				netStream.writeUShort(data[key]);
				break;
			
			case DataType.Fixed:
				netStream.writeFixed(data[key]);
				break;
			
			case DataType.String:
			case DataType.UntrimmedString:
				netStream.writeString(data[key]);
				break;
			
			case DataType.ByteArray:
				netStream.writeByteArray(data[key]);
				break;
		}
	}

	return netStream.getData();
}

module.exports = { DataType, PacketType, PacketError, definePacketType, serializePacket, deserializePacket };

