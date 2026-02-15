const { Vec3 } = require('vec3');

async function withdrawItem(bot, itemName, amountNeeded, chestTable, itemIndex, goals) {
  if (!itemIndex[itemName] || itemIndex[itemName].length === 0) {
    console.log(`Item "${itemName}" not found in any chest.`);
    return;
  }

  let remaining = amountNeeded;

  const chestsSorted = itemIndex[itemName]
    .map(key => {
      const [x, y, z] = key.split(',').map(Number);
      const dist = bot.entity.position.distanceTo(new Vec3(x, y, z));
      return { key, dist };
    })
    .sort((a, b) => a.dist - b.dist)
    .map(c => c.key);

  for (const chestKey of chestsSorted) {
    if (remaining <= 0) break;

    const [x, y, z] = chestKey.split(',').map(Number);
    const chestBlock = bot.blockAt(new Vec3(x, y, z));
    if (!chestBlock) continue;

    try {
      await bot.pathfinder.goto(new goals.GoalNear(x, y, z, 5));
      const chest = await bot.openChest(chestBlock);
      const chestItems = chest.containerItems()?.filter(i => i.name === itemName) || [];

      for (const item of chestItems) {
        const takeAmount = Math.min(item.count, remaining);
        await chest.withdraw(item.type, item.metadata, takeAmount);
        remaining -= takeAmount;

        // Update chestTable
        if (chestTable[chestKey]?.[itemName]) {
          chestTable[chestKey][itemName].count -= takeAmount;
          if (chestTable[chestKey][itemName].count <= 0) {
            delete chestTable[chestKey][itemName];
            const index = itemIndex[itemName].indexOf(chestKey);
            if (index !== -1) itemIndex[itemName].splice(index, 1);
          }
        }
      }
      chest.close();
    } catch (err) {
      console.log("Withdraw error:", err);
    }
  }

  if (remaining > 0) console.log(`Missing ${remaining} of "${itemName}".`);
}

async function depositAll(bot, chestTable, itemIndex, goals) {
  const inventoryItems = bot.inventory.items();
  if (!inventoryItems.length) return;

  const chestKeys = Object.keys(chestTable);
  if (!chestKeys.length) return;

  for (const item of inventoryItems) {
    let remaining = item.count;

    while (remaining > 0) {
      const chestKey = chestKeys[Math.floor(Math.random() * chestKeys.length)];
      const [x, y, z] = chestKey.split(',').map(Number);
      const chestBlock = bot.blockAt(new Vec3(x, y, z));
      if (!chestBlock) break;

      try {
        await bot.pathfinder.goto(new goals.GoalNear(x, y, z, 5));
        const chest = await bot.openChest(chestBlock);
        const depositAmount = Math.min(remaining, 64);
        await chest.deposit(item.type, item.metadata, depositAmount);
        remaining -= depositAmount;

        // Update chestTable
        if (!chestTable[chestKey][item.name]) chestTable[chestKey][item.name] = { count: 0, slot: null };
        chestTable[chestKey][item.name].count += depositAmount;

        if (!itemIndex[item.name]) itemIndex[item.name] = [];
        if (!itemIndex[item.name].includes(chestKey)) itemIndex[item.name].push(chestKey);

        chest.close();
        console.log('Deposit complete.')
      } catch (err) {
        console.log("Deposit error:", err);
      }
    }
  }
}

async function deliverToPlayer(bot, username, itemName, amount, goals) {
  const player = bot.players[username]?.entity;
  if (!player) {
    console.log("Player not found, depositing inventory instead.");
    await depositAll();
    return;
  }

  await bot.pathfinder.goto(new goals.GoalNear(player.position.x, player.position.y, player.position.z, 4));
  console.log("Reached player:", username);
  await bot.lookAt(player.position, { smooth: false });
  await bot.waitForTicks(5);

  let remaining = amount;

  while (remaining > 0) {
    const item = bot.inventory.items().find(i => i.name === itemName);
    if (!item) {
      console.log("No more items in inventory.");
      break;
    }

    const tossAmount = Math.min(item.count, remaining);
    await bot.toss(item.type, null, tossAmount);
    remaining -= tossAmount;

    // --- Update chestTable & itemIndex --- 
    // Since items are removed from inventory, they are effectively gone from the bot
    // No chestTable updates needed unless tracking inventory separately
  }

  if (remaining === 0) console.log("Delivery complete.");
  else console.log(`Missing ${remaining} items.`);
}

module.exports = {
  withdrawItem,
  depositAll,
  deliverToPlayer
};