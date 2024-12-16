// Network helper module for data packets

class NetStream
{
	constructor()
	{
		this.reset();
	}

	reset()
	{
		this.chunks = [];
		this.position = 0;
	}

	newPacket(id)
	{
		this.reset();
		this.writeByte(id);
	}

	increasePosition(by)
	{
		var prevPosition = this.position;
		this.position += by;
		return prevPosition;
	}

	writeString(string)
	{
		if (string.length <= 64)
		{
			var offs = 0;
			var stringBuf = Buffer.alloc(64, 0x20);
			for (var i = 0; i < string.length; i++)
				offs = stringBuf.writeInt8(string.charCodeAt(i), offs);
			this.chunks.push(stringBuf);
		}
	}

	readString(buf)
	{
		var finalString = "";
		for (var i = 0; i < 64; i++)
			finalString += String.fromCharCode(buf.readInt8(this.increasePosition(1)));
		return finalString.trimEnd();
	}

	writeBool(b)
	{
		var buffer = Buffer.alloc(1);
		buffer.writeInt8(b ? 0x01 : 0x00);
		this.chunks.push(buffer);
	}

	readBool(buf)
	{
		return buf.readInt8(this.increasePosition(1)) > 0x00 ? true : false;
	}
	
	writeByte(b)
	{
		var buffer = Buffer.alloc(1);
		buffer.writeInt8(b & 0xFF);
		this.chunks.push(buffer);
	}

	readByte(buf)
	{
		return buf.readInt8(this.increasePosition(1));
	}

	writeUByte(b)
	{
		var buffer = Buffer.alloc(1);
		buffer.writeUInt8(b & 0xFF);
		this.chunks.push(buffer);
	}

	readUByte(buf)
	{
		return buf.readUInt8(this.increasePosition(1));
	}

	writeShort(s)
	{
		var buffer = Buffer.alloc(2);
		buffer.writeInt16BE(s & 0xFFFF);
		this.chunks.push(buffer);
	}

	readShort(buf)
	{
		return buf.readInt16BE(this.increasePosition(2));
	}

	writeUShort(s)
	{
		var buffer = Buffer.alloc(2);
		buffer.writeUInt16BE(s & 0xFFFF);
		this.chunks.push(buffer);
	}

	readUShort(buf)
	{
		return buf.readUInt16BE(this.increasePosition(2));
	}

	writeInt(i)
	{
		var buffer = Buffer.alloc(4);
		buffer.writeInt32BE(i & 0xFFFFFFFF);
		this.chunks.push(buffer);
	}

	readInt(buf)
	{
		return buf.readInt32BE(this.increasePosition(4));
	}

	writeFloat(f)
	{
		var buffer = Buffer.alloc(4);
		buffer.writeFloatBE(f & 0xFFFFFFFF);
		this.chunks.push(buffer);
	}

	readFloat(buf)
	{
		return buf.readFloatBE(this.increasePosition(4));
	}

	writeLong(l)
	{
		var buffer = Buffer.alloc(8);
		buffer.writeBigInt64BE(l);
		this.chunks.push(buffer);
	}

	readLong(buf)
	{
		return buf.readBigInt64BE(this.increasePosition(8));
	}

	writeDouble(d)
	{
		var buffer = Buffer.alloc(8);
		buffer.writeDoubleBE(d);
		this.chunks.push(buffer);
	}

	readDouble(buf)
	{
		return buf.readDoubleBE(this.increasePosition(8));
	}

	write(buffer)
	{
		this.chunks.push(buffer);
	}

	sendPacket(client)
	{
		client.write(Buffer.concat(this.chunks));
	}

	getPosition()
	{
		return this.position;
	}

	setPosition(pos)
	{
		this.position = pos;
	}
}

const DataType = {
	Byte: 0,
	UByte: 1,
	UShort: 2,
	UInt: 3,
	Fixed: 4,
	String: 5,
	ByteArray: 6
}

const PacketError = {
	InvalidID: 0,
	EndOfStream: 1
}

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
		percecntComplete: DataType.UByte
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
		blockType: DataType.UShort
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
		playerID: DataType.Byte,
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
		version: DataType.UInt,
		pad: DataType.UShort
	}
]

class PacketSerializer
{
	constructor()
	{
		this.position = 0;
	}

	serializePacket(dataView)
	{
		if (this.checkEndOfStream(dataView, 1))
			return [PacketError.EndOfStream, null];
		
		const packetID = dataView.getUint8(this.position++);
		const packetType = PacketData[packetID];
		if (packetType == undefined)
			return [PacketError.InvalidID, packetID];

		var packet = {
			id: packetID,
			data: {}
		};
		for (const [key, value] of Object.entries(packetType))
		{
			switch (value)
			{
				case DataType.Byte:
					if (this.checkEndOfStream(dataView, 1))
						return [PacketError.EndOfStream, packetID];
					packet.data[key] = dataView.getInt8(this.position);
					this.position += 1;
					break;
				
				case DataType.UByte:
					if (this.checkEndOfStream(dataView, 1))
						return [PacketError.EndOfStream, packetID];
					packet.data[key] = dataView.getUint8(this.position);
					this.position += 1;
					break;
				
				case DataType.UInt:
					if (this.checkEndOfStream(dataView, 2))
						return [PacketError.EndOfStream, packetID];
					packet.data[key] = dataView.getUint32(this.position);
					this.position += 2;
					break;
				
				case DataType.UShort:
					if (this.checkEndOfStream(dataView, 2))
						return [PacketError.EndOfStream, packetID];
					packet.data[key] = dataView.getUint16(this.position);
					this.position += 2;
					break;
				
				case DataType.Fixed:
					if (this.checkEndOfStream(dataView, 2))
						return [PacketError.EndOfStream, packetID];
					packet.data[key] = this.readFixed(dataView, this.position);
					this.position += 2;
					break;
				
				case DataType.String:
					if (this.checkEndOfStream(dataView, 64))
						return [PacketError.EndOfStream, packetID];
					packet.data[key] = this.readString(dataView, this.position);
					this.position += 64;
					break;
				
				case DataType.ByteArray:
					if (this.checkEndOfStream(dataView, 1024))
						return [PacketError.EndOfStream, packetID];
					packet.data[key] = this.readByteArray(dataView, this.position);
					this.position += 1024;
					break;
			}
			//console.log(`${this.position}, ${dataView.byteLength}`);
		}
		return packet;
	}

	checkEndOfStream(dataView, size)
	{
		return this.position + size > dataView.byteLength;
	}

	readFixed(dataView)
	{
		return 0;
	}

	readString(dataView)
	{
		var finalString = "";
		for (var i = 0; i < 64; i++)
			finalString += String.fromCharCode(dataView.getInt8(this.position + i));
		return finalString.trimEnd();
	}

	readByteArray(dataView)
	{
		var array = new Array(1024);
		for (var i = 0; i < array.length; i++)
			array[i] = dataView.getInt8(this.position + i);
		return array;
	}

	reset()
	{
		this.position = 0;
	}
}

class PacketDeserializer
{
	constructor()
	{
		this.position = 0;
	}

	deserializePacket(packetID, data)
	{
		var packetType = PacketData[packetID];
		var packetSize = 0;
		for (const [key, value] of Object.entries(packetType))
		{

		}
	}
}

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

module.exports = { NetStream, PacketType, PacketError, PacketSerializer };

