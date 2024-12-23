import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import bcrypt from "bcrypt";
import {
  AuthRequest,
  hasPermission,
  rolesHierarchy,
  sanitizeInput,
} from "../utils/utils";
import mongoose from "mongoose";
import { IAgent } from "./agentType";
import User from "../users/userModel";
import Player from "../players/playerModel";

class SubordinateController {
  static saltRounds: Number = 10;
  static readonly roles = Object.freeze([
    "all",
    "distributor",
    "subdistributor",
    "agent",
    "player",
  ]);
  //CREATE SUBORDINATE

  async createSubordinate(req: Request, res: Response, next: NextFunction) {
    try {
      //INPUT

      const { username, password, role } = req.body;

      const sanitizedUsername = sanitizeInput(username);
      const sanitizedPassword = sanitizeInput(password);
      const sanitizedRole = sanitizeInput(role);

      if (!sanitizedUsername || !sanitizedPassword || !sanitizedRole)
        throw createHttpError(400, "Username, password and role are required");

      //SUPERIOR USER OR CREATOR

      const _req = req as AuthRequest;
      const { userId, role: requestingUserRole } = _req.user;
      const superior = await User.findById(userId);
      if (!superior) throw createHttpError(401, "Unauthorized");

      // PERMISSION CHECK

      const hasPermissionToCreate = () => {
        console.log(requestingUserRole);

        const allowedRoles = rolesHierarchy[requestingUserRole];
        if (requestingUserRole === superior.role)
          return allowedRoles.includes(sanitizedRole);
        return false;
      };

      if (!hasPermissionToCreate())
        throw createHttpError(403, "YOU DON'T HAVE PERMISSION");

      //CREATE
      let existingSubordinate: any;

      if (sanitizedRole === "player") {
        existingSubordinate = await Player.findOne({
          username: sanitizedUsername,
        });
      } else {
        existingSubordinate = await User.findOne({
          username: sanitizedUsername,
        });
      }
      if (existingSubordinate) {
        throw createHttpError(400, "username already exists");
      }
      const hashedPassword = await bcrypt.hash(
        sanitizedPassword,
        SubordinateController.saltRounds
      );

      let newSubordinate: any;

      if (sanitizedRole === "player") {
        newSubordinate = new Player({
          username: sanitizedUsername,
          password: hashedPassword,
          role: sanitizedRole,
          createdBy: userId,
        });
      } else {
        newSubordinate = new User({
          username: sanitizedUsername,
          password: hashedPassword,
          role: sanitizedRole,
          createdBy: userId,
        });
      }
      await newSubordinate.save();

      if (sanitizedRole === "player") {
        console.log("playet");
        console.log();

        superior.players.push(
          newSubordinate._id as unknown as mongoose.Schema.Types.ObjectId
        );
      } else {
        superior.subordinates.push(
          newSubordinate._id as unknown as mongoose.Schema.Types.ObjectId
        );
      }
      await superior.save();

      //RESPONSE

      res.status(201).json({
        message: `${role} Created Succesfully`,
        Subordinate: newSubordinate,
      });
    } catch (error) {
      next(error);
    }
  }

  //GET SPECIFC SUBORDINATE DETAILS

  async getSubordinate(req: Request, res: Response, next: NextFunction) {
    const { username } = req.params;
    const _req = req as AuthRequest;
    const { userId, role } = _req.user;

    try {
      const requestingUser = await User.findById(userId);
      if (!requestingUser) {
        throw createHttpError(404, "User Not Found");
      }
      const subordinatesofRequestingUser = requestingUser.subordinates || [];
      const players = requestingUser.players || [];
      const sanitizedUsername = sanitizeInput(username);
      const subordinate: any =
        (await User.findOne({ username: sanitizedUsername }).select(
          "-transactions -password"
        )) ||
        (await Player.findOne({ username: sanitizedUsername }).select(
          "-betHistory -transactions -password"
        ));

      if (!subordinate) {
        throw createHttpError(404, "User not found");
      }
      if (
        role !== "admin" &&
        requestingUser?.username !== username &&
        !subordinatesofRequestingUser.includes(subordinate._id) &&
        !players.includes(subordinate._id)
      ) {
        throw createHttpError(401, "Unauthorized!");
      }

      res.status(200).json(subordinate);
    } catch (error) {
      next(error);
    }
  }

  //GET ALL SUBORDINATES  (ADMIN SPECIFC)

  async getAllSubordinates(req: Request, res: Response, next: NextFunction) {
    try {
      const { type, search, date, page = 1, limit = 10 } = req.query; // Default to page 1 and limit 10
      const _req = req as AuthRequest;
      const { userId } = _req.user;
  
      const admin = await User.findById(userId);
      if (!admin) throw createHttpError(401, "You are Not Authorized");
  
      let pipeline: any[] = [];
  
      if (type === "all") {
        pipeline.push({
          $unionWith: {
            coll: "players",
            pipeline: [
              {
                $project: {
                  _id: 1,
                  username: 1,
                  role: { $literal: "player" },
                  status: 1,
                  credits: 1,
                  createdAt: 1,
                },
              },
            ],
          },
        });
      } else if (type === "player") {
        pipeline.push(
          {
            $lookup: {
              from: "players",
              pipeline: [
                {
                  $project: {
                    _id: 1,
                    username: 1,
                    role: { $literal: "player" },
                    status: 1,
                    credits: 1,
                    createdAt: 1,
                  },
                },
              ],
              as: "players",
            },
          },
          {
            $unwind: "$players",
          },
          {
            $replaceRoot: { newRoot: "$players" },
          }
        );
      } else {
        pipeline.push({
          $match: { role: type },
        });
      }
  
      if (search) {
        pipeline.push({
          $match: {
            username: { $regex: new RegExp(search as string, "i") },
          },
        });
      }
  
      if (date) {
        const filterDate = new Date(date as string);
        pipeline.push({
          $match: {
            createdAt: {
              $gte: new Date(filterDate.setHours(0, 0, 0, 0)),
              $lt: new Date(filterDate.setHours(23, 59, 59, 999)),
            },
          },
        });
      }
  
      pipeline.push({
        $group: {
          _id: "$_id",
          username: { $first: "$username" },
          role: { $first: "$role" },
          status: { $first: "$status" },
          credits: { $first: "$credits" },
          createdAt: { $first: "$createdAt" },
        },
      });
  
      // Add sorting
      pipeline.push({
        $sort: { createdAt: -1 },
      });
  
      // Add pagination (skip and limit)
      pipeline.push(
        { $skip: (+page - 1) * +limit },
        { $limit: +limit }
      );
  
      // Perform aggregation
      const results = await User.aggregate(pipeline);
  
      // Get the total count without pagination for calculating total pages
      const totalResults = await User.aggregate([
        ...pipeline.slice(0, -2), // Run the same pipeline without skip and limit to get total count
        { $count: "total" },
      ]);
  
      const totalSubordinates = totalResults.length ? totalResults[0].total : 0;
  
      res.status(200).json({
        totalSubordinates,
        page: +page,
        limit: +limit,
        totalPages: Math.ceil(totalSubordinates / +limit),
        data:results,
      });
    } catch (error) {
      console.log(error);
      next(error);
    }
  }
  

  //UPDATE USER (SUBORDINATES)

  async updateSubordinate(req: Request, res: Response, next: NextFunction) {
    const { username, password, status } = req.body;
    const { id } = req.params;

    try {
      //INPUT

      const sanitizedUsername = username ? sanitizeInput(username) : undefined;
      const sanitizedPassword = password ? sanitizeInput(password) : undefined;
      const sanitizedStatus = status ? sanitizeInput(status) : undefined;

      const _req = req as AuthRequest;
      const { userId, role } = _req.user;

      // PERMISSION CHECK

      const hasPermissionToUpadte = await hasPermission(userId, id, role);

      if (!hasPermissionToUpadte) {
        throw createHttpError(
          403,
          "You do not have permission to update this user."
        );
      }

      //UPDATE

      const updateData: Partial<Record<keyof IAgent, any>> = {
        ...(sanitizedUsername && { username: sanitizedUsername }),
        ...(sanitizedPassword && {
          password: await bcrypt.hash(
            sanitizedPassword,
            SubordinateController.saltRounds
          ),
        }),
        ...(sanitizedStatus && { status: sanitizedStatus }),
      };
      const updateSubordinate = await User.findByIdAndUpdate(id, updateData, {
        new: true,
      });

      if (!updateSubordinate) {
        throw createHttpError(404, "User not found");
      }

      res.status(200).json({
        message: "User updated successfully",
        data: updateSubordinate,
      });
    } catch (error) {
      console.log(error);

      next(error);
    }
  }

  //DELETE SUBORDINATE

  async deleteSubordinate(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;
    try {
      const _req = req as AuthRequest;
      const { userId, role } = _req.user;
      const superior = await User.findById(userId);
      if (!superior) throw createHttpError(401, "Unauthorized");

      //PERMISSION CHECK

      const hasPermissionToDelete = await hasPermission(userId, id, role);
      if (!hasPermissionToDelete)
        throw createHttpError(
          401,
          "You do not have permission to delete this user"
        );

      //DELETE

      const deleteSubordinate = await User.findByIdAndDelete(id);
      if (!deleteSubordinate) throw createHttpError(404, "Unable to Delete");

      //REMOVING SUBORDINATE REFERENCE FROM SUPERIOR

      superior.subordinates = superior.subordinates.filter(
        (superiorId) => superiorId.toString() !== id
      );

      await superior.save();

      res.status(200).json({ message: "User deleted successfully"  , data:deleteSubordinate});
    } catch (error) {
      next(error);
    }
  }

  //GET SUBORDINATE UNDER SUPERIOR

  async getSubordinatessUnderSuperior(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { superior } = req.params;
      const { type, search, date, page = 1, limit = 10 } = req.query; // Default to page 1 and limit 10
  
      const _req = req as AuthRequest;
      const { userId } = _req.user;
  
      let requestingUser = await User.findById(userId);
      let subordinatesofRequestingUser = requestingUser.subordinates || [];
      let players = requestingUser.players || [];
      let superiorUser: any;
  
      // GETTING SUBORDINATE BASED ON QUERY TYPE (username, id)
      if (type === "id") {
        superiorUser = await User.findById(superior).select(
          "-password -transactions"
        );
        if (!superiorUser) {
          throw createHttpError(404, "Superior user not found");
        }
  
        if (
          requestingUser.role !== "admin" &&
          requestingUser?._id?.toString() !== superior &&
          !subordinatesofRequestingUser.includes(superiorUser._id) &&
          !players.includes(superiorUser._id)
        ) {
          throw createHttpError(401, "Not Authorised");
        }
  
        if (superiorUser.role === "agent") {
          superiorUser = await User.findById(superior).populate({
            path: "players",
            select: "-password",
          });
        } else {
          superiorUser = await User.findById(superior).populate({
            path: "subordinates players",
            select: "-password",
          });
        }
  
        if (!superiorUser) throw createHttpError(404, "User Not Found");
      } else if (type === "username") {
        superiorUser = await User.findOne({ username: superior }).select(
          "-password -transactions"
        );
        if (!superiorUser) {
          throw createHttpError(404, "Superior user not found");
        }
  
        if (
          requestingUser.role !== "admin" &&
          requestingUser?.username !== superior &&
          !subordinatesofRequestingUser.includes(superiorUser._id) &&
          !players.includes(superiorUser._id)
        ) {
          throw createHttpError(401, "Not Authorised");
        }
  
        superiorUser = await User.findOne({ username: superior }).populate({
          path: "subordinates players",
          select: "-password",
        });
  
        if (!superiorUser) {
          throw createHttpError(404, "User Not Found with the provided username");
        }
      } else {
        throw createHttpError(400, "User Id or Username not provided");
      }
  
      // ACCESS SUBORDINATES DEPENDING ON ROLE
      let subordinates =
        superiorUser.role === "admin"
          ? [...superiorUser.subordinates, ...superiorUser.players]
          : superiorUser.role === "agent"
          ? superiorUser.players
          : superiorUser.subordinates;
  
      // Search filter
      if (search) {
        const regex = new RegExp(search as string, "i"); // Case-insensitive search
        subordinates = subordinates.filter((subordinate: any) =>
          regex.test(subordinate.username)
        );
      }
  
      // Date filter
      if (date) {
        const filterDate = new Date(date as string);
        filterDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(filterDate);
        nextDay.setDate(filterDate.getDate() + 1);
        subordinates = subordinates.filter((subordinate) => {
          const createdAt = new Date(subordinate.createdAt);
          return createdAt >= filterDate && createdAt < nextDay;
        });
      }
  
      // Pagination logic
      const totalSubordinates = subordinates.length;
      const paginatedSubordinates = subordinates.slice(
        (+page - 1) * +limit,
        +page * +limit
      );
  
      return res.status(200).json({
        totalSubordinates,
        page: +page,
        limit: +limit,
        totalPages: Math.ceil(totalSubordinates / +limit),
        data: paginatedSubordinates,
      });
    } catch (error) {
      console.log(error);
      next(error);
    }
  }
  
}

export default new SubordinateController();
