// @ts-check

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

    // Extension BlockPermissions
    SetBlockPermission: 0x1C,

    // Extension ChangeModel
    ChangeModel: 0x1D,

    // Extension HeldBlock
    HoldThis: 0x14,

    // Extension HackControl
    HackControl: 0x20,

    // Extension PlayerClick
    PlayerClicked: 0x22,

    // Extension EnvWeatherType
    EnvSetWeatherType: 0x1F,
    
    // Extension EnvMapAspect
    SetMapEnvUrl: 0x28,
    SetMapEnvProperty: 0x29,

    // Extension SetHotbar
    SetHotbar: 0x2D,

    // Extension CMV2
    DefineModel: 0x32,
    DefineModelPart: 0x33,
    UndefineModel: 0x34
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
    playerID: DataType.UByte,
    playerName: DataType.String,
    posX: DataType.Coordinate,
    posY: DataType.Coordinate,
    posZ: DataType.Coordinate,
    yaw: DataType.Angle,
    pitch: DataType.Angle
};
PacketData[PacketType.PlayerPosition] =
{
    playerID: DataType.UByte,
    posX: DataType.Coordinate,
    posY: DataType.Coordinate,
    posZ: DataType.Coordinate,
    yaw: DataType.Angle,
    pitch: DataType.Angle
};
PacketData[PacketType.PosRotUpdate] =
{
    playerID: DataType.Byte,
    deltaX: DataType.Byte,
    deltaY: DataType.Byte,
    deltaZ: DataType.Byte,
    deltaYaw: DataType.Angle,
    deltaPitch: DataType.Angle
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
    deltaYaw: DataType.Angle,
    deltaPitch: DataType.Angle
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
PacketData[PacketType.PlayerClicked] =
{
    button: DataType.UByte,
    action: DataType.UByte,
    yaw: DataType.Angle2,
    pitch: DataType.Angle2,
    targetEntity: DataType.Byte,
    targetBlockX: DataType.UShort,
    targetBlockY: DataType.UShort,
    targetBlockZ: DataType.UShort,
    targetBlockFace: DataType.UByte
};
PacketData[PacketType.SetBlockPermission] =
{
    blockType: DataType.UByte,
    allowPlace: DataType.UByte,
    allowBreak: DataType.UByte
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
    spawnYaw: DataType.Angle,
    spawnPitch: DataType.Angle
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

PacketData[PacketType.DefineModel] =
{
    modelID: DataType.UByte,
    name: DataType.String,
    flags: DataType.UByte,
    nameY: DataType.Float,
    eyeY: DataType.Float,
    collisionSize: DataType.Vector3,
    pickBoundsMin: DataType.Vector3,
    pickBoundsMax: DataType.Vector3,
    uScale: DataType.UShort,
    vScale: DataType.UShort,
    partCount: DataType.UByte
};
PacketData[PacketType.DefineModelPart] =
{
    modelID: DataType.UByte,
    minCoords: DataType.Vector3,
    maxCoords: DataType.Vector3,
    topUV: DataType.UVCoords,
    bottomUV: DataType.UVCoords,
    frontUV: DataType.UVCoords,
    backUV: DataType.UVCoords,
    leftUV: DataType.UVCoords,
    rightUV: DataType.UVCoords,
    origin: DataType.Vector3,
    angles: DataType.Vector3,
    anim1: DataType.AnimData,
    anim2: DataType.AnimData,
    anim3: DataType.AnimData,
    anim4: DataType.Vector3,
    flags: DataType.UByte
};
PacketData[PacketType.UndefineModel] =
{
    modelID: DataType.UByte
};


module.exports = { PacketType, PacketData };