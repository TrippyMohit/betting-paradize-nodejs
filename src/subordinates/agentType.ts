import mongoose from "mongoose";
import { IUser } from "../users/userType";

export interface IAgent extends IUser {
    players: mongoose.Schema.Types.ObjectId[];
}