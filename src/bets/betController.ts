import Bet, { BetDetail } from "./betModel";
import { IBetDetail } from "./betsType";
import createHttpError from "http-errors";
import { NextFunction, Request, Response } from "express";
import { AuthRequest } from "../utils/utils";
import mongoose from "mongoose";
import PlayerModel from "../players/playerModel";
import Player from "../players/playerSocket";
import Store from "../store/storeController";
import { users } from "../socket/socket";
import User from "../users/userModel";
import { config } from "../config/config";
import { redisClient } from "../redisclient";

import { removeFromWaitingQueue } from "../utils/WaitingQueue";
import { checkIfBetIsInProcessingQueue, removeItem } from "../utils/ProcessingQueue";

class BetController {
  private redisGetAsync;
  private redisSetAsync;

  constructor() {
    this.initializeRedis();
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

  public async placeBet(
    playerRef: Player,
    betDetails: IBetDetail[],
    amount: number,
    betType: "single" | "combo"
  ) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      // console.log(betDetails, "BET DETAILS");
      // return;

      // const tempBetId = betDetailIds.id


      // Check if the player is connected to the socket
      const playerSocket = users.get(playerRef.username);
      if (!playerSocket) {
        throw new Error(
          "Player must be connected to the socket to place a bet"
        );
      }

      // Find the player by ID and ensure they exist
      const player = await PlayerModel.findById(playerRef.userId).session(
        session
      );

      if (!player) {
        console.log("Player not found");
        throw new Error("Player not found");
      }

      // Ensure the player has enough credits to place the bet
      if (player.credits < amount) {
        throw new Error("Insufficient credits");
      }
      if (amount === 0) {
        throw new Error("Betting amount can't be zero");
      }


      //   for (const betDetailData of betDetails) {
      //     const cacheKey = `eventOdds:${betDetailData.sport_key}:${betDetailData.event_id}:${betDetailData.category}`;
          
      //     let cachedOddsData:any = await redisClient.get(cacheKey);
          
      //     // Fetch new odds and set cache if no cached data found
      //     if (!cachedOddsData) {
      //       const oddsData = await Store.getEventOdds(
      //         betDetailData.sport_key,
      //         betDetailData.event_id,
      //         betDetailData.category,
      //         'us',
      //         'decimal',
      //         'iso'
      //       );
            
      //       cachedOddsData = JSON.stringify(oddsData);
            
      //       // Set cache with expiration time reduced to 3 seconds
      //       await redisClient.set(cacheKey, cachedOddsData, 'EX', 3);
      //     }
        
      //     cachedOddsData = JSON.parse(cachedOddsData);
      //     let cachedEvent = null;
        
      //     if (Array.isArray(cachedOddsData)) {
      //       cachedEvent = cachedOddsData.find(event => event.id === betDetailData.event_id);
      //     } else if (cachedOddsData && cachedOddsData.id === betDetailData.event_id) {
      //       cachedEvent = cachedOddsData;
      //     }
          
      //     if (!cachedEvent) {
      //       throw new Error(`Event with ID ${betDetailData.event_id} not found in cached data.`);
      //     }
        
      //     const cachedBookmaker = cachedEvent.bookmakers.find(bookmaker => bookmaker.key === betDetailData.bookmaker);
        
      //     if (!cachedBookmaker) {
      //       throw new Error(`Bookmaker ${betDetailData.bookmaker} not found for event`);
      //     }
        
      //     const cachedMarket = cachedBookmaker.markets.find(market => market.key === betDetailData.category);
        
      //     if (!cachedMarket) {
      //       throw new Error("Market not found in cached data");
      //     }
        
      //     const cachedOutcome = cachedMarket.outcomes.find(outcome => outcome.name === betDetailData.bet_on.name);
        
      //     if (!cachedOutcome) {
      //       throw new Error(`Outcome for ${betDetailData.bet_on.name} not found in cached data`);
      //     }
          
      //     console.log(cachedOutcome.price, betDetailData.bet_on.odds, "cache ODDS");
        
      //     // Compare cached odds with submitted odds
      //     if (cachedOutcome.price !== betDetailData.bet_on.odds) {
      //       // Fetch fresh odds before error if mismatch is found
      //       const freshOddsData = await Store.getEventOdds(
      //         betDetailData.sport_key,
      //         betDetailData.event_id,
      //         betDetailData.category,
      //         'us',
      //         'decimal',
      //         'iso'
      //       );
      //       const freshMarket = freshOddsData.bookmakers.find(bookmaker => bookmaker.key === betDetailData.bookmaker)
      //                                ?.markets.find(market => market.key === betDetailData.category);
      
      //       const freshOutcome = freshMarket?.outcomes.find(outcome => outcome.name === betDetailData.bet_on.name);
            
      //       if (freshOutcome && freshOutcome.price === betDetailData.bet_on.odds) {
      //         // Update cache with fresh data to avoid errors in future bets
      //         await redisClient.set(cacheKey, JSON.stringify(freshOddsData), 'EX', 3);
      //       } else {
      //         playerSocket.sendData({
      //           type: "ODDS_MISMATCH",
      //           message: `Odds for ${betDetailData.bet_on.name} have changed. Please refresh and try again.`
      //         });
      //         throw new Error(`Odds for ${betDetailData.bet_on.name} have changed.`);
      //       }
      //     }
      // }
      

      for (const betDetailData of betDetails) {
        const existingBetDetails = await BetDetail.find({
          event_id: betDetailData.event_id,
          status: "pending",
          category: betDetailData.category,
        }).session(session);

        if (existingBetDetails.length > 0) {
          for (const data of existingBetDetails) {
            const bet = await Bet.findById(data.key).session(session);
            if (!bet) {
              throw new Error("Something went wrong");
            }
            const betPlayer = await PlayerModel.findById(bet.player).session(
              session
            );

          }
        }
      }

      // Deduct the bet amount from the player's credits
      player.credits -= amount;
      await player.save({ session });
      playerSocket.sendData({ type: "CREDITS", credits: player.credits });

      const betId = new mongoose.Types.ObjectId();
      const betDetailIds: mongoose.Types.ObjectId[] = [];
      let cumulativeOdds = 1;

      for (const betDetailData of betDetails) {
        const tempBetId = betDetailData.id;

        const selectedOdds = betDetailData.bet_on.odds;
        cumulativeOdds *= selectedOdds;

        const betDetail = new BetDetail({
          ...betDetailData,
          key: betId,
          status: "pending",
        });

        await betDetail.save({ session });
        betDetailIds.push(betDetail._id);
        playerSocket.sendAlert({ type: "BET_PLACED", payload: { betId: tempBetId } });
        playerSocket.removeBetFromSlip(tempBetId);
        await this.scheduleBetDetailJob(betDetail);
      }

      const possibleWinningAmount = cumulativeOdds * amount;

      // Create the Bet document with the manually generated _id
      const bet = new Bet({
        _id: betId,
        player: player._id,
        data: betDetailIds,
        amount,
        possibleWinningAmount,
        status: "pending",
        retryCount: 0,
        betType,
      });
      await bet.save({ session });
          const playerBets = await Bet.find({
        player: player._id,
      })
        .session(session)
        .populate("player", "username _id")
        .populate({
          path: "data",
          populate: {
            path: "key",
            select: "event_id sport_title commence_time status",
          },
        });

      playerSocket.sendData({ type: "MYBETS", bets: playerBets });

      const selectedTeamName = betDetails[0].bet_on.name;
      const selectedOdds = betDetails[0].bet_on.odds;

      let playerResponseMessage;
      let agentResponseMessage;

      if (betType === "single") {
        playerResponseMessage = `Placed a bet on ${selectedTeamName} with odds of ${selectedOdds}. Bet amount: $${amount}.`;
        agentResponseMessage = `Player ${player.username} placed a bet of $${amount} on ${selectedTeamName} with odds of ${selectedOdds}. `;
      } else {
        playerResponseMessage = `Combo bet placed successfully!. Bet Amount: $${amount}`;
        agentResponseMessage = `Player ${player.username} placed a combo bet of $${amount}.`;
      }

      redisClient.publish(
        "bet-notifications",
        JSON.stringify({
          type: "BET_PLACED",
          player: {
            _id: player._id.toString(),
            username: player.username,
          },
          agent: player.createdBy.toString(),
          betId: bet._id.toString(),
          playerMessage: playerResponseMessage,
          agentMessage: agentResponseMessage,
        })
      );



      // Commit the transaction
      await session.commitTransaction();
      session.endSession();

      return bet;
    } catch (error) {
      // Rollback the transaction in case of error
      await session.abortTransaction();
      session.endSession();
      console.error("Error placing bet:", error);
      playerRef.sendError(error.message);
    }
  }

  private async scheduleBetDetailJob(betDetail: IBetDetail) {
    const commence_time = new Date(betDetail.commence_time);
    const delay = commence_time.getTime() - Date.now();

    try {
      const timestamp = commence_time.getTime() / 1000;
      const data = {
        betId: betDetail._id.toString(),
        commence_time: new Date(betDetail.commence_time),
      };

      await redisClient.zadd(
        "waitingQueue",
        timestamp.toString(),
        JSON.stringify(data)
      );

      console.log(
        `BetDetail ${betDetail._id.toString()} scheduled successfully with a delay of ${delay}ms`
      );
    } catch (error) {
      console.error(
        `Failed to schedule bet detail ${betDetail._id.toString()}:`,
        error
      );
    }
  }


  //GET BETS OF PLAYERS UNDER AN AGENT
  async getAgentBets(req: Request, res: Response, next: NextFunction) {
    try {
      const { agentId } = req.params;
      const { date, page = 1, limit = 10 } = req.query; 
  
      if (!agentId) throw createHttpError(400, "Agent Id not Found");
  
      const agent = await User.findById(agentId);
      if (!agent) throw createHttpError(404, "Agent Not Found");
  
      const query: any = {};
  
      if (date) {
        const filterDate = new Date(date as string);
        const startOfDay = new Date(filterDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(filterDate.setHours(23, 59, 59, 999));
        query.createdAt = { $gte: startOfDay, $lte: endOfDay };
      }
  
      const playerUnderAgent = agent.players;
      if (playerUnderAgent.length === 0)
        return res.status(200).json({ message: "No Players Under Agent" });
  
      const bets = await Bet.find({
        player: { $in: playerUnderAgent },
        ...query,
      })
        .sort({ createdAt: -1 }) 
        .skip((+page - 1) * +limit) 
        .limit(+limit)
        .populate("player", "username _id")
        .populate({
          path: "data",
          populate: {
            path: "key",
            select: "event_id sport_title commence_time status",
          },
        });
  
      const totalBets = await Bet.countDocuments({
        player: { $in: playerUnderAgent },
        ...query,
      });
  
      res.status(200).json({
        totalBets,
        page: +page,
        limit: +limit,
        totalPages: Math.ceil(totalBets / +limit),
        data:bets,
      });
    } catch (error) {
      next(error);
    }
  }
  

  //GET ALL BETS FOR ADMIN
  async getAdminBets(req: Request, res: Response, next: NextFunction) {
    try {
      const { date, page = 1, limit = 10 } = req.query;
      const query: any = {};
  
      if (date) {
        const filterDate = new Date(date as string);
        const startOfDay = new Date(filterDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(filterDate.setHours(23, 59, 59, 999));
        query.createdAt = { $gte: startOfDay, $lte: endOfDay };
      }
  
      const bets = await Bet.find(query)
        .sort({ createdAt: -1 })
        .skip((+page - 1) * +limit) 
        .limit(+limit) 
        .populate("player", "username _id")
        .populate({
          path: "data",
          populate: {
            path: "key",
            select: "event_id sport_title commence_time status",
          },
        });
  
      const totalBets = await Bet.countDocuments(query); 
  
      res.status(200).json({
        totalBets,
        page: +page,
        limit: +limit,
        totalPages: Math.ceil(totalBets / +limit),
        data:bets,
      });
    } catch (error) {
      console.log(error);
      next(error);
    }
  }
  
  //GET BETS FOR A PLAYER
  async getBetForPlayer(req: Request, res: Response, next: NextFunction) {
    try {
      const { player } = req.params;
      const { type, status, date, search, page = 1, limit = 10 } = req.query;
      const query: any = {};
      
      if (date) {
        const filterDate = new Date(date as string);
        const startOfDay = new Date(filterDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(filterDate.setHours(23, 59, 59, 999));
        query.createdAt = { $gte: startOfDay, $lte: endOfDay };
      }
  
      let playerDoc: any;
      if (type === "id") {
        playerDoc = await PlayerModel.findById(player);
        if (!playerDoc) throw createHttpError(404, "Player Not Found");
      } else if (type === "username") {
        playerDoc = await PlayerModel.findOne({ username: player });
        if (!playerDoc)
          throw createHttpError(
            404,
            "Player Not Found with the provided username"
          );
      } else {
        throw createHttpError(400, "User Id or Username not provided");
      }
  
      const playerBets = await Bet.find({
        player: playerDoc._id,
        ...(status === "combo" || status === "all" ? {} : { status }),
        ...(status === "combo" && { betType: "combo" }),
        ...query,
      })
        .sort({ createdAt: -1 })
        .skip((+page - 1) * +limit) // Pagination
        .limit(+limit) // Limit results per page
        .populate("player", "username _id")
        .populate({
          path: "data",
          populate: {
            path: "key",
            select: "event_id sport_title commence_time status",
          },
        });
  
      const totalBets = await Bet.countDocuments({
        player: playerDoc._id,
        ...(status === "combo" || status === "all" ? {} : { status }),
        ...(status === "combo" && { betType: "combo" }),
        ...query,
      });
  
      res.status(200).json({
        totalBets,
        page: +page,
        limit: +limit,
        totalPages: Math.ceil(totalBets / +limit),
        data:playerBets,
      });
    } catch (error) {
      console.log(error);
      next(error);
    }
  }
  
  async redeemBetInfo(req: Request, res: Response, next: NextFunction) {
    try {
      const _req = req as AuthRequest;
      const { userId } = _req.user;
      const { betId } = req.params;
      let failed = false;

      const player = await PlayerModel.findById({ _id: userId });

      if (!player) {
        throw createHttpError(404, "Player not found");
      }
      const betObjectId = new mongoose.Types.ObjectId(betId);
      const bet = await Bet.findById(betObjectId);
      if (!bet) {
        throw createHttpError(404, "Bet not found");
      }
      if (bet.status !== "pending") {
        throw createHttpError(
          400,
          "Only bets with pending status can be redeemed!"
        );
      }
      const betAmount = bet.amount;
      const allBets = bet?.data;

      const betDetailsArray = await Promise.all(
        allBets.map((id) => BetDetail.findById(id))
      );
      let totalOldOdds = 1;
      let totalNewOdds = 1;

      for (const betDetails of betDetailsArray) {
        const oldOdds = betDetails.bet_on.odds;
        totalOldOdds *= oldOdds;

        const currentData = await Store.getEventOdds(
          betDetails.sport_key,
          betDetails.event_id,
          betDetails.category,
          "us",
          betDetails.oddsFormat,
          "iso"
        );

        const currentBookmakerData = currentData?.bookmakers?.find(
          (item) => item?.key === betDetails.bookmaker
        );

        //the earlier selected bookmaker is not available anymore
        if (!currentBookmakerData) {
          failed = true;
          break;
        } else {
          const marketDetails = currentBookmakerData?.markets?.find(
            (item) => item.key === betDetails.category
          );

          const newOdds = marketDetails.outcomes.find((item) => {
            if (betDetails.category !== "totals") {
              return item.name === betDetails.bet_on.name;
            }
          }).price
          totalNewOdds *= newOdds;
        }
      }
      if (failed) {
        res.status(200).json({
          message:
            "There was some error in processing this bet so, you will be refunded with the complete amount",
          amount: betAmount,
        });
      } else {
        const amount = (totalNewOdds / totalOldOdds) * betAmount;
        const finalPayout =
          amount - (parseInt(config.betCommission) / 100) * amount;
        res
          .status(200)
          .json({ message: "Your final payout will be", amount: finalPayout });
      }
    } catch (error) {
      next(error);
    }
  }

  //REDEEM PLAYER BET
  async redeemPlayerBet(req: Request, res: Response, next: NextFunction) {
    console.log("HERE");
    
    try {
      const _req = req as AuthRequest;
      const { userId } = _req.user;
      const { betId } = req.params;
      let failed = false;

      const player = await PlayerModel.findById({ _id: userId });
      if (!player) {
        throw createHttpError(404, "Player not found");
      }
      const playerSocket = users.get(player.username);
      const betObjectId = new mongoose.Types.ObjectId(betId);
      const bet = await Bet.findById(betObjectId);
      if (!bet) {
        throw createHttpError(404, "Bet not found");
      }
      if (bet.status !== "pending") {
        throw createHttpError(
          400,
          "Only bets with pending status can be redeemed!"
        );
      }
      const betAmount = bet.amount;
      const allBets = bet?.data;

      const betDetailsArray = await Promise.all(
        allBets.map((id) => BetDetail.findById(id))
      );
      let totalOldOdds = 1;
      let totalNewOdds = 1;

      for (const betDetails of betDetailsArray) {
        //need to remove from waiting list
        const data = {
          betId: betDetails._id.toString(),
          commence_time: new Date(betDetails.commence_time),
        };

        removeFromWaitingQueue(JSON.stringify(data));
        const oldOdds = betDetails.bet_on.odds;
        totalOldOdds *= oldOdds;

        const currentData = await Store.getEventOdds(
          betDetails.sport_key,
          betDetails.event_id,
          betDetails.category,
          "us",
          betDetails.oddsFormat,
          "iso"
        );

        const currentBookmakerData = currentData?.bookmakers?.find(
          (item) => item?.key === betDetails.bookmaker
        );

        //the earlier selected bookmaker is not available anymore
        if (!currentBookmakerData) {
          console.log(failed);
          
          failed = true;
          break;
        } else {
          console.log(currentBookmakerData, "DD");
          
          const marketDetails = currentBookmakerData?.markets?.find(
            (item) => item.key === betDetails.category
          );
         console.log(marketDetails, "MD");
         
          const newOdds = marketDetails.outcomes.find((item) => {
              return item.name === betDetails.bet_on.name;
          }).price
          totalNewOdds *= newOdds;

          betDetails.status = "redeem";
          betDetails.isResolved = true;
          await betDetails.save();
          bet.status = "redeem";
          await bet.save();
        }
      }

      if (failed) {
        for (const betDetails of betDetailsArray) {
          betDetails.status = "failed";
          await betDetails.save();
        }
        player.credits += betAmount;
        await player.save();
        bet.status = "failed";
        await bet.save();
        if (playerSocket) {
          playerSocket.sendData({ type: "CREDITS", credits: player.credits });
        }

        redisClient.publish(
          "bet-notifications",
          JSON.stringify({
            type: "BET_REDEEMED_FAILED",
            player: {
              _id: player._id.toString(),
              username: player.username,
            },
            agent: player.createdBy.toString(),
            betId: bet._id.toString(),
            playerMessage: ` Bet (ID: ${betId}) redeemed failed!`,
            agentMessage: `A Player ${player.username} failed to redeemed a bet (ID: ${betId})`,
          })
        );
        throw createHttpError(400, "Bet failed!");
      } else {
        const amount = (totalNewOdds / totalOldOdds) * betAmount;
        const finalPayout =
          amount - (parseInt(config.betCommission) / 100) * amount;
        player.credits += finalPayout;

        await player.save();
        bet.status = "redeem";
        await bet.save();
        //send redeem notification
        redisClient.publish(
          "bet-notifications",
          JSON.stringify({
            type: "BET_REDEEMED",
            player: {
              _id: player._id.toString(),
              username: player.username,
            },
            agent: player.createdBy.toString(),
            betId: bet._id.toString(),
            playerMessage: `A Bet (ID: ${betId}) redeemed successfully with a payout of ${finalPayout.toFixed(
              2
            )}!`,
            agentMessage: `A Player ${player.username
              } redeemed a bet (ID: ${betId}) with a payout of ${finalPayout.toFixed(
                2
              )}`,
          })
        );
        res.status(200).json({ message: "Bet Redeemed Successfully" , data:bet});
        if (playerSocket) {
          playerSocket.sendData({ type: "CREDITS", credits: player.credits });
        }
      }
    } catch (error) {
      next(error);
    }
  }

 // UPDATE OR RESOLVE BET
 /**
  * 
  * @req BET details id in params , status in body
  * - upadte the bet detail with either won or lost
  * - throw error if bet details not found 
  * - get parent bet id from bet details and find the parent bet, throw error if not found
  * - find all bet details for parent bet
  * - check if any bet details is lost or player has not won
  * - if previously parent bet was won and not it has not won deduct possible winning amount and vice versa
  * - check if player has enough credit to deduct from ,if not send a message
  * - notify player

  */
async resolveBet(req: Request, res: Response, next: NextFunction) {
  try {
    const { betDetailId } = req.params;
    const { status } = req.body; // won - lost

    const updatedBetDetails = await BetDetail.findByIdAndUpdate(
      betDetailId,
      {
        status: status,
      },
      { new: true }
    );

    if (!updatedBetDetails) {
      throw createHttpError(404, "Bet detail not found");
    }

    const parentBetId = updatedBetDetails.key;
    const parentBet = await Bet.findById(parentBetId);

    if (!parentBet) {
      throw createHttpError(404, "Parent bet not found");
    }

    // Fetch all related bet details
    const allBetDetails = await BetDetail.find({
      _id: { $in: parentBet.data },
    });

    const hasNotWon = allBetDetails.some((detail) => detail.status !== "won");

    // If the parent bet was previously "won" and now has a "lost" bet detail, update the status
    if (parentBet.status === "won" && hasNotWon) {      
      const playerId = parentBet.player;
      const betAmount = parentBet.possibleWinningAmount;
      const player = await PlayerModel.findById(playerId);

      if (!player) {
        throw createHttpError(404, "Player not found");
      }

      if (player.credits < betAmount) {
        await BetDetail.findByIdAndUpdate(betDetailId, {
          status: 'won', 
        });
        
        return res.status(400).json({
          message: "Insufficient credits to deduct bet amount",
        });
      }

      player.credits -= betAmount;
      await player.save();

      parentBet.status = "lost";
      await parentBet.save();

      const playerSocket = users.get(player.username);
      if (playerSocket) {
        playerSocket.sendData({ type: "CREDITS", credits: player.credits });
      }

      return res.status(200).json({ message: "Bet detail updated and amount deducted" , data:parentBet});
    }

    if (!hasNotWon && parentBet.status !== "won") {
      const playerId = parentBet.player;
      const possibleWinningAmount = parentBet.possibleWinningAmount;
      const player = await PlayerModel.findById(playerId);

      if (player) {
        player.credits += possibleWinningAmount;
        await player.save();
      }

      parentBet.status = "won";
      await parentBet.save();

      const playerSocket = users.get(player.username);
      if (playerSocket) {
        playerSocket.sendData({ type: "CREDITS", credits: player.credits });
      }
    }

    // Remove from waiting queue on resolve
    allBetDetails.forEach((detail) => {
      const data = {
        betId: detail._id.toString(),
        commence_time: new Date(detail.commence_time),
      };

      removeFromWaitingQueue(JSON.stringify(data));
    });

    return res.status(200).json({ message: "Bet detail status updated", data:parentBet });
  } catch (error) {
    console.log(error);
    
    next(error);
  }
}

  async updateBet(req: Request, res: Response, next: NextFunction) {
    try {
      const { betId, betDetails, betData } = req.body;
      console.log(JSON.stringify(req.body));

      if (!betId || !betData) {
        throw createHttpError(400, "Invalid Input")
      }
      const { detailId, ...updateData } = betDetails as any;

      const existingBetDetails = await BetDetail.findById(detailId);

      if (!existingBetDetails) {

        throw createHttpError(404, "Bet Detail Not found")

      }

      const isInProcessingQueue = await checkIfBetIsInProcessingQueue(detailId);
      if (isInProcessingQueue) {
        return res.status(409).json({ message: "Bet is in the processing queue and cannot be updated." });
      }
  

      //Handling removing the bet from processing queue or waiting queue

      if (existingBetDetails.status === "pending" && betDetails.status !== "pending") {
        const now = new Date().getTime();
        const commenceTime = existingBetDetails.commence_time;
        if (now >= new Date(commenceTime).getTime()) {
          const data = {
            betId: existingBetDetails._id.toString(),
            commence_time: new Date(existingBetDetails.commence_time),
          }
          await removeFromWaitingQueue(JSON.stringify(data));
        } else {
          await removeItem(JSON.stringify(existingBetDetails));

        }
      }

      const existingParentBet = await Bet.findById(betId);
      if (!existingParentBet) {
        throw createHttpError(404, "Bet Not Found")
      }
      const playerId = existingParentBet.player;
      const player = await PlayerModel.findById(playerId);
  
      if (!player) {
        throw createHttpError(404, "Player Not Found");
      }
  
    
      const previousStakeAmount = existingParentBet.amount;
      const newStakeAmount = betData.amount;
      
      if (newStakeAmount > previousStakeAmount) {
        const additionalAmountRequired = newStakeAmount - previousStakeAmount;
      
        if (player.credits < additionalAmountRequired) {
          return res.status(400).json({ message: "Insufficient credits to increase the bet amount." });
        }
      
        player.credits -= additionalAmountRequired;
        await player.save();
      }else if(newStakeAmount < previousStakeAmount){
        const amountToReturn = previousStakeAmount - newStakeAmount;
        player.credits += amountToReturn;
        await player.save();
      }
      
      existingParentBet.amount = newStakeAmount;
      await existingParentBet.save();

      const session = await mongoose.startSession();
      session.startTransaction();
      const newupdateData = {
        ...updateData,
        isResolved: true
      };
      await BetDetail.findByIdAndUpdate(detailId, newupdateData, { new: true }).session(session);
      const updatedBet = await Bet.findByIdAndUpdate(betId, betData, { new: true }).session(session);

      if (!updatedBet) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: "Bet not found" });
      }

      await session.commitTransaction();
      session.endSession();
      const parentBet = await Bet.findById(updatedBet._id);
      const allBetDetails = await BetDetail.find({ _id: { $in: parentBet.data } });
      const hasNotWon = allBetDetails.some((detail) => detail.status !== 'won');
      // const hasNotWonOrLost = allBetDetails.some(
      //   (detail) => detail.status !== 'won' && detail.status !== 'lost'
      // );


      let playerResponseMessage;
      let agentResponseMessage;
      const possibleWinningAmount = parentBet.possibleWinningAmount;

      if (!hasNotWon && parentBet.status !== "won") {
        if (player) {
          player.credits += possibleWinningAmount;
          await player.save();
        }

        parentBet.status = "won";
        parentBet.isResolved = true;
        await parentBet.save();

        const playerSocket = users.get(player.username);
        if (playerSocket) {
          playerSocket.sendData({ type: "CREDITS", credits: player.credits });
        }
        playerResponseMessage = `Bet Won!. Bet Amount: $${parentBet.amount}`;
        agentResponseMessage = `Your Player ${player.username} has won a bet. Bet Amount: $${parentBet.amount}`

      } else if ((existingParentBet.status === "won" || existingParentBet.status === "redeem") && hasNotWon) {
        if (player) {
          if (player.credits >= possibleWinningAmount) {
              player.credits -= possibleWinningAmount;
              await player.save();
          } else {
              console.log('Insufficient credits');
          }
        }
        parentBet.status = "lost";
        parentBet.isResolved = true;
        await parentBet.save();

        const playerSocket = users.get(player.username);
        if (playerSocket) {
          playerSocket.sendData({ type: "CREDITS", credits: player.credits });
        }
        playerResponseMessage = `Bet lost!. Bet Amount: $${parentBet.amount}`;
        agentResponseMessage = `Your Player ${player.username} has lost a bet. Bet Amount: $${parentBet.amount}`
      } else {

        playerResponseMessage = `Bet ${parentBet.status}!. Bet Amount: $${parentBet.amount}`;
        agentResponseMessage = `Your Player ${player.username}'s bet has  ${parentBet.status}. Bet Amount: $${parentBet.amount}`
      }

      redisClient.publish(
        "bet-notifications",
        JSON.stringify({
          type: "BET_RESULT",
          player: {
            _id: player._id.toString(),
            username: player.username,
          },
          agent: player.createdBy.toString(),
          betId: parentBet._id.toString(),
          playerMessage: playerResponseMessage,
          agentMessage: agentResponseMessage,
        })
      );
      res.status(200).json({ message: "Bet and BetDetails updated successfully", data:updatedBet });
    } catch (error) {
      console.log(error);

      next(error);
    }
  }
}

export default new BetController();
