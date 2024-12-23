import mongoose, { Model, Schema } from "mongoose";
import { IBet, IBetDetail } from "./betsType";


const BetDetailSchema: Schema = new Schema({
  key: { type: Schema.Types.ObjectId, ref: "Bet", required: true },
  teams: [
    {
      name: { type: String, required: true },
      odds: { type: Number, required: true }
    }
  ],
  bet_on: {
    name: {
      type: String,
      required: true,
    },
    odds: {
      type: Number,
      required: true
    },
    points: {
      type: Number,
      required: false
    }
  },
  event_id: { type: String, required: true },
  sport_title: { type: String, required: true },
  sport_key: { type: String, required: true },
  commence_time: { type: Date, required: true },
  category: { type: String, required: true },
  bookmaker: { type: String, required: true },
  oddsFormat: { type: String, required: true },
  status: {
    type: String,
    enum: ["won", "lost", "draw", "pending", "redeem", "failed"],
    required: true,
  },
  isResolved: {
    type: Boolean,
    default: false,
  }
}, { timestamps: true });
const BetDetailTotalsSchema: Schema = new Schema({
  key: { type: Schema.Types.ObjectId, ref: "Bet", required: true },
  teams: [
    {
      name: { type: String, required: true }
    }
  ],
  bet_on: {
    name: { // Texas Longhorn
      type: String,
      required: true,
    },
    odds: {
      type: Number,
      required: true
    },
    points: {
      type: Number,
      required: true
    }
  },
  event_id: { type: String, required: true },
  sport_title: { type: String, required: true },
  sport_key: { type: String, required: true },
  commence_time: { type: Date, required: true },
  category: { type: String, required: true },
  bookmaker: { type: String, required: true },
  oddsFormat: { type: String, required: true },
  status: {
    type: String,
    enum: ["won", "lost", "draw", "pending", "redeem", "failed"],
    required: true,
  },
  isResolved: {
    type: Boolean,
    default: false,
  }
}, { timestamps: true });



const BetSchema: Schema = new Schema({
  player: { type: Schema.Types.ObjectId, ref: "Player", required: true },
  data: [{ type: Schema.Types.ObjectId, ref: "BetDetail", required: true }],
  amount: { type: Number, required: true },
  possibleWinningAmount: { type: Number, required: true },
  status: {
    type: String,
    // enum: ["won", "lost", "draw", "pending", "redeem", "failed"],
    required: true,
  },
  retryCount: { type: Number, default: 0 },
  betType: { type: String, enum: ["single", "combo"], required: true },
}, { timestamps: true });

export const BetDetail = mongoose.model<IBetDetail>(
  "BetDetail",
  BetDetailSchema
);
const Bet = mongoose.model<IBet>("Bet", BetSchema);

export default Bet;
