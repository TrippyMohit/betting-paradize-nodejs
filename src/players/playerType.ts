import mongoose from "mongoose";

export interface IPlayer extends Document {
    username: string;
    password: string;
    role: 'player';
    credits: number;
    status: 'active' | 'inactive';
    createdAt: Date;
    createdBy?: mongoose.Schema.Types.ObjectId;
    lastLogin: Date;
    transactions: mongoose.Schema.Types.ObjectId[];
    betHistory: mongoose.Schema.Types.ObjectId[];
    totalRecharge:number;
    totalRedeem:number;
}