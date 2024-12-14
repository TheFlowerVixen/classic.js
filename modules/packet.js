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
		this.reset();
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

const PacketType = {
	Login: 0x00,
	ClientPing: 0x01,
	LevelInit: 0x02,
	LevelChunk: 0x03,
	LevelEnd: 0x04,
	SetBlockClient: 0x05,
	SetBlockServer: 0x06,
	AddPlayer: 0x07,
	Teleport: 0x08,
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

module.exports = { NetStream, PacketType };

