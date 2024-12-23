import mongoose, { Schema, Model } from "mongoose";
import { ITransaction } from "./transactionType";

const transactionSchema: Schema<ITransaction> = new Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'senderModel',
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'receiverModel',
  },
  senderModel: {
    type: String,
    required: true,
    enum: ['User', 'Player'],
    select: false,
  },
  receiverModel: {
    type: String,
    required: true,
    enum: ['User', 'Player'],
    select: false,
  },
  type: {
    type: String,
    enum: ['recharge', 'redeem'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
}, { collection: 'transactions' });

const Transaction: Model<ITransaction> = mongoose.model<ITransaction>('Transaction', transactionSchema);


export default Transaction;
