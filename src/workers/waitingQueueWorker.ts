import { redisClient } from '../redisclient';
import mongoose from 'mongoose';
import Bet, { BetDetail } from '../bets/betModel';
import { config } from '../config/config';
import { parentPort } from 'worker_threads';
import Store from '../store/storeController';

async function connectDB() {
  try {
    mongoose.connection.on("connected", async () => {
      console.log("Connected to database successfully");
    });

    mongoose.connection.on("error", (err) => {
      console.log("Error in connecting to database.", err);
    });

    await mongoose.connect(config.databaseUrl as string);
  } catch (err) {
    console.error("Failed to connect to database.", err);
    process.exit(1);
  }
}


export async function checkBetsCommenceTime() {
  const now = new Date().getTime();
  const bets = await redisClient.zrangebyscore('waitingQueue', 0, now);

  for (const bet of bets) {
    const data = JSON.parse(bet);

    const commenceTime = data.commence_time;
    const betId = data.betId;

    if (now >= new Date(commenceTime).getTime()) {
      try {

        const betDetail = await BetDetail.findById(betId).lean();
        const betParent = await Bet.findById(betDetail.key).lean();

        if (!betDetail || !betParent) {
          console.log(`BetDetail or BetParent not found for betId: ${betId}, removing from queue`);

          await redisClient.zrem('waitingQueue', bet);
          continue;
        }

        const multi = redisClient.multi();

        multi.lpush('processingQueue', JSON.stringify(betDetail));
        multi.zrem('waitingQueue', bet)

        await multi.exec();

      } catch (error) {
        console.log(`Error processing bet with ID ${betId}:`, error);

        await redisClient.zrem('waitingQueue', bet);
      }

    }
  }
}

async function getLatestOddsForAllEvents() {
  try {
    // Fetch globalEventRooms data from Redis
    const redisKey = 'globalEventRooms';
    const eventRoomsData = await redisClient.get(redisKey);

    if (!eventRoomsData) {
      console.log("No event rooms data found in Redis.");
      return;
    }


    // Parse the data from Redis into a Map<string, Set<string>>
    const eventRoomsMap = new Map<string, Set<string>>(
      JSON.parse(eventRoomsData, (key, value) => {
        if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
          return new Set(value);
        }
        return value;
      })
    );

    for (const [sportKey, eventIdsSet] of eventRoomsMap.entries()) {
      for (const eventId of eventIdsSet) {
        console.log(eventId, "EVENT ID IN WAITING QUEUE");

        const latestOdds = await Store.getEventOdds(sportKey, eventId);
        const oddsUpdate = {
          eventId,
          latestOdds,
        };

        await redisClient.publish("live-update-odds", JSON.stringify(oddsUpdate));
        console.log(`Published latest odds for event: ${eventId} on channel: live-update-odds`);
      }
    }
  } catch (error) {
    console.error("Error fetching latest odds:", error);
  }
}



async function startWorker() {
  while (true) {
    try {
      await checkBetsCommenceTime();
      await getLatestOddsForAllEvents();
    } catch (error) {
      console.log("Error in Waiting Queue Worker:", error);
    }
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }
}

parentPort.on('message', async (message) => {
  if (message === "start") {
    await connectDB()
    await startWorker();
  }
})