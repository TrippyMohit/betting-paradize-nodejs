import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import bcrypt from "bcrypt";
import { sanitizeInput } from "../utils/utils";
import User from "../users/userModel";
import { config } from "../config/config";
import { generateOtp, sendOtp } from "../utils/otp";
import mongoose from "mongoose";
import cloudinary from "cloudinary";

cloudinary.v2.config({
  cloud_name: config.cloud_name,
  api_key: config.api_key,
  api_secret: config.api_secret,
});

interface BannerRequest extends Request {
  files?: {
    [fieldname: string]: Express.Multer.File[];
  };
}

class AdminController {
  static saltRounds: Number = 10;
  private static otpStore: Map<string, { otp: string; expiresAt: Date }> =
    new Map();

  constructor() {
    this.requestOtp = this.requestOtp.bind(this);
  }

  public async requestOtp(req: Request, res: Response, next: NextFunction) {
    const { user } = req.body;

    if (!user) {
      return next(createHttpError(400, "User details are required"));
    }

    const email = config.sentToMail;
    const otp = generateOtp();

    // Store the OTP with and expiration time
    AdminController.otpStore.set(email, {
      otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    console.log("OTP stored in memory: ", AdminController.otpStore);

    try {
      console.time("otp-sent");
      await sendOtp(email, otp);
      console.timeEnd("otp-sent");

      res.status(200).json({ message: "OTP sent successfully" });
    } catch (error) {
      console.error("Error sending OTP:", error);
      next(createHttpError(500, "Failed to send OTP"));
    }
  }

  public async verifyOtpAndCreateAdmin(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const { otp, user } = req.body;
    const receiverEmail = config.sentToMail;
    const storedOtp = AdminController.otpStore.get(receiverEmail);

    if (!otp || !user) {
      return next(createHttpError(400, "OTP and user details are required"));
    }

    if (!storedOtp || new Date() > storedOtp.expiresAt) {
      return next(createHttpError(400, "OTP expired"));
    }

    if (storedOtp.otp !== otp) {
      return next(createHttpError(400, "Invalid OTP"));
    }

    // Delete the OTP from the store
    AdminController.otpStore.delete(receiverEmail);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      if (!user.username || !user.password) {
        throw createHttpError(400, "Username, password are required");
      }

      const sanitizedUsername = sanitizeInput(user.username);
      const sanitizedPassword = sanitizeInput(user.password);

      if (!sanitizedUsername || !sanitizedPassword) {
        throw createHttpError(400, "Username, password are required");
      }

      const existingAdmin = await User.findOne({
        username: sanitizedUsername,
      }).session(session);

      if (existingAdmin) {
        throw createHttpError(400, "Username already exists");
      }

      const hashedPassword = await bcrypt.hash(
        sanitizedPassword,
        AdminController.saltRounds
      );

      const newAdmin = new User({
        username: sanitizedUsername,
        password: hashedPassword,
      });
      newAdmin.credits = Infinity;
      newAdmin.role = "admin";

      await newAdmin.save({ session });
      await session.commitTransaction();

      res
        .status(201)
        .json({ message: "Admin Created Succesfully", admin: newAdmin });
    } catch (error) {
      await session.abortTransaction();
      next(error);
    }
  }
}

export default new AdminController();
