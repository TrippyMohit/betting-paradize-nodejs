import express from "express";
import notificationController from "./notificationController";
import { config } from "../config/config";
import jwt from "jsonwebtoken";
import { agents } from "../utils/utils";
import { checkUser } from "../utils/middleware";

const notificationRoutes = express.Router();
notificationRoutes.get("/", checkUser, notificationController.getNotifications);
notificationRoutes.put(
  "/",
  checkUser,
  notificationController.markNotificationViewed
);

//NOTE:
// SSE route to stream notifications to agents
notificationRoutes.get("/sse", checkUser, (req, res) => {
  const origin = req.headers.origin;
  const token = req.headers.authorization.split(" ")[1];

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  // Set the headers for SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const decoded = jwt.verify(token, config.jwtSecret!);
  agents.set(decoded.userId, res);
  // Clean up when the connection is closed
  req.on("close", () => {
    agents.delete(decoded.userId);
    res.end();
  });
});

export default notificationRoutes;
