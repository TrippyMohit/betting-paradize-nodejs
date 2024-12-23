// import { Request, Response, NextFunction } from "express";
// import { Player } from "../usersTest/userModel";
// import BetTransaction from "./betTransactionModel";
// import createHttpError from "http-errors";
// import mongoose from "mongoose";
// import { AuthRequest } from "../utils/utils";
// import BetTransactionService from "./betTransactionServices";

// export class BetTransactionController {
//   private betTransactionService: BetTransactionService;

//   constructor() {
//     this.betTransactionService = new BetTransactionService();
//     this.createBet = this.createBet.bind(this);
//     this.getAllbets = this.getAllbets.bind(this);
//     this.getPlayerBets = this.getPlayerBets.bind(this);
//   }

//   async createBet(req: Request, res: Response, next: NextFunction) {
//     const session = await mongoose.startSession();
//     try {
//       session.startTransaction();
//       const _req = req as AuthRequest;
//       const { username, role } = _req.user;
//       const { matchId, betOdds, betAmount, teamId } = req.body;
//       console.log("body", req.body);

//       if (role !== "player") {
//         throw createHttpError(
//           403,
//           "Forbidden: You do not have the necessary permissions to access this resource."
//         );
//       }
//       const player = await Player.findOne({ username });
//       if (!player) {
//         throw createHttpError(404, "Player not found!");
//       }

//       if (!matchId || !betOdds || !betAmount || !teamId) {
//         throw createHttpError(400, "All fields are required");
//       }

//       if (player.credits < betAmount) {
//         throw createHttpError(
//           400,
//           "You have insufficient balance to place this bet"
//         );
//       }

//       const bet = await this.betTransactionService.createBetTransaction(
//         matchId,
//         betAmount,
//         betOdds,
//         teamId,
//         session
//       );

//       player.betTransaction.push(bet._id as mongoose.Types.ObjectId);
//       player.credits = player.credits - betAmount;
//       await player.save();
//       await session.commitTransaction();
//       session.endSession();
//       res.status(200).json({ message: "Bet Placed Successfully!", bet });
//     } catch (error) {
//       await session.abortTransaction();
//       session.endSession();
//       console.error(`Error deleting transaction: ${error.message}`);
//       next(error);
//     }
//   }

//   async getAllbets(req: Request, res: Response, next: NextFunction) {
//     try {
//       const _req = req as AuthRequest;
//       const { username, role } = _req.user;
//       if (role !== "superadmin") {
//         throw createHttpError(400, "You don't have access to this");
//       }
//       const bets = await BetTransaction.find();
//       res.status(200).json({ bets });
//     } catch (error) {
//       next(error);
//     }
//   }

//   async getPlayerBets(req: Request, res: Response, next: NextFunction) {
//     try {
//       const _req = req as AuthRequest;
//       const { role } = _req.user;
//       if (role !== "superadmin") {
//         throw createHttpError(400, "You don't have access to this");
//       }
//       const { playerId } = req.params;
//       const playerObjectId = new mongoose.Types.ObjectId(playerId);
//       const player = await this.betTransactionService.findPlayerById(
//         playerObjectId
//       );
//       if (!player) {
//         throw createHttpError(404, "Player not found");
//       }
//       const betTransactionIds = player.betTransaction;

//       const bets = await BetTransaction.find({
//         _id: { $in: betTransactionIds },
//       });

//       res.status(200).json({ bets });
//     } catch (error) {
//       next(error);
//     }
//   }
// }
