import { NextFunction, Request, Response } from "express";
import User from "./userModel";
import createHttpError from "http-errors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Player from "../players/playerModel";
import { config } from "../config/config";
import { AuthRequest, sanitizeInput } from "../utils/utils";
import svgCaptcha from "svg-captcha";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import Transaction from "../transactions/transactionModel";
import Bet from "../bets/betModel";
import { IUser } from "./userType";
import { users } from "../socket/socket";

const captchaStore: Record<string, string> = {};

class UserController {
  static saltRounds: Number = 10;
  constructor() {
    // Bind each method to 'this'
    this.getSummary = this.getSummary.bind(this);
    // Repeat for other methods as necessary
  }

  //TO GET CAPTCHA

  async getCaptcha(req: Request, res: Response, next: NextFunction) {
    try {
      const captcha = svgCaptcha.create();
      console.log(captcha.text);
      const captchaId = uuidv4();
      captchaStore[captchaId] = captcha.text;

      const captchaToken = jwt.sign({ captchaId }, config.jwtSecret, {
        expiresIn: "5m",
      });

      res.status(200).json({ captcha: captcha.data, token: captchaToken });
    } catch (err) {
      next(err);
    }
  }

  //LOGIN

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { username, password, captcha, captchaToken } = req.body;
      const { origin } = req.query;
      const sanitizedUsername = sanitizeInput(username);
      const sanitizedPassword = sanitizeInput(password);
      if (origin === "platform") {
        if (!sanitizedUsername || !sanitizedPassword) {
          throw createHttpError(400, "Username and password are required");
        }
        if (users.get(sanitizedUsername))
          throw createHttpError(
            400,
            "Your are already logged in from another device"
          );
      } else if (origin === "crm") {
        const sanitizedcaptachaToken = sanitizeInput(captchaToken);
        const sanitizedCaptcha = sanitizeInput(captcha);
        if (
          !sanitizedUsername ||
          !sanitizedPassword ||
          !sanitizedcaptachaToken ||
          !sanitizedCaptcha
        ) {
          throw createHttpError(
            400,
            "Username, password, CAPTCHA, and token are required"
          );
        }
        const decoded = jwt.verify(captchaToken, config.jwtSecret) as {
          captchaId: string;
        };
        const expectedCaptcha = captchaStore[decoded.captchaId];

        if (captcha !== expectedCaptcha) {
          throw createHttpError(400, "Invalid CAPTCHA");
        }

        delete captchaStore[decoded.captchaId];
      } else {
        throw createHttpError(404, "Not a valid origin");
      }

      const user =
        (await User.findOne({ username: sanitizedUsername })) ||
        (await Player.findOne({ username: sanitizedUsername }));

      if (!user) {
        throw createHttpError(401, "Username or password is incorrect");
      }

      const userStatus = user.status === "inactive";
      if (userStatus) {
        throw createHttpError(403, "You are Blocked!");
      }

      const isPasswordValid = await bcrypt.compare(
        sanitizedPassword,
        user.password
      );
      if (!isPasswordValid) {
        throw createHttpError(401, "Username or password is incorrect");
      }

      user.lastLogin = new Date();
      await user.save();

      const token = jwt.sign(
        {
          userId: user._id,
          username: user.username,
          role: user.role,
          credits: user.credits,
        },
        config.jwtSecret,
        { expiresIn: "24h" }
      );
      res.cookie("userToken", token, {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        httpOnly: true,
        sameSite: "none",
      });

      res.status(200).json({
        message: "Login successful",
        token: token,
        role: user.role,
      });
    } catch (err) {
      console.log(err);
      next(err);
    }
  }

  //CURRENT LOGGED IN USER

  async getCurrentUser(req: Request, res: Response, next: NextFunction) {
    try {
      const _req = req as AuthRequest;
      const { userId } = _req.user;

      if (!userId) throw createHttpError(400, "Invalid Request, Missing User");

      const user =
        (await User.findById(userId).select("username role status credits")) ||
        (await Player.findById({ _id: userId }).select(
          "username role status credits"
        ));

      if (!user) throw createHttpError(404, "User not found");

      if (user.status === "inactive") {
        throw createHttpError(400, "You are blocked");
      }

      res.status(200).json(user);
    } catch (err) {
      next(err);
    }
  }
//GET Players created by User
async getCreatedUsersAndPlayersByMonth(req: Request, res: Response, next: NextFunction) {
  try {
    const { year } = req.query;
    const _req = req as AuthRequest;
    const { userId: createdBy } = _req.user;

    console.log('Created By:', createdBy);
    console.log('Year:', year);

    if (!createdBy || !year) {
      return res.status(400).json({ error: "createdBy and year are required" });
    }

    const parsedYear = parseInt(year as string, 10);
    if (isNaN(parsedYear)) {
      return res.status(400).json({ error: "Invalid year format" });
    }

    const startDate = new Date(`${parsedYear}-01-01T00:00:00.000Z`);
    const endDate = new Date(`${parsedYear + 1}-01-01T00:00:00.000Z`); // Start of next year for exclusive end

    console.log('Start Date:', startDate);
    console.log('End Date:', endDate);

    const userPipeline: any = [
      {
        $match: {
          createdBy: new mongoose.Types.ObjectId(createdBy),
          createdAt: {
            $gte: startDate,
            $lt: endDate, 
          },
        },
      },
      {
        $group: {
          _id: { $month: "$createdAt" },  
          userCount: { $sum: 1 },
        },
      },
      {
        $sort: { "_id": 1 },  
      },
    ];

    // Player aggregation pipeline
    const playerPipeline: any = [
      {
        $match: {
          createdBy: new mongoose.Types.ObjectId(createdBy), 
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
        },
      },
      {
        $group: {
          _id: { $month: "$createdAt" },  
          playerCount: { $sum: 1 },
        },
      },
      {
        $sort: { "_id": 1 },  
      },
    ];

    // Execute aggregation pipelines
    const userStats = await User.aggregate(userPipeline);
    const playerStats = await Player.aggregate(playerPipeline);
    
    // Log results for debugging
    console.log('User Stats:', userStats);
    console.log('Player Stats:', playerStats);

    const combinedResults: any = {};

    userStats.forEach((userStat) => {
      combinedResults[userStat._id] = {
        month: userStat._id,
        users: userStat.userCount || 0,
        players: 0,
      };
    });

    playerStats.forEach((playerStat) => {
      if (combinedResults[playerStat._id]) {
        combinedResults[playerStat._id].players = playerStat.playerCount || 0;
      } else {
        combinedResults[playerStat._id] = {
          month: playerStat._id,
          users: 0,
          players: playerStat.playerCount || 0,
        };
      }
    });

    const monthlyResults = Object.values(combinedResults).sort((a: any, b: any) => a.month - b.month);

    res.status(200).json(monthlyResults);
  } catch (error) {
    console.error(error);
    next(error);
  }
}




  //GET SUMMARY(e.g. recent transactions and bets) FOR AGENT AND ADMIN DASHBOARD

  async getSummary(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const { period } = req.query;
      const user = await User.findById(id);
      if (!user) {
        throw createHttpError(404, "User Not Found");
      }
      const today = new Date();
      const startOfDay = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );
      const startOfWeek = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - 7
      );
      const startOfMonth = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - 30
      );
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(startOfDay.getDate() + 1);
      const limitBets = parseInt(req.query.limitBets as string) || 4;
      const limitTransactions =
        parseInt(req.query.limitTransactions as string) || 10;

      let periodStart: Date;
      let periodEnd: Date;

      switch (period) {
        case "week":
          periodStart = startOfWeek;
          periodEnd = today;
          break;
        case "month":
          periodStart = startOfMonth;
          periodEnd = today;
          break;
        case "today":
        default:
          periodStart = startOfDay;
          periodEnd = endOfDay;
          break;
      }

      const periodSummary = await this.getPeriodSummary(
        periodStart,
        periodEnd,
        limitBets,
        limitTransactions,
        user
      );

      res.status(200).json(periodSummary);
    } catch (err) {
      console.error(err);
      next(err);
    }
  }

  private async getPeriodSummary(
    startPeriod: Date,
    endPeriod: Date,
    limitBets: number,
    limitTransactions: number,
    user
  ) {
    const [
      lastTransactions,
      transactionTotals,
      subordinateCounts,
      totalRecharged,
      totalRedeemed,
      playerCounts,
    ] = await Promise.all([
      this.getLastTransactions(limitTransactions, user),
      this.getTransactionTotals(startPeriod, endPeriod, user),
      this.getSubordinateCounts(startPeriod, endPeriod, user),
      this.getTotalRecharged(startPeriod, endPeriod, user),
      this.getTotalRedeemed(startPeriod, endPeriod, user),
      user.role === "agent" || user.role === "admin"
        ? this.getPlayerCounts(startPeriod, endPeriod, user)
        : undefined,
    ]);

    const result: any = {
      lastTransactions,
      transactionTotals: transactionTotals[0] || {},
      subordinateCounts: subordinateCounts[0] || {},
      totalRecharged: totalRecharged[0] || {},
      totalRedeemed: totalRedeemed[0] || {},
    };

    if (user.role === "agent" || user.role === "admin") {
      const lastBets = await this.getLastBets(limitBets, user);
      result.lastBets = lastBets;
      result.betTotals = await this.getBetTotals(startPeriod, endPeriod, user);
      result.playerCounts = playerCounts[0] || 0;
    }

    return result;
  }

  private async getLastBets(limit: number, user) {
    const query =
      user.role === "admin" ? {} : { player: { $in: user.players } };

    return Bet.find(query)
      .sort({ date: -1 })
      .limit(limit)
      .populate("player", "username _id")
      .populate({
        path: "data",
        populate: {
          path: "key",
          select: "event_id sport_title commence_time status",
        },
      })
      .exec();
  }

  private async getLastTransactions(limit: number, user) {
    const query: any = {};
    let userId = user._id;
    if (user.role !== "admin") {
      query.$or = [
        { sender: userId },
        { receiver: userId },
        { sender: { $in: user.subordinates } },
        { receiver: { $in: user.subordinates } },
      ];
    }

    return Transaction.find(query)
      .sort({ date: -1 })
      .limit(limit)
      .select("+senderModel +receiverModel")
      .populate("sender", "username")
      .populate("receiver", "username")
      .exec();
  }

  private async getBetTotals(startPeriod: Date, endPeriod: Date, user) {
    const matchCriteria: any = {
      updatedAt: { $gte: startPeriod, $lt: endPeriod },
    };

    if (user.role === "agent") {
      matchCriteria.player = { $in: user.players };
    }

    return Bet.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: null,
          totalPeriod: { $sum: "$amount" },
          countPeriod: { $sum: 1 },
        },
      },
    ]).exec();
  }

  private async getTransactionTotals(startPeriod: Date, endPeriod: Date, user) {
    const matchCriteria: any = {
      date: { $gte: startPeriod, $lte: endPeriod },
    };
    console.log(startPeriod, endPeriod);
    let userId = user._id;
    if (user.role !== "admin") {
      matchCriteria.$or = [
        { sender: { $in: user.subordinates } },
        { receiver: { $in: user.subordinates } },
        { sender: userId },
        { receiver: userId },
      ];
    }

    return Transaction.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: null,
          totalPeriod: { $sum: "$amount" },
          countPeriod: { $sum: 1 },
        },
      },
    ]).exec();
  }

  private async getSubordinateCounts(startPeriod: Date, endPeriod: Date, user) {
    const matchCriteria: any = {
      createdAt: { $gte: startPeriod, $lt: endPeriod },
      role: { $in: ["distributor", "subdistributor", "agent"] },
    };

    if (user.role !== "admin") {
      matchCriteria.createdBy = user._id;
    }

    return User.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: null,
          subordinatesPeriod: { $sum: 1 },
        },
      },
    ]).exec();
  }

  private async getTotalRecharged(startPeriod: Date, endPeriod: Date, user) {
    return Transaction.aggregate([
      {
        $match: {
          type: "recharge",
          date: { $gte: startPeriod, $lt: endPeriod },
        },
      },
      {
        $group: {
          _id: null,
          totalRecharged: { $sum: "$amount" },
        },
      },
    ]).exec();
  }

  private async getTotalRedeemed(startPeriod: Date, endPeriod: Date, user) {
    return Transaction.aggregate([
      {
        $match: { type: "redeem", date: { $gte: startPeriod, $lt: endPeriod } },
      },
      {
        $group: {
          _id: null,
          totalRedeemed: { $sum: "$amount" },
        },
      },
    ]).exec();
  }

  private async getPlayerCounts(startPeriod: Date, endPeriod: Date, user) {
    const matchCriteria: any = {
      createdAt: { $gte: startPeriod, $lt: endPeriod },
    };

    if (user.role === "agent") {
      matchCriteria.createdBy = user._id;
    }

    return Player.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: null,
          playersPeriod: { $sum: 1 },
        },
      },
    ]).exec();
  }
}

export default new UserController();
