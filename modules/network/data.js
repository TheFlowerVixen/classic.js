// @ts-check

const DataType = {
	// basic types
	Byte: 0,
	UByte: 1,
	Short: 2,
	UShort: 3,
	Int: 4,
	UInt: 5,
	Float: 6,
	Double: 7,
	ByteArray: 8,
	String: 9,
	UntrimmedString: 10,
	DoubleString: 11,
	DoubleUntrimmedString: 12,

	// scaled types
	Coordinate: 50,
	Velocity: 51,
	Angle: 52,
	Angle2: 53,

	// struct types
	Vector3: 100,
	UVCoords: 101,
	AnimData: 102
}

const DataTypeBasic = {};
DataTypeBasic[DataType.Byte] = { size: 1, readFunc: 'readInt8', writeFunc: 'writeInt8', minValue: -128, maxValue: 127 };
DataTypeBasic[DataType.UByte] = { size: 1, readFunc: 'readUInt8', writeFunc: 'writeUInt8', minValue: 0, maxValue: 255 };
DataTypeBasic[DataType.Short] = { size: 2, readFunc: 'readInt16BE', writeFunc: 'writeInt16BE', minValue: -32768, maxValue: 32767 };
DataTypeBasic[DataType.UShort] = { size: 2, readFunc: 'readUInt16BE', writeFunc: 'writeUInt16BE', minValue: 0, maxValue: 65535 };
DataTypeBasic[DataType.Int] = { size: 4, readFunc: 'readInt32BE', writeFunc: 'writeInt32BE', minValue: -2147483648, maxValue: 2147483647 };
DataTypeBasic[DataType.UInt] = { size: 4, readFunc: 'readUInt32BE', writeFunc: 'writeUInt32BE', minValue: 0, maxValue: 2147483647 };
DataTypeBasic[DataType.Float] = { size: 4, readFunc: 'readFloatBE', writeFunc: 'writeFloatBE', minValue: Number.MIN_VALUE / 2, maxValue: Number.MAX_VALUE / 2 };
DataTypeBasic[DataType.Double] = { size: 8, readFunc: 'readDoubleBE', writeFunc: 'writeDoubleBE', minValue: Number.MIN_VALUE, maxValue: Number.MAX_VALUE };

const DataTypeScaled = {};
DataTypeScaled[DataType.Coordinate] = { base: DataType.Short, scale: 32 };
DataTypeScaled[DataType.Velocity] = { base: DataType.Int, scale: 10000 };
DataTypeScaled[DataType.Angle] = { base: DataType.UByte, scale: 360 / 256 };
DataTypeScaled[DataType.Angle2] = { base: DataType.UShort, scale: 360 / 256 };

const DataTypeStruct = {};
DataTypeStruct[DataType.Vector3] =
{
	x: DataType.Float,
	y: DataType.Float,
	z: DataType.Float 
}
DataTypeStruct[DataType.UVCoords] =
{
	u1: DataType.UShort,
	v1: DataType.UShort,
	u2: DataType.UShort,
	v2: DataType.UShort
};
DataTypeStruct[DataType.AnimData] =
{
	flags: DataType.UByte,
	a: DataType.Float,
	b: DataType.Float,
	c: DataType.Float,
	d: DataType.Float
};

function getDataTypeReadFunc(type)
{
	if (type >= 50 && type < 100)
		return DataTypeBasic[DataTypeScaled[type].base].readFunc;
	return DataTypeBasic[type].readFunc;
}

function getDataTypeWriteFunc(type)
{
	if (type >= 50 && type < 100)
		return DataTypeBasic[DataTypeScaled[type].base].writeFunc;
	return DataTypeBasic[type].writeFunc;
}

function getDataTypeMinValue(type)
{
	if (type >= 50 && type < 100)
		return DataTypeBasic[DataTypeScaled[type].base].minValue;
	return DataTypeBasic[type].minValue;
}

function getDataTypeMaxValue(type)
{
	if (type >= 50 && type < 100)
		return DataTypeBasic[DataTypeScaled[type].base].maxValue;
	return DataTypeBasic[type].maxValue;
}

function getDataTypeSize(type)
{
	switch (type)
	{
		case DataType.String:
		case DataType.UntrimmedString:
			return 64;
		
		case DataType.DoubleString:
		case DataType.DoubleUntrimmedString:
			return 128;
		
		default:
			if (type >= 50 && type < 100)
				return DataTypeBasic[DataTypeScaled[type].base].size;
			if (type >= 100)
			{
				var size = 0;
				for (const value in Object.values(DataTypeStruct[type]))
					size += getDataTypeSize(value);
				return size;
			}
			return DataTypeBasic[type].size;
	}
}

function getDataTypeScaleFactor(type)
{
	if (type >= 50 && type < 100)
		return DataTypeScaled[type].scale;
	else
		return 1;
}

function writeDataType(type, value, netStream)
{
	switch (type)
	{
		case DataType.String:
		case DataType.UntrimmedString:
		case DataType.DoubleString:
		case DataType.DoubleUntrimmedString:
			var i = (type - DataType.String);
			var length = Math.floor(i / 2) == 1 ? 128 : 64;
			netStream.writeString(value, length);
			break;
		
		case DataType.ByteArray:
			netStream.writeByteArray(value);
			break;
		
		default:
			netStream.writeData(type, value);
			break;
	}
}

function readDataType(type, netStream)
{
	switch (type)
	{
		case DataType.String:
		case DataType.UntrimmedString:
		case DataType.DoubleString:
		case DataType.DoubleUntrimmedString:
			var i = (type - DataType.String);
			var trim = i % 2 == 0;
			var length = Math.floor(i / 2) == 1 ? 128 : 64;
			return netStream.readString(trim, length);
		
		case DataType.ByteArray:
			return netStream.readByteArray();
		
		default:
			return netStream.readData(type);
	}
}

module.exports = { DataType, DataTypeBasic, DataTypeStruct, getDataTypeReadFunc, getDataTypeWriteFunc, getDataTypeSize, getDataTypeScaleFactor, getDataTypeMinValue, getDataTypeMaxValue, writeDataType, readDataType };
