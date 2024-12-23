import mongoose, { Model, Schema } from "mongoose";
import { IActivity, IDailyActivity } from "./userActivityType";

 const activitySchemaFileds: Partial<Record<keyof IActivity, any>> = {
    startTime: {
        type: Date,
        required: true
    },
    endTime: {
        type: Date,
        default: null
    }
}

const activitySchema = new Schema(activitySchemaFileds, {
    collection:'activity',
    timestamps:true
})

export const Activity: Model<IActivity> = mongoose.model<IActivity>('Activity', activitySchema);


const dailyActivityFields: Partial<Record<keyof IDailyActivity, any>> = {
    date:{
        type:Date,
        required:true
    },
    player:{
        type:Schema.Types.ObjectId,
        ref:'Player',
        required:true
    },
    actvity:[
        {
            type:Schema.Types.ObjectId,
            ref:'Activity'
        }
    ]

}

const dailyActivitySchema = new Schema(dailyActivityFields, {
    collection:'dailyActivity',
    timestamps:true
})

const DailyActivity: Model<IDailyActivity> = mongoose.model<IDailyActivity>('DailyActivity', dailyActivitySchema);
export default DailyActivity;