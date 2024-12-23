import express from "express";
import adminController from "./adminController";

const adminRoutes = express.Router();

adminRoutes.post("/request-otp", adminController.requestOtp);
adminRoutes.post("/verify-otp", adminController.verifyOtpAndCreateAdmin);

export default adminRoutes;
