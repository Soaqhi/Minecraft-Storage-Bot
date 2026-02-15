const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');

let defaultMovements;

function setupMovements(bot, mcData) {
  if (defaultMovements) return defaultMovements;

  defaultMovements = new Movements(bot, mcData);
  defaultMovements.canOpenDoors = true;
  defaultMovements.allowPlace = true;
  defaultMovements.scafoldingBlocks = [
    bot.registry.blocksByName.dirt.id,
    bot.registry.blocksByName.cobblestone.id,
    bot.registry.blocksByName.stone.id
  ];

  bot.pathfinder.setMovements(defaultMovements);

  return defaultMovements;
}

function goalNear(x, y, z, range = 1) {
  return new goals.GoalNear(x, y, z, range);
}

function goalBlock(x, y, z) {
  return new goals.GoalBlock(x, y, z);
}

function getPlayerEyes(player) {
  const pos = player.position;
  return new Vec3(pos.x, pos.y + player.height, pos.z);
}

module.exports = {
  setupMovements,
  goalNear,
  goalBlock,
  getPlayerEyes,
  goals
};