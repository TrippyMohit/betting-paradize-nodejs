import jwt from "jsonwebtoken";
import { Socket } from "socket.io";
import { SocketToken } from "../utils/utils";
import Player from "../players/playerModel";
import { config } from "../config/config";

export const verifySocketToken = async (
  socket: Socket
): Promise<SocketToken> => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      throw new Error("No authentication token provided");
    }

    const decoded = await jwt.verify(
      token,
      config.jwtSecret,
      (err, decoded) => {
        if (err) {
          console.error("Token verification failed:", err.message);
          throw new Error(err);
        } else {
          if (decoded?.role === "player") {
            return decoded;
          } else {
            throw new Error("Only users with role players are allowed here");
          }
        }
      }
    );

    if (!decoded || !decoded.username) {
      throw new Error("Token does not contain required fields");
    }

    const player = await Player.findOne({ username: decoded.username });

    if (!player) {
      throw new Error("Player not found");
    }

    return { ...decoded, userId: player._id, credits: player.credits } as SocketToken;
  } catch (error) {
    console.error("Error in token verification:", error.message);
    throw new Error("You are not authenticated");
  }
};
