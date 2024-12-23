import mongoose from "mongoose";


export interface IActivity extends Document{
  startTime:Date,
  endTime:Date,
}

export interface IDailyActivity extends Document{
  date:Date,
  player:mongoose.Schema.Types.ObjectId,
  actvity:mongoose.Schema.Types.ObjectId[];
}
