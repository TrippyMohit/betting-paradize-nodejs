import mongoose, { Document } from "mongoose";

export interface ITransaction extends Document {
  sender: mongoose.Schema.Types.ObjectId;
  receiver: mongoose.Schema.Types.ObjectId;
  senderModel: 'User' | 'Player';
  receiverModel: 'User' | 'Player';
  type: 'recharge' | 'redeem' | 'bet';
  amount: number;
  date: Date;
}

export interface CustomAggregationStage {
  $lookup?: any;
  $unwind?: any;
  $match?: any;
  $project?: any;
  $sort?: any;
  $skip?: number;
  $limit?: number;
}