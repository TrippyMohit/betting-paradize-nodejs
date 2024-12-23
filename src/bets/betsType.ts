import mongoose from "mongoose";

export interface IBetDetail extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  key: mongoose.Schema.Types.ObjectId;
  teams: {
    name: string;
    odds: number;
  }[];
  bet_on: {
    name: string;
    odds: number;
    points?: number;
  };
  event_id: string;
  sport_title: string;
  sport_key: string;
  commence_time: Date;
  category: string;
  bookmaker: string;
  oddsFormat: string;
  status: "won" | "lost" | "draw" | "pending" | "redeem" | "failed";
  isResolved: boolean;
}

export interface IBet extends mongoose.Document {
  player: mongoose.Schema.Types.ObjectId;
  data: IBetDetail[];
  amount: number;
  possibleWinningAmount: number;
  status: "won" | "lost" | "draw" | "pending" | "redeem" | "failed";
  retryCount: number;
  betType: "single" | "combo";
  isResolved: boolean;
}


export interface IBetSlip {
  id: string;
  teams: {
    name: string;
    odds: number;
  }[];
  bet_on: {
    name: string;
    odds: number;
    points?: number;
  };
  event_id: string;
  sport_title: string;
  sport_key: string;
  commence_time: string;
  category: string;
  bookmaker: string;
  oddsFormat: string;
  amount: number;
}
