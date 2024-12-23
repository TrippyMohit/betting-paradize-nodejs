import express from "express";
import { verifyRole } from "../utils/middleware";
import userActivityController from "./userActivityController";

const userActivityRoutes = express.Router();
userActivityRoutes.get("/", verifyRole(["admin"]), userActivityController.getActivitiesByDate);
userActivityRoutes.get("/:player", verifyRole(["admin"]), userActivityController.getAllDailyActivitiesOfAPlayer);
userActivityRoutes.post("/", userActivityController.getBetsAndTransactionsInActivitySession)

export default userActivityRoutes;