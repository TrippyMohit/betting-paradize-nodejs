import mongoose, { Model, Schema } from "mongoose";
import { IUser } from "./userType";

export const userSchemaFields: Partial<Record<keyof IUser, any>> = {
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
        enum: ['admin', 'distributor', 'subdistributor', 'agent'], 
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
    subordinates: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    ],
    players: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Player'
        }
    ],
    totalRecharge:{
        type: Number,
        default:0
    },
    totalRedeem:{
        type:Number,
        default:0
    }

};

const userSchema = new Schema(userSchemaFields, {
    collection: 'users',
    timestamps: true,
});

userSchema.pre('save', function (next) {
    if (this.role && (this.role !== 'admin' && this.role !== 'agent')) {
        this.players = undefined;
    }else if(this.role === 'agent'){
        this.subordinates = undefined;
    }

    next();
});

userSchema.pre('findOneAndUpdate', function (next) {
    const update = this.getUpdate() as Partial<IUser>;

    if (update.role && (update.role !== 'admin' && update.role !== 'agent')) {
        this.set({ players: undefined });
    }else if(update.role ==='agent'){
        this.set({subordintes:undefined})
    }

    next();
});

const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);
export default User;
