import mongoose from "mongoose";

export interface IScores extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  event_id: string;
  teams: {
    name: string;
    score: number;
  }[];
  completed: boolean;
}


