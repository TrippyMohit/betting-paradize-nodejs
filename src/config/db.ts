import mongoose from "mongoose";
import { config } from "./config";
import { playerBets, users } from "../socket/socket";
import { startWorkers } from "../workers/initWorker";
import { Redis } from "ioredis";
import Store from "../store/storeController";
import Notification from "../notifications/notificationController";
import { agents } from "../utils/utils";

const connectDB = async () => {
  try {
    (async () => {
      try {
        const redisForSub = new Redis(config.redisUrl);
        await redisForSub.subscribe("live-update");
        await redisForSub.subscribe("bet-notifications");
        await redisForSub.subscribe("live-update-odds");
        redisForSub.on("message", async (channel, message) => {
          if (channel === "bet-notifications") {
            try {
              const notificationData = JSON.parse(message);
              const {
                type,
                player,
                agent,
                betId,
                playerMessage,
                agentMessage,
              } = notificationData;

              const playerNotification = await Notification.createNotification(
                "alert",
                { message: playerMessage, betId: betId },
                player._id
              );

              const agentNotification = await Notification.createNotification(
                "alert",
                {
                  message: agentMessage,
                  betId: betId,
                  player: player.username,
                },
                agent
              );

              const playerSocket = users.get(player.username);

              if (playerSocket && playerSocket.socket.connected) {
                playerSocket.sendAlert({
                  type: "NOTIFICATION",
                  payload: playerNotification,
                });
              }

              const agentRes = agents.get(agent)
              // console.log(agentRes, "agentRes");
              if (agentRes) {
                agentRes.write(
                  `data: ${JSON.stringify(agentNotification)}\n\n`
                );
              }
              // console.log(`Notification of type ${type} for bet ID ${betId} processed.`);
            } catch (error) {
              console.error("Error processing notification:", error);
            }
          } else if (channel === "live-update") {
            await Store.updateLiveData();
          }else if(channel === "live-update-odds"){
            
            const oddsUpdate = JSON.parse(message);
            const {eventId, latestOdds } = oddsUpdate;
            const playersToNotify = [];

            // console.log(playerBets, "SET");
            for (const [username, eventIds] of playerBets.entries()) {
              for (const event_id of eventIds) {
                if (event_id === eventId) {
                  const playerSocket = users.get(username);
                  if (playerSocket && playerSocket.socket.connected) {
                    playersToNotify.push(playerSocket);
                  }
                }
              }
            }

            playersToNotify.forEach(playerSocket => {
              playerSocket.sendAlert({
                type: "ODDS_UPDATE",
                payload: { eventId, latestOdds },
              });
            });
            
            // console.log(`Received live update for event: ${eventId}, odds:`, latestOdds);

          }
        });
      } catch (err) {
        console.log(err);
      }
    })();

    mongoose.connection.on("connected", async () => {
      console.log("Connected to database successfully");
    });

    mongoose.connection.on("error", (err) => {
      console.log("Error in connecting to database.", err);
    });

    await mongoose.connect(config.databaseUrl as string);
    startWorkers();
  } catch (err) {
    console.error("Failed to connect to database.", err);
    process.exit(1);
  }
};

export default connectDB;
