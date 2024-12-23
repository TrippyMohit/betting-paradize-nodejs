import express from "express";
import { checkUser, verifyRole } from "../utils/middleware";
import BannerController from "./bannerController";
import multer from "multer";

const bannerRoutes = express.Router();
const bannerController = new BannerController();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 * 1024 },
});
bannerRoutes.post(
  "/",
  verifyRole(["admin"]),
  upload.fields([{ name: "banner" }]),
  bannerController.addBanner
);
bannerRoutes.get("/", checkUser, bannerController.getBanners);
bannerRoutes.put("/", verifyRole(["admin"]), bannerController.updateBanner);
bannerRoutes.delete("/", verifyRole(["admin"]), bannerController.deleteBanner);
bannerRoutes.get(
  "/category",
  verifyRole(["admin"]),
  bannerController.getCategory
);

export default bannerRoutes;