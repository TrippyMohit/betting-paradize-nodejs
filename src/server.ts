import express from "express";
import cors from "cors";
import { createServer } from "http";
import globalErrorHandler from "./utils/globalHandler";
import userRoutes from "./users/userRoutes";
import adminRoutes from "./admin/adminRoutes";
import subordinateRoutes from "./subordinates/subordinateRoutes";
import { checkUser, verifyApiKey } from "./utils/middleware";
import { Server } from "socket.io";
import socketController from "./socket/socket";
import playerRoutes from "./players/playerRoutes";
import transactionRoutes from "./transactions/transactionRoutes";
import storeRoutes from "./store/storeRoutes";
import betRoutes from "./bets/betRoutes";
import { config } from "./config/config";
import notificationRoutes from "./notifications/notificationRoutes";
import userActivityRoutes from "./userActivity/userActivityRoutes";
import bannerRoutes from "./banner/bannerRoutes";
import scoreRoutes from "./scores/scoreRoutes";
import mongoose from "mongoose";

const app = express();

app.use(
  cors({
    // origin: [`*.${config.hosted_url_cors}`],
    origin: "*",
  })
);

app.use(express.json());

const server = createServer(app);

app.use("/api/auth", userRoutes);
app.use("/api/players", checkUser, playerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/subordinates", checkUser, subordinateRoutes);
app.use("/api/store", checkUser, storeRoutes);
app.use("/api/transactions", checkUser, transactionRoutes);
app.use("/api/bets", checkUser, betRoutes);
app.use("/api/userActivities", checkUser, userActivityRoutes);
app.use("/api/notifications", checkUser, notificationRoutes);
app.use("/api/banner", checkUser, bannerRoutes);
app.use("/api/score", checkUser, scoreRoutes);
app.get("/", (req, res, next) => {
  const health = {
    uptime: process.uptime(),
    message: "OK",
    timestamp: new Date().toLocaleDateString(),
  };
  res.status(200).json(health);
});

app.use(express.static("src"));
app.get("/db-location", async (req, res) => {
  try {
    // Check if the MongoDB connection is ready
    if (!mongoose.connection.readyState) {
      return res.status(500).send(`
        <html>
          <body>
            <h1>Database Connection Error</h1>
            <p>MongoDB connection is not established.</p>
          </body>
        </html>
      `);
    }

    // Access the admin interface and fetch server status
    const admin = mongoose.connection.db.admin();
    const serverStatus = await admin.serverStatus();

    // Extract the region from the "tags" object in the "repl" section
    const region =
      serverStatus?.repl?.tags?.region || "Region information unavailable";

    res.status(200).send(`
      <html>
        <body>
          <h1>Database Region Information</h1>
          <p><strong>Region:</strong> ${region}</p>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`
      <html>
        <body>
          <h1>Error</h1>
          <p>${error.message}</p>
        </body>
      </html>
    `);
  }
});


const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
socketController(io);

app.use(globalErrorHandler);

export { io };
export default server;
