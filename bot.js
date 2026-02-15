// bot.js
const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const readline = require('readline');

// ----------------- Web Interface -----------------
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static('public'));
server.listen(3000, () => console.log('Web interface running on http://localhost:3000'));
// ----------------- Config --------------------

const config = require('./config.json')

// ----------------- Bot Setup -----------------
const bot = mineflayer.createBot({
  host: config.host,
  port: config.port,
  username: config.username,
  auth: config.auth,
  version: config.version
});

bot.loadPlugin(pathfinder);
const mcData = require('minecraft-data')(bot.version);

// ----------------- Home & Storage -----------------
const homePos = new Vec3(config.homePos.x, config.homePos.y, config.homePos.z);
const StorageCoords = config.StorageCorners

// ----------------- Module References -----------------
// Keep these variables for hot-reload
let pathfinderModule = require('./libs/pathfinder.js');
let inventoryModule = require('./libs/inventory.js');
let storageModule = require('./libs/storage.js');

// ----------------- Hot Reload Function -----------------
async function ReloadModules() {
  Object.keys(require.cache).forEach(key => {
    if (key.includes('/libs/')) delete require.cache[key];
  });

  pathfinderModule = require('./libs/pathfinder.js');
  inventoryModule = require('./libs/inventory.js');
  storageModule = require('./libs/storage.js');

  console.log('Modules reloaded!');
}

// ----------------- Bot Spawn -----------------
bot.once('spawn', async () => {
  console.log('Bot spawned!');
  await bot.waitForTicks(60);

  // Setup pathfinding
  await pathfinderModule.setupMovements(bot, mcData);

  // Load storage chests
  await storageModule.loadChestsFromStorageCoords(bot, StorageCoords, pathfinderModule.setupMovements, homePos);

  console.log('Ready to work!');
});

// ----------------- Terminal Commands -----------------
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', async (line) => {
  const [command, itemName, amountStr] = line.trim().split(/\s+/);
  const amount = parseInt(amountStr);

  if (command === 'get' && itemName && !isNaN(amount)) {
    await withdraw(itemName, amount);
  } else if (command === 'deposit') {
    await deposit();
  } else if (command === 'load') {
    await reload();
  } else if (command === 'reloadModules') {
    await ReloadModules();
  } else if (command === 'search' && itemName) {
    await storageModule.searchItemCount(itemName);
  } else {
    console.log('Unknown command');
  }
});

// ----------------- Bot Actions -----------------
async function deposit() {
  await inventoryModule.depositAll(bot, storageModule.chestTable, storageModule.itemIndex, pathfinderModule.goals);
  await bot.pathfinder.goto(pathfinderModule.goalBlock(homePos.x, homePos.y, homePos.z));
}

async function withdraw(itemName, amount) {
  await inventoryModule.withdrawItem(bot, itemName, amount, storageModule.chestTable, storageModule.itemIndex, pathfinderModule.goals);
  await inventoryModule.deliverToPlayer(bot, config['bot.owner'], itemName, amount, pathfinderModule.goals);
  await bot.pathfinder.goto(pathfinderModule.goalBlock(homePos.x, homePos.y, homePos.z));
}

async function reload() {
  await bot.pathfinder.goto(pathfinderModule.goalBlock(homePos.x, homePos.y, homePos.z));
  await storageModule.loadChestsFromStorageCoords(bot, StorageCoords, pathfinderModule.setupMovements, homePos);
  await bot.pathfinder.goto(pathfinderModule.goalBlock(homePos.x, homePos.y, homePos.z));
}

// ----------------- Socket.io -----------------
// ----------------- Socket.io -----------------
io.on('connection', (socket) => {
  console.log('Web client connected');

  socket.on('getStorage', () => {
    const data = {};
    let totalCount = 0;

    for (const chestKey in storageModule.chestTable) {
      for (const itemName in storageModule.chestTable[chestKey]) {
        const item = storageModule.chestTable[chestKey][itemName];
        if (!data[itemName]) data[itemName] = { count: 0, chests: [], enchants: '' };
        data[itemName].count += item.count;
        totalCount += item.count;
        if (!data[itemName].chests.includes(chestKey)) data[itemName].chests.push(chestKey);
      }
    }

    socket.emit('storageUpdate', { total: totalCount, matchedItems: data });
  });

  socket.on('search', async (itemName) => {
    let { total, matchedItems } = await storageModule.searchItemCount(itemName);
    socket.emit('storageUpdate', { total, matchedItems });
  });

  socket.on('withdraw', async ({ name, amount }) => {
    await withdraw(name, amount);
    socket.emit('getStorage');
  });

  socket.on('deposit', async () => {
    await deposit();
    socket.emit('getStorage');
  });

  socket.on('reload', async () => {
    await reload();
    socket.emit('getStorage');
  });

  socket.on('ReloadModules', async () => {
    await ReloadModules();
  });
});

bot.on('kicked', console.log);
bot.on('error', console.log);
