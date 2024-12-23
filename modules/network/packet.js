const DataType = require('./data.js').DataType;

const PacketType = {
    // Vanilla
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
    SetRank: 0x0F,

    // Extended Protocol
    ExtInfo: 0x10,
    ExtEntry: 0x11,

    // Extension ClickDistance
    ClickDistance: 0x12,

    // Extension CustomBlocks
    CustomBlockSupportLevel: 0x13,

    // Extension ExtPlayerList
    ExtAddPlayerName: 0x16,
    ExtRemovePlayerName: 0x18,
    ExtAddEntity2: 0x21,

    // Extension ChangeModel
    ChangeModel: 0x1D,

    // Extension HeldBlock
    HoldThis: 0x14,

    // Extension HackControl
    HackControl: 0x20,

    // Extension EnvWeatherType
    EnvSetWeatherType: 0x1F,
    
    // Extension EnvMapAspect
    SetMapEnvUrl: 0x28,
    SetMapEnvProperty: 0x29,

    // Extension SetHotbar
    SetHotbar: 0x2D
}
const PacketTypeCount = 0x12;

const PacketData = {}
PacketData[PacketType.Handshake] =
{
    protocolVersion: DataType.UByte,
    name: DataType.String,
    extra: DataType.String,
    supportByte: DataType.UByte
};
PacketData[PacketType.ClientPing] =
{};
PacketData[PacketType.LevelInit] =
{};
PacketData[PacketType.LevelChunk] =
{
    chunkLength: DataType.UShort,
    chunkData: DataType.ByteArray,
    percentComplete: DataType.UByte
};
PacketData[PacketType.LevelEnd] =
{
    sizeX: DataType.UShort,
    sizeY: DataType.UShort,
    sizeZ: DataType.UShort
};
PacketData[PacketType.SetBlockClient] =
{
    posX: DataType.UShort,
    posY: DataType.UShort,
    posZ: DataType.UShort,
    mode: DataType.UByte,
    blockType: DataType.UByte
};
PacketData[PacketType.SetBlockServer] =
{
    posX: DataType.UShort,
    posY: DataType.UShort,
    posZ: DataType.UShort,
    blockType: DataType.UByte
};
PacketData[PacketType.AddPlayer] =
{
    playerID: DataType.Byte,
    playerName: DataType.String,
    posX: DataType.Coordinate,
    posY: DataType.Coordinate,
    posZ: DataType.Coordinate,
    yaw: DataType.UByte,
    pitch: DataType.UByte
};
PacketData[PacketType.PlayerPosition] =
{
    playerID: DataType.UByte,
    posX: DataType.Coordinate,
    posY: DataType.Coordinate,
    posZ: DataType.Coordinate,
    yaw: DataType.UByte,
    pitch: DataType.UByte
};
PacketData[PacketType.PosRotUpdate] =
{
    playerID: DataType.Byte,
    deltaX: DataType.Byte,
    deltaY: DataType.Byte,
    deltaZ: DataType.Byte,
    deltaYaw: DataType.UByte,
    deltaPitch: DataType.UByte
};
PacketData[PacketType.PosUpdate] =
{
    playerID: DataType.Byte,
    deltaX: DataType.Byte,
    deltaY: DataType.Byte,
    deltaZ: DataType.Byte,
};
PacketData[PacketType.RotUpdate] =
{
    playerID: DataType.Byte,
    deltaYaw: DataType.UByte,
    deltaPitch: DataType.UByte
};
PacketData[PacketType.RemovePlayer] =
{
    playerID: DataType.Byte
};
PacketData[PacketType.Message] =
{
    messageType: DataType.Byte,
    message: DataType.UntrimmedString
};
PacketData[PacketType.DisconnectPlayer] =
{
    reason: DataType.String
};
PacketData[PacketType.SetRank] =
{
    rank: DataType.UByte
};
PacketData[PacketType.ExtInfo] =
{
    software: DataType.String,
    extensionCount: DataType.UShort
};
PacketData[PacketType.ExtEntry] =
{
    extName: DataType.String,
    version: DataType.UInt
};
PacketData[PacketType.ClickDistance] =
{
    distance: DataType.Coordinate
};
PacketData[PacketType.CustomBlockSupportLevel] =
{
    supportLevel: DataType.UByte
};
PacketData[PacketType.HoldThis] =
{
    blockToHold: DataType.UByte,
    preventChange: DataType.UByte
};
PacketData[PacketType.ExtAddPlayerName] =
{
    nameID: DataType.UShort,
    playerName: DataType.String,
    listName: DataType.String,
    groupName: DataType.String,
    groupRank: DataType.UByte
};
PacketData[PacketType.ExtRemovePlayerName] =
{
    nameID: DataType.UShort
};
PacketData[PacketType.HackControl] =
{
    fly: DataType.UByte,
    noclip: DataType.UByte,
    speed: DataType.UByte,
    spawn: DataType.UByte,
    perspective: DataType.UByte,
    jumpHeight: DataType.Short
};
PacketData[PacketType.ChangeModel] =
{
    entityID: DataType.UByte,
    model: DataType.String
};
PacketData[PacketType.EnvSetWeatherType] =
{
    weather: DataType.UByte
};
PacketData[PacketType.ExtAddEntity2] =
{
    entityID: DataType.UByte,
    inGameName: DataType.String,
    skinName: DataType.String,
    spawnX: DataType.Coordinate,
    spawnY: DataType.Coordinate,
    spawnZ: DataType.Coordinate,
    spawnYaw: DataType.UByte,
    spawnPitch: DataType.UByte
};
PacketData[PacketType.SetMapEnvUrl] =
{
    url: DataType.DoubleString
};
PacketData[PacketType.SetMapEnvProperty] =
{
    propertyID: DataType.UByte,
    propertyValue: DataType.Int
};
PacketData[PacketType.SetHotbar] =
{
    blockID: DataType.UByte,
    index: DataType.UByte,
};

module.exports = { PacketType, PacketData };