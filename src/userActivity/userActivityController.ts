import { log } from "console";
import Player from "../players/playerModel";
import DailyActivity, { Activity } from "./userActivityModel"
import createHttpError from "http-errors";
import { NextFunction, Request, Response } from "express";
import Bet from "../bets/betModel";
import Transaction from "../transactions/transactionModel";
import mongoose from "mongoose";

class UserActivityController {

  async createActiviySession(username: string, startTime: Date) {
    try {
      const player = await Player.findOne({ username: username });
      if (!player) {
        throw createHttpError(404, "Player Not Found")
      }

      const newActivitySession = new Activity(
        {
          startTime
        }
      )
      const savedNewActivitySession = await newActivitySession.save();
      const today = new Date();
      today.setHours(0, 0, 0, 0)
      let dailyActivity;
      dailyActivity = await DailyActivity.findOne({
        player: player._id,
        date: today,
      });

      if (!dailyActivity) {
        dailyActivity = new DailyActivity({
          date: today,
          player: player._id,
        })
        await dailyActivity.save();
      }
      const updateDailyActivity = await DailyActivity.findByIdAndUpdate(dailyActivity._id, {
        $push: { actvity: savedNewActivitySession._id },
      },
        { new: true, useFindAndModify: false }
      )
      // console.log(savedNewActivitySession, dailyActivity);

    } catch (error) {
      console.error("Error creating activity:", error.message);
    }
  }

  async endSession(username: string, endTime: Date) {
    try {
      const player = await Player.findOne({ username: username });
      if (!player) {
        throw createHttpError(404, "Player Not Found");
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const dailyActivity = await DailyActivity.findOne({
        date: today,
        player: player._id
      }).populate('actvity');

      if (!dailyActivity || !dailyActivity.actvity) {
        throw createHttpError(404, "No activity found for today.");
      }

      const latestActivitySession: any = dailyActivity.actvity.find((activity: any) => activity.endTime === null);

      if (!latestActivitySession) {
        throw createHttpError(404, "No active session to end.");
      }
      latestActivitySession.endTime = endTime;

      await latestActivitySession.save();

      return { message: "Session ended successfully", endTime };
    } catch (error) {
      throw error;
    }
  }

  async getBetsAndTransactionsInActivitySession(req: Request, res: Response, next: NextFunction) {
    try {
  
      const { startTime, endTime, playerId } = req.body;
      const playerObjectId = new mongoose.Types.ObjectId(playerId);
      const start = new Date(startTime);
      const end = endTime ? new Date(endTime) : new Date();  // Default to current time if endTime is not provided
  
      console.log(start, end, playerId, "here");
  
      const betsAggregation = Bet.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
            player: playerObjectId, 
          },
        },
        {
          $lookup: {
            from: 'players',
            localField: 'player',
            foreignField: '_id',
            as: 'playerDetails',
          },
        },
        {
          $unwind: '$playerDetails',
        },
        {
          $lookup: {
            from: 'betdetails',
            localField: 'data',
            foreignField: '_id',
            as: 'betDetails',
          },
        },
        {
          $project: {
            'playerDetails.username': 1,
            'betDetails.commence_time': 1,
            'betDetails.home_team.name': 1,
            'betDetails.away_team.name': 1,
            amount: 1,
            status: 1,
          },
        },
      ]);
  
      const transactionsAggregation = Transaction.aggregate([
        {
          $match: {
            $and: [
              { date: { $gte: start, $lte: end } }, 
              { 
                $or: [
                  { sender: playerObjectId },
                  { receiver: playerObjectId }, 
                ] 
              }
            ]          }
        },
        {
          $lookup: {
            from: "users",
            localField: "sender",
            foreignField: "_id",
            as: "senderUser",
          },
        },
        {
          $lookup: {
            from: "players",
            localField: "sender",
            foreignField: "_id",
            as: "senderPlayer",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "receiver",
            foreignField: "_id",
            as: "receiverUser",
          },
        },
        {
          $lookup: {
            from: "players",
            localField: "receiver",
            foreignField: "_id",
            as: "receiverPlayer",
          },
        },
        {
          $unwind: {
            path: "$senderUser",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: "$senderPlayer",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: "$receiverUser",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: "$receiverPlayer",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            sender: {
              $cond: {
                if: { $ifNull: ["$senderUser.username", false] },
                then: "$senderUser.username",
                else: "$senderPlayer.username",
              },
            },
            receiver: {
              $cond: {
                if: { $ifNull: ["$receiverUser.username", false] },
                then: "$receiverUser.username",
                else: "$receiverPlayer.username",
              },
            },
            amount: 1,
            type: 1,
            date: 1,
          },
        }
      ]);
  
      const [bets, transactions] = await Promise.all([betsAggregation, transactionsAggregation]);
      // console.log(bets, transactions, "here is the bets and transactions");
      
      return res.status(200).json({ bets, transactions });
  
    } catch (error) {
      // console.log(error, "error");
      next(error);
    }
  };
  





  async getActivitiesByDate(req: Request, res: Response, next: NextFunction) {
    try {
      const { date, playerId, page = 1, limit = 10 } = req.query; 
  
      if (!date) {
        throw createHttpError(400, "Date query parameter is required");
      }
  
      if (!playerId) {
        throw createHttpError(400, "Player ID query parameter is required");
      }
  
      const parsedDate = new Date(date as string);
      if (isNaN(parsedDate.getTime())) {
        throw createHttpError(400, "Invalid date format");
      }
  
      const playerObjectId = new mongoose.Types.ObjectId(playerId as string);
  
      const activities = await DailyActivity.find({
        date: parsedDate,
        player: playerObjectId,
      })
        .skip((Number(page) - 1) * Number(limit)) 
        .limit(Number(limit)) 
        .populate({
          path: 'activity', 
        })
        .populate({
          path: 'player',
          model: 'Player'
        });
  
      const totalActivities = await DailyActivity.countDocuments({
        date: parsedDate,
        player: playerObjectId,
      });
  
      return res.status(200).json({
        totalActivities,
        currentPage: Number(page),
        totalPages: Math.ceil(totalActivities / Number(limit)),
        data:activities,
      });
    } catch (error) {
      console.log(error);
      next(error);
    }
  }
  
  async getAllDailyActivitiesOfAPlayer(req: Request, res: Response, next: NextFunction) {
    try {
      const { player } = req.params;
      const { page = 1, limit = 10 } = req.query; 
  
      const playerDetails = await Player.findOne({ username: player });
      if (!playerDetails) {
        throw createHttpError(404, "Player not found");
      }
  
      
      const getDailyActivitiesOfAPlayer = await DailyActivity.find({ player: playerDetails._id })
        .skip((Number(page) - 1) * Number(limit)) 
        .limit(Number(limit)); 
  
      const totalActivities = await DailyActivity.countDocuments({ player: playerDetails._id });
  
      return res.status(200).json({
        totalActivities,
        currentPage: Number(page),
        totalPages: Math.ceil(totalActivities / Number(limit)),
        data: getDailyActivitiesOfAPlayer,
      });
    } catch (error) {
      next(error);
    }
  }
  
}

export default new UserActivityController()