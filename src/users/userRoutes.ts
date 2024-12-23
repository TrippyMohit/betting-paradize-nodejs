import express, { Router } from "express";
import userController from "./userController";

import { checkUser, loginRateLimiter, verifyRole } from "../utils/middleware";
import notificationController from "../notifications/notificationController";

const userRoutes = express.Router();

userRoutes.get("/", checkUser, userController.getCurrentUser)
userRoutes.get("/captcha", userController.getCaptcha);
userRoutes.post("/login", userController.login)
userRoutes.get("/summary/:id", checkUser, verifyRole(["agent", "admin", "distributor", "subdistributor"]), userController.getSummary);
userRoutes.get("/createdUser", checkUser, verifyRole(["agent", "admin", "distributor", "subdistributor"]), userController.getCreatedUsersAndPlayersByMonth);

// userRoutes.get("/notifications", checkUser, userController.getNotifications);




export default userRoutes;


