import { Server, Socket } from "socket.io";
import { verifySocketToken } from "./socketMiddleware";
import Player from "../players/playerSocket";
import userActivityController from "../userActivity/userActivityController";

export let users: Map<string, Player> = new Map();
export const activeRooms: Set<string> = new Set();
export const eventRooms: Map<string, Set<string>> = new Map();
export const playerBets: Map<string, Set<string>> = new Map();


const socketController = async (io: Server) => {
  // socket authentication middleware
  io.use(async (socket: Socket, next: (err?: Error) => void) => {
    try {
      const decoded = await verifySocketToken(socket);
      (socket as any).decoded = decoded;
      next();
    } catch (error) {
      console.error("Authentication error:", error.message);
      socket.disconnect();
      next(error);
    }
  });

  // Error handling middleware
  io.use((socket: Socket, next: (err?: Error) => void) => {
    socket.on("error", (err: Error) => {
      console.error("Socket Error:", err);
      socket.disconnect(true);
    });
    next();
  });

  io.on("connection", async (socket) => {
    const decoded = (socket as any).decoded;
    if (!decoded || !decoded.username || !decoded.role || !decoded.userId) {
      console.error("Connection rejected: missing required fields in token");
      socket.disconnect(true);
      return;
    }

    const username = decoded.username;
    const existingSocket = users.get(username);
    if (existingSocket) {
      if (existingSocket.socket.connected) {
        socket.emit(
          "AnotherDevice",
          "You are already playing on another browser."
        );
        socket.disconnect(true);
      } else {
        existingSocket.updateSocket(socket);
      }
    } else {
      const newUser = new Player(
        socket,
        decoded.userId,
        username,
        decoded.credits,
        io
      );
      users.set(username, newUser);
      // console.log(`Player ${username} entered the platform.`);
      await userActivityController.createActiviySession(username, new Date(Date.now()))
    }

    socket.on("disconnect", async () => {
      const player = users.get(username);
      if (player) {
        const room = player.currentRoom;
        player.currentRoom = "";
        users.delete(username);
        console.log(`Player ${username} left the platform.`);

        const clients = io.sockets.adapter.rooms.get(room);
        if (!clients || clients.size === 0) {
          activeRooms.delete(room);
          console.log(`Room ${room} removed from activeRooms.`);
        }
        await userActivityController.endSession(username, new Date(Date.now()));


      }

    });
  });

};

export default socketController;
