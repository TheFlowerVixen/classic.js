// @ts-check

const MaterialType = {
    NonSolid: 0,
    Swimmable: 1,
    Solid: 2,
    PartialSlippery: 3,
    FullSlippery: 4,
    Water: 5,
    Lava: 6,
    Rope: 7
};

const StepSound = {
    None: 0,
    Wood: 1,
    Gravel: 2,
    Grass: 3,
    Stone: 4,
    Metal: 5,
    Glass: 6,
    Wool: 7,
    Sand: 8,
    Snow: 9
};

const DrawLayer = {
    Solid: 0,
    Clip: 1,
    ClipNoCull: 2,
    Blend: 3,
    None: 4
};

const DefaultBlock = {
    // Properties
    id: -1,
    name: "Block",
    solidity: MaterialType.Solid,
    speedModifier: 1.0,
    transparent: false,
    stepSound: StepSound.Stone,
    bounds: [0, 0, 0, 1, 1, 1],
    drawLayer: DrawLayer.Solid,
    fogDensity: 1.0,
    fogColor: [255, 255, 255],
    tickRate: 0,

    // Functions
    update: (level, x, y, z) => { },
    neighborUpdate: (level, x, y, z, size) => { },
    onAdded: (level, x, y, z) => { },
    onRemoved: (level, x, y, z) => { },
    getTextureID: (side) => { return 0; },
};

const Blocks = [
    null,

    // STONE
    {
        id: 1,
        name: "Stone"
    },

    // GRASS
    {
        id: 2,
        name: "Grass",
        stepSound: StepSound.Grass,
        getTextureID: (side) => { return side == 1 ? 0 : (side == 0 ? 2 : 3); }
    },

    // DIRT
    {
        id: 3,
        name: "Dirt",
        stepSound: StepSound.Grass
    },
];

function getBlock(id)
{
    var block = Blocks[id];
    if (block != undefined && block != null)
    {
        var returnBlock = Object.create(DefaultBlock);
        return Object.assign(returnBlock, block);
    }
    return null;
}