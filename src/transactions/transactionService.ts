import mongoose, { ClientSession, Model } from "mongoose";
import { IUser } from "../users/userType";
import { IPlayer } from "../players/playerType";
import User from "../users/userModel";
import Player from "../players/playerModel";
import Transaction from "./transactionModel";
import createHttpError from "http-errors";
import { users } from "../socket/socket";

export class TransactionService {
  //RECORDING TRANSACTION AND ABORTING USING SESSIONS
  static async performTransaction(
    senderId: mongoose.Types.ObjectId,
    receiverId: mongoose.Types.ObjectId,
    sender: IUser | IPlayer,
    receiver: IUser | IPlayer,
    senderModel: "User" | "Player",
    receiverModel: "User" | "Player",
    type: "recharge" | "redeem",
    amount: number,
    role: string
  ): Promise<void> {

    //sender and receiver
    //sender-> User who wants to recharge or redeem
    //reciever-> User getting recharged or redeemed 

    const session: ClientSession = await mongoose.startSession();
    session.startTransaction();

    try {
      if (amount <= 0) {
        throw createHttpError(
          400,
          "Transaction amount must be greater than zero."
        );
      }

      const senderModelInstance = this.getModelInstance(senderModel);
      const receiverModelInstance = this.getModelInstance(receiverModel);

      this.validateCredits(type, sender, receiver, amount);

      await this.updateCredits(
        type,
        senderId,
        receiverId,
        senderModel,
        receiverModel,
        senderModelInstance,
        receiverModelInstance,
        amount,
        session
      );
      // to store sender and receiver for DB sendr and reciever field we need to find  who is getting money and who is giving money

      const senderUser = type === "redeem" ? receiverId : senderId; // recieverId is the user who is getting recharged or redeemed
      const receiverUser = type === "redeem" ? senderId : receiverId;//senderId is user who is redeeming or recharging

      //to get the model of sender and reciever
      const senderModelForDB = type === "redeem" ? receiverModel : senderModel;
      const receiverModelForDB = type === "redeem" ? senderModel : receiverModel

       const transaction:any = await Transaction.create([{
        sender: senderUser,
        receiver: receiverUser,
        senderModel: senderModelForDB,
        receiverModel: receiverModelForDB,
        type,
        amount,
      }], { session });

      await session.commitTransaction();
      console.log("Transaction committed successfully");
      return transaction[0];
    } catch (error) {
      await session.abortTransaction();
      console.error("Transaction aborted due to error:", error.message);
      throw error;
    } finally {
      session.endSession();
    }
  }

  private static getModelInstance(
    modelName: "User" | "Player"
  ): Model<IUser | IPlayer> {
    switch (modelName) {
      case "User":
        return User;
      case "Player":
        return Player;
      default:
        throw createHttpError(500, "Unknown model name");
    }
  }

  private static validateCredits(
    type: "recharge" | "redeem",
    sender: IUser | IPlayer,
    receiver: IUser | IPlayer,
    amount: number
  ): void {
    if (type === "recharge" && sender.credits < amount) {
      throw createHttpError(400, "Insufficient credits in account for recharge.");
    }
    if (type === "redeem" && receiver.credits < amount) {
      throw createHttpError(400, "Insufficient credits in  account for redemption.");
    }
  }

  private static async updateCredits(
    type: "recharge" | "redeem",
    senderId: mongoose.Types.ObjectId,
    receiverId: mongoose.Types.ObjectId,
    senderModel: "User" | "Player",
    receiverModel: "User" | "Player",
    senderModelInstance: Model<IUser | IPlayer>,
    receiverModelInstance: Model<IUser | IPlayer>,
    amount: number,
    session: ClientSession
  ): Promise<void> {
    const senderUpdate = type === "recharge" ? -amount : amount;
    const receiverUpdate = type === "recharge" ? amount : -amount;

    await senderModelInstance.updateOne(
      { _id: senderId },
      { $inc: { credits: senderUpdate } },
      { session }
    );
    await receiverModelInstance.updateOne(
      { _id: receiverId },
      { $inc: { credits: receiverUpdate } },
      { session }
    );
    if (type === "recharge") {
      await receiverModelInstance.updateOne(
        { _id: receiverId },
        { $inc: { totalRecharge: amount } },
        { session }
      );
      await senderModelInstance.updateOne(
        { _id: senderId },
        { $inc: { totalRedeem: amount } },
        { session }
      );
    } else if (type === "redeem") {
      await senderModelInstance.updateOne(
        { _id: senderId },
        { $inc: { totalRecharge: amount } },
        { session }
      );
      await receiverModelInstance.updateOne(
        { _id: receiverId },
        { $inc: { totalRedeem: amount } },
        { session }
      );
    }
    await this.handlePlayerUpdate(senderModel, senderId, session);
    await this.handlePlayerUpdate(receiverModel, receiverId, session);
  }

  private static handlePlayerUpdate = async (
    model: "Player" | "User",
    id: mongoose.Types.ObjectId,
    session: ClientSession
  ) => {
    if (model === "Player") {
      const player = await Player.findById(id).session(session);
      if (player) {
        const playerName = player.username;
        const playerSocket = users.get(playerName);
        if (playerSocket) {
          playerSocket.sendData({ type: "CREDITS", credits: player.credits });
        }
      }
    }
  };
}

// import mongoose from "mongoose";
// import { ITransaction } from "./transactionType";
// import { rolesHierarchy } from "../utils/utils";
// import createHttpError from "http-errors";
// import Transaction from "./transactionModel";
// import { Player, User } from "../usersTest/userModel";
// import { QueryParams } from "../utils/utils";

// export class TransactionService {
//   async createTransaction(
//     type: string,
//     client: any,
//     manager: any,
//     amount: number,
//     session: mongoose.ClientSession
//   ): Promise<ITransaction> {
//     if (!rolesHierarchy[manager.role]?.includes(client.role)) {
//       throw createHttpError(
//         403,
//         `${manager.role} cannot perform transactions with ${client.role}`
//       );
//     }

//     if (type === "recharge") {
//       if (manager.credits < amount) {
//         throw createHttpError(400, "Insufficient credits to recharge");
//       }

//       client.credits += amount;
//       client.totalRecharged += amount;
//       manager.credits -= amount;
//     } else if (type === "redeem") {
//       if (client.credits < amount) {
//         throw createHttpError(400, "Client has insufficient credits to redeem");
//       }
//       client.credits -= amount;
//       client.totalRedeemed += amount;
//       manager.credits += amount;
//     }

//     const transaction = new Transaction({
//       debtor: type === "recharge" ? client.username : manager.username,
//       creditor: type === "recharge" ? manager.username : client.username,
//       type: type,
//       amount: amount,
//       createdAt: new Date(),
//     });

//     await transaction.save({ session });

//     return transaction;
//   }

//   async getTransactions(
//     username: string,
//     page: number,
//     limit: number,
//     query: QueryParams
//   ) {
//     const skip = (page - 1) * limit;

//     const user =
//       (await User.findOne({ username })) ||
//       (await Player.findOne({ username }));
//     if (!user) {
//       throw new Error("User not found");
//     }

//     const totalTransactions = await Transaction.countDocuments({
//       $or: [{ debtor: user.username }, { creditor: user.username }],
//       ...query,
//     });

//     const totalPages = Math.ceil(totalTransactions / limit);

//     if (totalTransactions === 0) {
//       return {
//         transactions: [],
//         totalTransactions: 0,
//         totalPages: 0,
//         currentPage: 0,
//         outOfRange: false,
//       };
//     }

//     if (page > totalPages) {
//       return {
//         transactions: [],
//         totalTransactions,
//         totalPages,
//         currentPage: page,
//         outOfRange: true,
//       };
//     }

//     const transactions = await Transaction.find({
//       $or: [{ debtor: user.username }, { creditor: user.username }],
//       ...query,
//     })
//       .skip(skip)
//       .limit(limit);

//     return {
//       transactions,
//       totalTransactions,
//       totalPages,
//       currentPage: page,
//       outOfRange: false,
//     };
//   }

//   deleteTransaction(id: string, session: mongoose.ClientSession) {
//     return Transaction.findByIdAndDelete(id).session(session);
//   }
// }

// export default TransactionService;