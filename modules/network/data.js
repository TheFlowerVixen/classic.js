const DataType = {
	Byte: 0,
	UByte: 1,
	Short: 2,
	UShort: 3,
	Int: 4,
	UInt: 5,
	Float: 6,
	Double: 7,

	// special types
	String: 100,
	UntrimmedString: 101,
	DoubleString: 102,
	DoubleUntrimmedString: 103,
	ByteArray: 104,
	Coordinate: 105,
	Velocity: 106
}

const DataTypeInfo = {};
DataTypeInfo[DataType.Byte] =
	{ size: 1, 	readFunc: 'readInt8', 		writeFunc: 'writeInt8' };
DataTypeInfo[DataType.UByte] =
	{ size: 1, 	readFunc: 'readUInt8', 		writeFunc: 'writeUInt8' };
DataTypeInfo[DataType.Short] =
	{ size: 2, 	readFunc: 'readInt16BE', 	writeFunc: 'writeInt16BE' };
DataTypeInfo[DataType.UShort] =
	{ size: 2, 	readFunc: 'readUInt16BE', 	writeFunc: 'writeUInt16BE' };
DataTypeInfo[DataType.Int] =
	{ size: 4, 	readFunc: 'readInt32BE', 	writeFunc: 'writeInt32BE' };
DataTypeInfo[DataType.UInt] =
	{ size: 4, 	readFunc: 'readUInt32BE', 	writeFunc: 'writeUInt32BE' };
DataTypeInfo[DataType.Float] =
	{ size: 4, 	readFunc: 'readFloatBE', 	writeFunc: 'writeFloatBE' };
DataTypeInfo[DataType.Double] =
	{ size: 8, 	readFunc: 'readDoubleBE', 	writeFunc: 'writeDoubleBE' };

DataTypeInfo[DataType.Coordinate] =
	{ base: DataType.Short, scaleFactor: 32 };
DataTypeInfo[DataType.Velocity] =
	{ base: DataType.Int, scaleFactor: 10000 };

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
			if (type >= 100)
				return DataTypeInfo[DataTypeInfo[type].base].size;
			else
				return DataTypeInfo[type].size;
	}
}

function getDataTypeScaleFactor(type)
{
	if (type >= 100)
		return DataTypeInfo[type].scaleFactor;
	else
		return 1;
}

function getDataTypeReadFunc(type)
{
	if (type >= 100)
		return getDataTypeReadFunc(DataTypeInfo[type].base);
	else
		return DataTypeInfo[type].readFunc;
}

function getDataTypeWriteFunc(type)
{
	if (type >= 100)
		return getDataTypeWriteFunc(DataTypeInfo[type].base);
	else
		return DataTypeInfo[type].writeFunc;
}

module.exports = { DataType, getDataTypeSize, getDataTypeScaleFactor, getDataTypeReadFunc, getDataTypeWriteFunc };