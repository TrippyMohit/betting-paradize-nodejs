import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import { AuthRequest, sanitizeInput } from "../utils/utils";
import mongoose from "mongoose";
import Player from "../players/playerModel";
import bcrypt from "bcrypt";
import { IPlayer } from "./playerType";
import User from "../users/userModel";
import { users } from "../socket/socket";

class PlayerController {
  static saltRounds: Number = 10;

  //CREATE A PLAYER

  async createPlayer(req: Request, res: Response, next: NextFunction) {
    try {
      const { username, password } = req.body;
      const sanitizedUsername = sanitizeInput(username);
      const sanitizedPassword = sanitizeInput(password);

      if (!sanitizedUsername || !sanitizedPassword) {
        throw createHttpError(400, "Username and password are required");
      }

      const _req = req as AuthRequest;
      const { userId, role } = _req.user;
      const creatorId = new mongoose.Types.ObjectId(userId);

      const creator = await User.findById(creatorId);

      if (!creator) {
        throw createHttpError(404, "Creator not found");
      }
      const existingUser = await Player.findOne({ username: username });

      if (existingUser) {
        throw createHttpError(400, "Username already exists");
      }

      const hashedPassword = await bcrypt.hash(
        sanitizedPassword,
        PlayerController.saltRounds
      );

      const newUser = new Player({
        username: sanitizedUsername,
        password: hashedPassword,
        createdBy: creatorId,
      });
      await newUser.save();

      role === "admin"
        ? creator.subordinates.push(
          newUser._id as unknown as mongoose.Schema.Types.ObjectId
        )
        : creator.players.push(
          newUser._id as unknown as mongoose.Schema.Types.ObjectId
        );
      await creator.save();

      res
        .status(201)
        .json({ message: "Player Created Succesfully", player: newUser });
    } catch (error) {
      next(error);
    }
  }

  //GET SPECIFIC PLAYER

  async getPlayer(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { username } = req.query;
      let player;

      if (id) {
        player = await Player.findById(id).select("-password");
      } else if (username) {
        player = await Player.findOne({ username }).select("-password");
      } else {
        throw createHttpError(400, "Player id or username not provided");
      }
      if (!player) {
        throw createHttpError(404, "Player not found");
      }
      res.status(200).json(player);
    } catch (error) {
      next(error);
    }
  }

  //GET ALL PLAYERS

  async getAllPlayers(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 10 } = req.query; 
      const players = await Player.find()
        .skip((+page - 1) * +limit)
        .limit(+limit); 
      const totalPlayers = await Player.countDocuments(); 
  
      res.status(200).json({
        totalPlayers,
        page: +page,
        limit: +limit,
        totalPages: Math.ceil(totalPlayers / +limit),
        data:players,
      });
    } catch (error) {
      next(error);
    }
  }
  
  

  //UPDATE PLAYER

  async updatePlayer(req: Request, res: Response, next: NextFunction) {
    const { username, password, status } = req.body;
    const { id: playerId } = req.params;
  
    try {
      const _req = req as AuthRequest;
      const { userId, role } = _req.user;
  
      const sanitizedUsername = username ? sanitizeInput(username) : undefined;
      const sanitizedPassword = password && password.trim() !== '' 
        ? sanitizeInput(password) 
        : undefined;
      const sanitizedStatus = status ? sanitizeInput(status) : undefined;
  
      // Prepare the update data, only including password if it's provided and non-empty
      const updateData: Partial<IPlayer> = {
        ...(sanitizedUsername && { username: sanitizedUsername }),
        ...(sanitizedPassword && {
          password: await bcrypt.hash(
            sanitizedPassword,
            PlayerController.saltRounds
          ),
        }),
        ...(sanitizedStatus && { status: sanitizedStatus }),
      };
  
      if (role === "agent") {
        const agent = await User.findById(userId);
        if (!agent) {
          throw createHttpError(404, "Agent not found");
        }
  
        const playerExistsInAgent = agent.players.some(
          (player: mongoose.Schema.Types.ObjectId) =>
            player.toString() === playerId
        );
  
        if (!playerExistsInAgent) {
          throw createHttpError(
            401,
            "You are not authorized to update this player"
          );
        }
  
        const player = await Player.findById(playerId);
        if (!player) {
          throw createHttpError(404, "Player not found");
        }
      } else if (role === "admin") {
        const player = await Player.findById(playerId);
        if (!player) {
          throw createHttpError(404, "Player not found");
        }
      } else {
        throw createHttpError(
          403,
          "You do not have permission to update players"
        );
      }
  
      const updatedPlayer = await Player.findByIdAndUpdate(
        playerId,
        updateData,
        {
          new: true,
        }
      );
  
      if (!updatedPlayer) {
        throw createHttpError(404, "Player not found");
      }
  
      // Notify player via socket if their status is updated
      const playerSocket = users.get(updatedPlayer?.username);
      if (playerSocket) {
        playerSocket.sendMessage({
          type: "STATUS",
          payload: updatedPlayer.status === "active" ? true : false,
          message: "",
        });
      }
  
      res.status(200).json({
        message: "Player updated successfully",
        data: updatedPlayer,
      });
    } catch (error) {
      next(error);
    }
  }

  //DELETE A PLAYER

  async deletePlayer(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;
    try {
      const _req = req as AuthRequest;
      const { userId: idUser, role } = _req.user;
      const userId = new mongoose.Types.ObjectId(_req?.user?.userId);
      const agent = await User.findById(userId);
      const admin = await User.findById(userId);
      if (!admin) {
        throw createHttpError(401, "You are not authorized");
      }
      if (role === "agent") {
        const player = await Player.findById(id);
        const objectUserId: mongoose.Schema.Types.ObjectId =
          new mongoose.Schema.Types.ObjectId(idUser);
        if (player.createdBy !== objectUserId) {
          throw createHttpError(401, "You Are Not Authorised!");
        }
      }

      const deletedPlayer = await Player.findByIdAndDelete(id);
      if (!deletedPlayer) {
        throw createHttpError(404, "Player not found");
      }

      if (agent) {
        agent.players = agent.players.filter(
          (playerId) => playerId.toString() !== id
        );
        await agent.save();
      }

      res.status(200).json({ message: "Player deleted successfully", data:deletedPlayer });
    } catch (error) {
      next(error);
    }
  }
}

export default new PlayerController();
