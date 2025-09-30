const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder')

function createBot() {
  const bot = mineflayer.createBot({
    host: 'wathever-smp.aternos.me',
    port: 25565,
    username: 'Gayfurrypornbot'
  })

  bot.loadPlugin(pathfinder)

  let lastCheckedTime = 0
  let handlingDoor = false // prevent multiple triggers

  bot.once('spawn', () => {
    console.log('✅ Bot joined and is now AFK.')

    // Set up movements with digging disabled
    const defaultMove = new Movements(bot)
    defaultMove.canDig = false // DISABLE digging
    bot.pathfinder.setMovements(defaultMove)

    // Start the "look at closest player" loop
    lookAtClosestPlayer(bot)
  })

  bot.on('time', () => {
    const time = bot.time.timeOfDay
    if (time >= 12600 && lastCheckedTime < 12600) {
      bot.chat('🌙 Come to bed!')
    }
    lastCheckedTime = time
  })

  bot.on('entitySleep', async (entity) => {
    if (entity.type === 'player' && entity.username !== bot.username) {
      console.log(`😴 ${entity.username} went to sleep! Current time: ${bot.time.timeOfDay}`)
      bot.chat(`Goon night ${entity.username}!`)
      await goToNearestWhiteBed(bot)
    }
  })

  bot.on('wake', () => {
    console.log('☀️ Bot woke up from sleep!')
    bot.chat('goon morning')
  })

  bot.on('whisper', async (username, message) => {
    console.log(`💬 Whisper from ${username}: ${message}`)
    const msg = message.trim().toLowerCase()

    if (msg === '.bot drop') {
      console.log('🗑 Dropping all items...')
      for (const item of bot.inventory.items()) {
        try { await bot.tossStack(item) } catch (err) { console.log(`⚠️ Failed to drop ${item.name}: ${err.message}`) }
      }
      console.log('✅ Finished dropping items.')
    }

    if (msg === '.bot test') {
      console.log('🛏 .bot test command — moving to the nearest white bed!')
      await goToNearestWhiteBed(bot, false)
    }

    if (msg === '.bot door') {
      console.log('🚪 .bot door command — going to the nearest spruce door!')
      await goToNearestSpruceDoor(bot)
    }
  })

  // Watch for door updates
  bot.on('blockUpdate', (oldBlock, newBlock) => {
    if (!newBlock || newBlock.name !== 'spruce_door') return
    const wasOpen = oldBlock ? oldBlock.getProperties().open : undefined
    const isOpen = newBlock.getProperties().open

    // Door just got closed by a player
    if (wasOpen && !isOpen && !handlingDoor) {
      console.log('🚪 Spruce door was closed by a player!')
      handlingDoor = true

      setTimeout(async () => {
        // Re-check the door state after 10 seconds
        const door = bot.findBlock({
          matching: (block) => block && block.name === 'spruce_door',
          maxDistance: 20
        })
        if (!door) {
          console.log('⚠️ No spruce door found nearby after waiting.')
          handlingDoor = false
          return
        }

        const stillClosed = !door.getProperties().open
        if (stillClosed) {
          try {
            await goToNearestSpruceDoor(bot)
            console.log('🛏 Returning to bed after opening the door...')
            await goToNearestWhiteBed(bot, false)
          } catch (err) {
            console.log('⚠️ Failed handling door:', err.message)
          }
        } else {
          console.log('✅ Door was reopened by a player, not opening.')
        }

        handlingDoor = false
      }, 10000) // wait 10 seconds
    }
  })

  bot.on('diggingStarted', (block) => {
    console.log(`⚠️ Bot started breaking a block (${block.name})! Leaving server...`)
    bot.quit('Bot is not allowed to break blocks!')
  })

  bot.on('error', (err) => {
    if (err.name === 'PartialReadError') { console.log('⚠️ PartialReadError received (ignored).'); return }
    console.log('⚠️ Bot error:', err.message)
    setTimeout(createBot, 10000)
  })

  bot.on('end', () => {
    console.log('❌ Bot disconnected. Reconnecting in 10 seconds...')
    setTimeout(createBot, 10000)
  })
}

// Continuously look at the closest player every 0.5 seconds
function lookAtClosestPlayer(bot) {
  setInterval(() => {
    const players = Object.values(bot.players)
      .filter(p => p.entity && p.username !== bot.username)
    if (players.length === 0) return

    let closest = players[0].entity
    let minDist = bot.entity.position.distanceTo(closest.position)

    for (const player of players) {
      const dist = bot.entity.position.distanceTo(player.entity.position)
      if (dist < minDist) {
        closest = player.entity
        minDist = dist
      }
    }

    // Look at the player's eye level (approx 1.62 blocks above feet)
    bot.lookAt(closest.position.offset(0, 1.62, 0))
  }, 500)
}

// Go to nearest bed (optional sleep)
async function goToNearestWhiteBed(bot, sleepInBed = true) {
  const bed = bot.findBlock({
    matching: (block) =>
      block && (block.name === 'white_bed' || block.name === 'white_bed_head'),
    maxDistance: 20
  })

  if (!bed) {
    console.log('⚠️ No white bed found nearby!')
    return
  }

  try {
    await bot.pathfinder.goto(new GoalNear(bed.position.x, bed.position.y, bed.position.z, 1))
    if (sleepInBed) { 
      await bot.sleep(bed); 
      console.log('😴 Bot is now sleeping in the white bed!') 
    } else {
      console.log('🛏 Bot moved to the nearest white bed (did not sleep).')
    }
  } catch (err) {
    console.log('⚠️ Failed to pathfind to bed:', err.message)
  }
}

// Go to nearest spruce door and open it once
async function goToNearestSpruceDoor(bot) {
  const door = bot.findBlock({
    matching: (block) => block && block.name === 'spruce_door',
    maxDistance: 20
  })

  if (!door) {
    console.log('⚠️ No spruce door found nearby!')
    return
  }

  try {
    await bot.pathfinder.goto(new GoalNear(door.position.x, door.position.y, door.position.z, 1))
    console.log('🚪 Bot reached the spruce door!')
    await bot.activateBlock(door) // use activateBlock for doors
    console.log('✅ Bot opened the spruce door!')
    bot.chat(`Close the godammn door next time dumbass`)
  } catch (err) {
    console.log('⚠️ Failed to pathfind or open the spruce door:', err.message)
  }
}

createBot()
