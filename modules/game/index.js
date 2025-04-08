const Entity = require('./entity.js').Entity;
const EntityPosition = require('./entity.js').EntityPosition;

const Level = require('./level.js').Level;
const LevelProperties = require('./level.js').LevelProperties;

const LevelGenerator = require('./generator/base.js').LevelGenerator;
const FlatLevelGenerator = require('./generator/flat.js').FlatLevelGenerator;
const NoiseLevelGenerator = require('./generator/noise.js').NoiseLevelGenerator;

module.exports = {
    Entity, EntityPosition,
    Level, LevelProperties,
    LevelGenerator, FlatLevelGenerator, NoiseLevelGenerator
};