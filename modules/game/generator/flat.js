const LevelGenerator = require('./base.js').LevelGenerator;

class FlatLevelGenerator extends LevelGenerator
{
    // Block format: [7, 1], [1, 29], [3, 2], [2, 1]
    constructor(...blocks)
    {
        super(0);
        this.blockMap = [];
        for (var block of blocks)
        {
            for (var i = 0; i < block[1]; i++)
                this.blockMap.push(block[0]);
        }
    }

    getBlock(x, y, z)
    {
        if (this.blockMap[y] != undefined)
            return this.blockMap[y];
        return 0;
    }
}

module.exports = { FlatLevelGenerator };