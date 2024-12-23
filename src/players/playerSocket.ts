import { Server, Socket } from "socket.io";
import PlayerModel from "./playerModel";
import { IBet, IBetDetail, IBetSlip } from "../bets/betsType";
import mongoose from "mongoose";
import BetController from "../bets/betController";
import Store from "../store/storeController";
import { activeRooms, eventRooms, playerBets } from "../socket/socket";
import { redisClient } from "../redisclient";


export default class Player {
  public userId: mongoose.Types.ObjectId;
  public username: string;
  private credits: number;
  public socket: Socket;
  public currentRoom: string;
  public eventRooms: Map<string, Set<string>>;
  public betSlip: Map<string, IBetSlip>;
  private io: Server;
  private redisGetAsync;
  private redisSetAsync;
  constructor(
    socket: Socket,
    userId: mongoose.Types.ObjectId,
    username: string,
    credits: number,
    io: Server
  ) {
    this.socket = socket;
    this.userId = userId;
    this.username = username;
    this.credits = credits;
    this.io = io;
    this.betSlip = new Map();
    this.initializeHandlers();
    this.initializeRedis();
    this.betHandler();
  }
  private async initializeRedis() {
    try {
      this.redisGetAsync = redisClient.get.bind(redisClient);
      this.redisSetAsync = redisClient.set.bind(redisClient);
    } catch (error) {
      console.error("Redis client connection error:", error);
      this.redisGetAsync = async () => null;
      this.redisSetAsync = async () => null;
    }
  }
  public updateSocket(socket: Socket) {
    this.socket = socket;
    this.initializeHandlers();
    this.betHandler();
  }

  public addBetToSlip(bet: IBetSlip): void {
  
    const betId = bet.id

    if (this.betSlip.has(betId)) {
      // console.log(`Bet with ID ${betId} already exists in the bet slip.`);
      return;
    }
    
    this.betSlip.set(betId, bet);
    eventRooms.set(bet.sport_key, new Set<string>());
    this.joinEventRoom(bet.sport_key, bet.event_id);
    if (!playerBets.has(this.username)) {
      playerBets.set(this.username, new Set<string>());
    }
    playerBets.get(this.username)?.add(bet.event_id);
  
  }

  
  public updateBetAmount(bet: IBetSlip, amount: number): void {
    const betId = this.generateBetId(bet);
    const existingBet = this.betSlip.get(betId);

    if (!existingBet) {
      // console.log(`Bet with ID ${betId} not found in the bet slip.`);
      return
    }

    existingBet.amount = amount;
    // console.log("BET SLIP UPDATED : ", this.betSlip.get(betId));

    this.sendBetSlip();
  }

  public async removeBetFromSlip(betId: string): Promise<void> {
    const bet = this.betSlip?.get(betId);

    if (this.betSlip.has(betId)) {
        this.betSlip.delete(betId);
        const roomKey = `${bet.sport_key}:${bet.event_id}`;
        this.socket.leave(roomKey);

        const playerEvents = playerBets.get(this.username);
        if (playerEvents) {
          playerEvents.delete(bet.event_id);
          if (playerEvents.size === 0) {
            playerBets.delete(this.username);
          }
        }

        const hasRemainingBets = Array.from(this.betSlip.values()).some(
            b => b.sport_key === bet.sport_key && b.event_id === bet.event_id
        );

        if (!hasRemainingBets) {
            const redisKey = "globalEventRooms";
            const eventRoomsData = await this.redisGetAsync(redisKey);
            let eventRoomsMap: Map<string, Set<string>> = eventRoomsData 
                ? new Map<string, Set<string>>(
                    JSON.parse(eventRoomsData, (key, value) => {
                        if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
                            return new Set(value);
                        }
                        return value;
                    })
                )
                : new Map<string, Set<string>>();

            const eventRedisSet = eventRoomsMap.get(bet.sport_key);
            if (eventRedisSet) {
                eventRedisSet.delete(bet.event_id);
                if (eventRedisSet.size === 0) {
                    eventRoomsMap.delete(bet.sport_key);                }
            }

            // Update Redis with the modified eventRooms
            await this.redisSetAsync(redisKey, JSON.stringify(
                Array.from(eventRoomsMap.entries(), ([key, set]) => [
                    key,
                    Array.from(set),
                ])
            ),  "EX", 300);

            // In-memory update (optional, in case you're maintaining another state)
            const eventSet = eventRooms.get(bet.sport_key);
            if (eventSet) {
                eventSet.delete(bet.event_id);
                if (eventSet.size === 0) {
                  eventRooms.delete(bet.sport_key);
                }
            }
        }

        // console.log("BET SLIP REMOVED: ", bet);
        this.sendBetSlip();
    } else {
        this.sendError(`Bet with ID ${betId} not found in the slip.`);
    }
}

  public removeAllBetsFromSlip(): void {
    for (const [betId, bet] of this.betSlip.entries()) {
      const roomKey = `${bet.sport_key}:${bet.event_id}`;
      this.socket.leave(roomKey);
      
      const playerEvents = playerBets.get(this.userId.toString());
      if (playerEvents) {
        playerEvents.delete(bet.event_id);
        if (playerEvents.size === 0) {
          playerBets.delete(this.userId.toString());
        }
      }

      const hasRemainingBets = Array.from(this.betSlip.values()).some(
        b => b.sport_key === bet.sport_key && b.event_id === bet.event_id
      );

      if (!hasRemainingBets) {
        const eventSet = eventRooms.get(bet.sport_key);
        if (eventSet) {
          eventSet.delete(bet.event_id);
          if (eventSet.size === 0) {
            eventRooms.delete(bet.sport_key);
          }
        }
      }

      this.betSlip.clear();
      console.log("All bets removed from bet slip");
      this.sendBetSlip();
    }
  }

  private sendBetSlip(): void {
    const betSlipData = Array.from(this.betSlip.values());
    this.sendAlert({ type: "BET_SLIP", payload: betSlipData }) // Send the bet slip to the client
  }

  private generateBetId(betDetails: IBetSlip): string {
    return `${betDetails.event_id}_${betDetails.bet_on.name}_${betDetails.category}_${betDetails.bet_on.odds}`;
  }

  public async updateBalance(
    type: "credit" | "debit",
    amount: number
  ): Promise<void> {
    try {
      const player = await PlayerModel.findById(this.userId).exec();
      if (player) {
        if (type === "credit") {
          player.credits += amount;
        } else if (type === "debit") {
          player.credits -= amount;
          if (player.credits < 0) {
            player.credits = 0; 
          }
        }
        await player.save();
        this.credits = player.credits;
        this.sendAlert({ credits: this.credits });
      } else {
        console.error(`Player with ID ${this.userId} not found.`);
      }
    } catch (error) {
      console.error(`Error updating balance for player ${this.userId}:`, error);
    }
  }

  public sendMessage(message: any): void {
    try {
      this.socket.emit("message", message);
    } catch (error) {
      console.error(`Error sending message for player ${this.userId}:`, error);
    }
  }

  public sendError(message: string): void {
    try {
      this.socket.emit("error", { message });
    } catch (error) {
      console.error(`Error sending error for player ${this.userId}:`, error);
    }
  }

  public sendAlert(message: any): void {
    try {
      this.socket.emit("alert", { message });
    } catch (error) {
      console.error(`Error sending alert for player ${this.userId}:`, error);
    }
  }

  public sendData(data: any): void {
    try {
      this.socket.emit("data", data);
    } catch (error) {
      console.error(`Error sending data for player ${this.userId}:`, error);
    }
  }

  private initializeHandlers() {
    this.socket.on("data", async (message) => {
      try {
        const res = message as { action: string; payload: any };

        switch (res.action) {
          case "INIT":
            // Fetch initial data from Store
            const sports = await Store.getCategories();
            this.sendData({ type: "CATEGORIES", data: sports });
            break;

          case "CATEGORIES":
            const categoriesData = await Store.getCategories();
            this.sendData({
              type: "CATEGORIES",
              data: categoriesData,
            });
            break;

          case "CATEGORY_SPORTS":
            const categorySportsData = await Store.getCategorySports(
              res.payload
            );
            this.sendData({
              type: "CATEGORY_SPORTS",
              data: categorySportsData,
            });
            break;

          case "EVENTS":
            const eventsData = await Store.getEvents(
              res.payload.sport,
              res.payload.dateFormat
            );
            this.sendData({ type: "EVENTS", data: eventsData });
            break;

          case "SCORES":
            const scoresData = await Store.getScores(
              res.payload.sport,
              res.payload.daysFrom,
              res.payload.dateFormat
            );
            this.sendData({ scores: scoresData });
            break;

          case "ODDS":
            const oddsData = await Store.getOdds(
              res.payload.sport,
              res.payload.markets,
              res.payload.regions,
              this
            );
            this.sendData({ type: "ODDS", data: oddsData });
            this.joinRoom(res.payload.sport);
            break;

          case "SEARCH EVENT":
            const searchEventData = await Store.searchEvent(
              res.payload.sport,
              res.payload.query
            )
            this.sendData({ type: "SEARCH EVENT", data: searchEventData });
            break;

          case "GET event odds":
            const eventOddsData = await Store.getEventOdds(
              res.payload.sport,
              res.payload.eventId,
              res.payload.markets,
              res.payload.regions,
              res.payload.oddsFormat,
              res.payload.dateFormat
            );
            const { bookmakers, ...data } = eventOddsData;
            this.sendData({ type: "GET event odds", data: data });
            this.joinEventRoom(res.payload.sport, res.payload.eventId);
            break;

          case "SPORTS":
            const sportsData = await Store.getSports();
            this.sendData({ sports: sportsData });
            break;

          default:
            console.warn(`Unknown action: ${res.action}`);
            this.sendError(`Unknown action: ${res.action}`);
        }
      } catch (error) {
        console.log(error);
        this.sendError("An error occurred while processing your request.");
      }
    });
  }

  public betHandler() {
    this.socket.on(
      "bet",
      async (
        message: { action: string; payload: any },
        callback: (response: { status: string; message: string }) => void
      ) => {
        try {
          const { action, payload } = message;

          switch (action) {
            case "PLACE":
              try {
                // Check if the payload is an array of bets
                if (
                  Array.isArray(payload.data) &&
                  payload.betType === "single"
                ) {
                  for (const bet of payload.data) {
                    try {
                      const betRes = await BetController.placeBet(
                        this,
                        [bet],
                        bet.amount,
                        payload.betType
                      );
                    } catch (error) {
                      console.error("Error adding bet: ", error);
                      // Send failure acknowledgment to the client for this particular bet
                      callback({
                        status: "error",
                        message: `Failed to place bet: ${bet}.`,
                      });
                      return; // Optionally, stop processing further bets on error
                    }
                  }
                } else {
                  // Handle single bet case (fallback if payload is not an array)
                  const betRes = await BetController.placeBet(
                    this,
                    payload.data,
                    payload.amount,
                    payload.betType
                  );
                  console.log("BET RECEIVED AND PROCESSED: ", payload);
                }
              } catch (error) {
                console.error("Error processing bet array: ", error);
                // Send failure acknowledgment to the client
                callback({ status: "error", message: "Failed to place bet." });
              }
              break;

            case "ADD_TO_BETSLIP":
              try {
                const { data } = payload;
                this.addBetToSlip(data);
                callback({ status: "success", message: `Bet added successfully.` });
              } catch (error) {
                console.error("Error adding bet to bet slip:", error);
                callback({ status: "error", message: "Failed to add bet to bet slip." });
              }
              break;

            case "REMOVE_FROM_BETSLIP":
              let betId: string;
              try {
                betId = payload.betId;
                this.removeBetFromSlip(betId);
                callback({ status: "success", message: `Bet with ID ${betId} removed successfully.` });
              } catch (error) {
                console.error("Error removing bet from bet slip:", error);
                callback({ status: "error", message: `Failed to remove bet with ID ${betId}.` });
              }
              break;

            case "REMOVE_ALL_FROM_BETSLIP":
              try {
                this.removeAllBetsFromSlip();
                callback({ status: "success", message: "All bets removed from the bet slip." });
              } catch (error) {
                console.error("Error removing all bets from bet slip:", error);
                callback({ status: "error", message: "Failed to remove all bets from the bet slip." });
              }
              break;

            case "UPDATE_BET_AMOUNT":
              this.updateBetAmount(payload.bet, payload.amount);
              break;

            default:
              console.log("UNKNOWN ACTION: ", payload);
              // Send error acknowledgment for unknown actions
              callback({ status: "error", message: "Unknown action." });
          }
        } catch (error) {
          console.error("Error processing bet event:", error);
          // Send failure acknowledgment to the client if an exception occurs
          callback({
            status: "error",
            message: "Server error processing the bet.",
          });
        }
      }
    );
  }

  public joinRoom(room: string) {


    if (this.currentRoom) {
      this.socket.leave(this.currentRoom);
      const clients = this.io.sockets.adapter.rooms.get(this.currentRoom);
      console.log(clients, "clients");

      if (!clients || clients.size === 0) {
        activeRooms.delete(this.currentRoom);
        console.log(`Room ${this.currentRoom} removed from activeRooms.`);
      }
    }




    activeRooms.add(room);
    // updateLiveData(activeRooms);
   console.log(activeRooms.values());
   
    this.socket.join(room);
    this.currentRoom = room;

  }

  public async joinEventRoom(sportKey: string, eventId: string) {
      const redisKey = "globalEventRooms";

      const eventRoomsData = await this.redisGetAsync(redisKey);
      let eventRoomsMap: Map<string, Set<string>>;

      if (eventRoomsData) {
          eventRoomsMap = new Map<string, Set<string>>(
              JSON.parse(eventRoomsData, (key, value) => {
                  if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
                      return new Set(value);
                  }
                  return value;
              })
          );
      } else {
          eventRoomsMap = new Map<string, Set<string>>();
      }

      if (!eventRoomsMap.has(sportKey)) {
          eventRoomsMap.set(sportKey, new Set<string>());
      }

      const eventRedisSet = eventRoomsMap.get(sportKey);
      eventRedisSet?.add(eventId);

      const serializedMap = JSON.stringify(
          Array.from(eventRoomsMap.entries(), ([key, set]) => [
              key,
              Array.from(set),
          ])
      );

      await this.redisSetAsync(redisKey, serializedMap, "EX", 300); 

    if (!eventRooms.has(sportKey)) {
      eventRooms.set(sportKey, new Set<string>())
    }

    // Retrieve the Set of event IDs for the sportKey
    const eventSet = eventRooms.get(sportKey);
    eventSet?.add(eventId);

    this.socket.join(`${sportKey}:${eventId}`);
    this.currentRoom = `${sportKey}:${eventId}`;

    // console.log(`Joined room: ${this.currentRoom}`);
  }
}

