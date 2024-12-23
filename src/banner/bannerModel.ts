import mongoose, { Document, Schema } from "mongoose";
import { IBanner } from "./bannerType";

const bannerSchema: Schema = new Schema({
  url: {
    type: String,
    required: true,
  },
  category: {
    type: [String],
    required: true,
  },
  status: {
    type: Boolean,
    require: true,
  },
  title: {
    type: String,
    required: true,
  },
});

const Banner = mongoose.model<IBanner>("Banners", bannerSchema);

export default Banner;