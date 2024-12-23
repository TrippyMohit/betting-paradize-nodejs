import mongoose, { Model, Schema } from "mongoose";
import { IPlayer } from "./playerType";

const playerSchemaFields: Partial<Record<keyof IPlayer, any>> = {
    username: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        default: 'player',
        required: true,
    },
    credits: {
        type: Number,
        default: 0,
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    lastLogin: {
        type: Date,
    },
    transactions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction',
    }],
    betHistory: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Bet',
    }],
    totalRecharge:{
        type: Number,
        default:0
    },
    totalRedeem:{
        type:Number,
        default:0
    }
};

const playerSchema: Schema<IPlayer> = new Schema(playerSchemaFields, { collection: 'players', timestamps: true  });
const Player: Model<IPlayer> = mongoose.model<IPlayer>('Player', playerSchema);
export default Player;
