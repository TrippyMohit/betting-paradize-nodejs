import mongoose from "mongoose";

export interface IBanner extends Document {
  url: string;
  category: string[];
  status: boolean;
  title: string;
}