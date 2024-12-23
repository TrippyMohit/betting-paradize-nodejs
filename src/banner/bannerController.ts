import { Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";
import { config } from "../config/config";
import cloudinary from "cloudinary";
import Banner from "./bannerModel";
import mongoose from "mongoose";
import storeController from "../store/storeController";

cloudinary.v2.config({
  cloud_name: config.cloud_name,
  api_key: config.api_key,
  api_secret: config.api_secret,
});

interface BannerRequest extends Request {
  files?: {
    [fieldname: string]: Express.Multer.File[];
  };
}

class BannerController {
  public async getCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await storeController.getCategories();
      const categoryData = data.map((item) => item.category);
      res.status(200).json(categoryData);
    } catch (err) {
      next(err);
    }
  }
  public async getBanners(req: Request, res: Response, next: NextFunction) {
    try {
      const { category, status } = req.query;
      console.log(req.query);
      const banners = await Banner.find({
        category: category,
        status: status === "active" ? true : false,
      });
      res.status(200).json({ banners: banners });
    } catch (err) {
      next(err);
    }
  }

  public async addBanner(
    req: BannerRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      let bannerUploadResult: cloudinary.UploadApiResponse | undefined;
      const bannerBuffer = req.files.banner[0].buffer;
      const { category, title } = req.body;
      const categories = JSON.parse(category);

      console.log("data", req.body);

      bannerUploadResult = await new Promise<cloudinary.UploadApiResponse>(
        (resolve, reject) => {
          cloudinary.v2.uploader
            .upload_stream(
              { resource_type: "image", folder: config.cloud_folder },
              (error, result) => {
                if (error) {
                  return reject(error);
                }
                resolve(result as cloudinary.UploadApiResponse);
              }
            )
            .end(bannerBuffer);
        }
      );

      if (!bannerUploadResult || !bannerUploadResult.secure_url) {
        throw new Error("Image upload failed");
      }

      const newBanner = new Banner({
        url: bannerUploadResult.secure_url,
        category: categories,
        status: true,
        title: title,
      });
      await newBanner.save();
      res.status(200).json({
        message: "Banner uploaded and saved successfully",
      });
    } catch (err) {
      next(err);
    }
  }
  public async updateBanner(req: Request, res: Response, next: NextFunction) {
    try {
      const { banners, status } = req.body;
      for (const banner of banners) {
        const bannerId = new mongoose.Types.ObjectId(banner);
        const updateBanner = await Banner.findByIdAndUpdate(bannerId, {
          status: status === "active" ? true : false,
        });
        if (!updateBanner) {
          throw createHttpError(400, "Can't find the banner to update");
        }
      }
      res.status(200).json({ message: "Banner updated succesfully" });
    } catch (err) {
      next(err);
    }
  }
  public async deleteBanner(req: Request, res: Response, next: NextFunction) {
    try {
      const { banners } = req.body;

      for (const banner of banners) {
        const bannerId = new mongoose.Types.ObjectId(banner);
        const bannerData = await Banner.findById(bannerId);

        if (!bannerData) {
          throw createHttpError(404, "Banner not found in database");
        }

        const imageId = bannerData.url.split("/").pop()?.split(".")[0];
        const publicId = `${config.cloud_folder}/${imageId}`;

        const cloudinaryResult = await new Promise((resolve, reject) => {
          cloudinary.v2.uploader.destroy(publicId, (destroyError, result) => {
            if (destroyError) {
              return reject(
                createHttpError(400, "Error deleting image from Cloudinary")
              );
            }
            resolve(result);
          });
        });

        const deletedBanner = await Banner.findByIdAndDelete(bannerId);

        if (!deletedBanner) {
          throw createHttpError(400, "Banner not found in database");
        }
      }
      res.status(200).json({ message: "Banners deleted successfully" });
    } catch (err) {
      next(err);
    }
  }
}

export default BannerController;