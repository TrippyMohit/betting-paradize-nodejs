import mongoose from "mongoose";

export interface IUser extends Document {
    username: string;
    password: string;
    role: 'admin' | 'distributor' | 'subdistributor' | 'agent';
    credits: number;
    status: 'active' | 'inactive';
    createdAt: Date;
    createdBy?: mongoose.Schema.Types.ObjectId;
    lastLogin: Date;
    transactions: mongoose.Schema.Types.ObjectId[];
    subordinates:mongoose.Schema.Types.ObjectId[];
    players:mongoose.Schema.Types.ObjectId[];
    totalRecharge:number;
    totalRedeem:number;
}



