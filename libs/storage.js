const { Vec3 } = require('vec3');
const { goals } = require('mineflayer-pathfinder'); // make sure you have this

let chestTable = {};   // chestKey -> { itemName: {count, slot} }
let itemIndex = {};    // itemName -> [chestKey]

let openedChestPositions = new Set();
const validChestNames = ['chest', 'trapped_chest'];

async function goToChestAndOpenOptimized(chestPos, bot, setupMovements) {
  const chestBlock = bot.blockAt(chestPos);
  if (!chestBlock || !validChestNames.includes(chestBlock.name)) return;

  // Skip right-half of double chest
  const state = chestBlock.getProperties();
  if (state.type === 'right') return;

  const chestKey = `${chestBlock.position.x},${chestBlock.position.y},${chestBlock.position.z}`;
  if (openedChestPositions.has(chestKey)) return;

  openedChestPositions.add(chestKey);

  await setupMovements();

  // Move near chest
  await bot.pathfinder.goto(new goals.GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 5));

  // Break block above if blocking
  const blockAbove = bot.blockAt(chestBlock.position.offset(0, 1, 0));
  if (blockAbove && !['air', ...validChestNames, 'slab', 'fence', 'torch', 'glass', 'stairs'].includes(blockAbove.name)) {
    console.log("Breaking blocking block:", blockAbove.name);
    await bot.dig(blockAbove);
    await bot.waitForTicks(5);
  }

  try {
    await bot.lookAt(chestBlock.position.offset(0.5, 1.0, 0.5), { smooth: false });
    const chest = await bot.openChest(chestBlock);
    const items = chest.containerItems();

    chestTable[chestKey] = {};
    for (const item of items) {
      chestTable[chestKey][item.name] = { count: item.count, slot: item.slot };

      if (!itemIndex[item.name]) itemIndex[item.name] = [];
      if (!itemIndex[item.name].includes(chestKey)) itemIndex[item.name].push(chestKey);
    }

    console.log(`Loaded chest: ${chestKey}`);
    chest.close();
  } catch (err) {
    console.error("Failed to open chest:", err);
  }
}

async function loadChestsFromStorageCoords(bot, StorageCoords, setupMovements, homePos) {

  await bot.pathfinder.goto(new goals.GoalBlock(homePos.x, homePos.y, homePos.z));

  if (!StorageCoords || StorageCoords.length < 2) {
    console.log("StorageCoords not properly defined!");
    return;
  }

  const minPos = new Vec3(
    Math.min(StorageCoords[0].x, StorageCoords[1].x),
    Math.min(StorageCoords[0].y, StorageCoords[1].y),
    Math.min(StorageCoords[0].z, StorageCoords[1].z)
  );

  const maxPos = new Vec3(
    Math.max(StorageCoords[0].x, StorageCoords[1].x),
    Math.max(StorageCoords[0].y, StorageCoords[1].y),
    Math.max(StorageCoords[0].z, StorageCoords[1].z)
  );

  await bot.waitForChunksToLoad();

  const chestPositions = [];

  for (let x = minPos.x; x <= maxPos.x; x++) {
    for (let y = minPos.y; y <= maxPos.y; y++) {
      for (let z = minPos.z; z <= maxPos.z; z++) {
        const block = bot.blockAt(new Vec3(x, y, z));
        if (!block || !validChestNames.includes(block.name)) continue;

        const state = block.getProperties();
        if (state?.type === 'right') continue; // Skip right-half of double chest

        chestPositions.push(block.position);
      }
    }
  }

  console.log(`Found ${chestPositions.length} chests in storage area.`);

  for (const pos of chestPositions) {
    await goToChestAndOpenOptimized(pos, bot, setupMovements);
  }

  await bot.pathfinder.goto(new goals.GoalBlock(homePos.x, homePos.y, homePos.z));

  console.log(`Finished loading ${openedChestPositions.size} chests.`);
  openedChestPositions = new Set(); // reset
}

async function searchItemCount(itemName) {
  let total = 0;
  let matchedItems = {};

  for (const chestKey in chestTable) {
    for (const itemKey in chestTable[chestKey]) {
      const item = chestTable[chestKey][itemKey];

      if (itemKey.toLowerCase().includes(itemName.toLowerCase())) {
        total += item.count;

        if (!matchedItems[itemKey]) {
          matchedItems[itemKey] = { count: 0, chests: [] }; // start from 0
        }

        matchedItems[itemKey].count += item.count; // **sum across stacks**
        matchedItems[itemKey].chests.push(chestKey);
      }
    }
  }

  return { total, matchedItems };
}




module.exports = {
  loadChestsFromStorageCoords,
  chestTable,
  itemIndex,
  searchItemCount
};