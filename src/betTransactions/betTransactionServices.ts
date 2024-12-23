// import mongoose from "mongoose";
// import { BTransaction } from "./betTransactionType";
// import BetTransaction from "./betTransactionModel";
// import { Player } from "../usersTest/userModel";

// export class BetTransactionService {
//   async createBetTransaction(
//     matchId: string,
//     betAmount: number,
//     betOdds: number,
//     teamId: string,
//     session?: mongoose.ClientSession
//   ): Promise<BTransaction> {
//     const bet = new BetTransaction({
//       matchId: matchId,
//       betAmount: betAmount,
//       betOdds: betOdds,
//       teamId: teamId,
//       createdAt: new Date(),
//     });

//     await bet.save({ session });
//     return bet;
//   }

//   async findPlayerById(
//     id: mongoose.Types.ObjectId,
//     session?: mongoose.ClientSession
//   ) {
//     return Player.findById(id).session(session || null);
//   }
// }

// export default BetTransactionService;
