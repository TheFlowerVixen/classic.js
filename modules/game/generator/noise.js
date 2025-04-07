const LevelGenerator = require('./base.js').LevelGenerator;
const generatePerlinNoise = require('perlin-noise').generatePerlinNoise;

class NoiseLevelGenerator extends LevelGenerator
{
    constructor(seed)
    {
        super(seed);
        this.noise = null;
    }

    preGenerate(level)
    {
        this.noise = generatePerlinNoise(level.sizeX, level.sizeZ);
    }

    getBlock(x, y, z)
    {
    }
}

module.exports = { NoiseLevelGenerator };