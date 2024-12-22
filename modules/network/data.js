const DataType = {
	Byte: 0,
	UByte: 1,
	Short: 2,
	UShort: 3,
	Int: 4,
	UInt: 5,
	Fixed: 6,
	Float: 7,
	Double: 8,
	String: 9,
	UntrimmedString: 10,
	DoubleString: 11,
	DoubleUntrimmedString: 12,
	ByteArray: 13,
	Vector3: 14
}

const DataTypeInfo = {};
DataTypeInfo[DataType.Byte] =
	{ size: 1, 	readFunc: 'readInt8', 		writeFunc: 'writeInt8', 	scaleFactor: 1 };
DataTypeInfo[DataType.UByte] =
	{ size: 1, 	readFunc: 'readUInt8', 		writeFunc: 'writeUInt8', 	scaleFactor: 1 };
DataTypeInfo[DataType.Short] =
	{ size: 2, 	readFunc: 'readInt16BE', 	writeFunc: 'writeInt16BE', 	scaleFactor: 1 };
DataTypeInfo[DataType.UShort] =
	{ size: 2, 	readFunc: 'readUInt16BE', 	writeFunc: 'writeUInt16BE', scaleFactor: 1 };
DataTypeInfo[DataType.Int] =
	{ size: 4, 	readFunc: 'readInt32BE', 	writeFunc: 'writeInt32BE', 	scaleFactor: 1 };
DataTypeInfo[DataType.UInt] =
	{ size: 4, 	readFunc: 'readUInt32BE', 	writeFunc: 'writeUInt32BE', scaleFactor: 1 };
DataTypeInfo[DataType.Fixed] =
	{ size: 2, 	readFunc: 'readInt16BE', 	writeFunc: 'writeInt16BE', 	scaleFactor: 32 };
DataTypeInfo[DataType.Float] =
	{ size: 4, 	readFunc: 'readFloatBE', 	writeFunc: 'writeFloatBE', 	scaleFactor: 1 };
DataTypeInfo[DataType.Double] =
	{ size: 8, 	readFunc: 'readDoubleBE', 	writeFunc: 'writeDoubleBE', scaleFactor: 1 };
DataTypeInfo[DataType.String] =
	{ size: 64, 	readFunc: 'readInt8', 		writeFunc: 'writeInt8', 	scaleFactor: 1 };
DataTypeInfo[DataType.UntrimmedString] =
	{ size: 64, 	readFunc: 'readInt8', 		writeFunc: 'writeInt8', 	scaleFactor: 1 };
DataTypeInfo[DataType.DoubleString] =
	{ size: 128, 	readFunc: 'readInt8', 		writeFunc: 'writeInt8', 	scaleFactor: 1 };
DataTypeInfo[DataType.DoubleUntrimmedString] =
	{ size: 128, 	readFunc: 'readInt8', 		writeFunc: 'writeInt8', 	scaleFactor: 1 };
DataTypeInfo[DataType.ByteArray] =
	{ size: 0, 	readFunc: 'readInt8', 		writeFunc: 'writeInt8', 	scaleFactor: 1};
DataTypeInfo[DataType.Vector3] =
	{ size: 12, 	readFunc: 'readInt8', 		writeFunc: 'writeInt8', 	scaleFactor: 1 };

module.exports = { DataType, DataTypeInfo };