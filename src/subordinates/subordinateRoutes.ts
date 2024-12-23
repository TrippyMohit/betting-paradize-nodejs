import express from "express";
import subordinateController from "./subordinateController";
import { verifyRole } from "../utils/middleware";

const subordinatesRoutes = express.Router();
subordinatesRoutes.post("/", subordinateController.createSubordinate);

subordinatesRoutes.get("/", verifyRole(["admin"]), subordinateController.getAllSubordinates);

subordinatesRoutes.get("/:username",  subordinateController.getSubordinate);

subordinatesRoutes.get("/:superior/subordinates",verifyRole(["admin", "distributor", "subdistributor", "agent"]), subordinateController.getSubordinatessUnderSuperior);

subordinatesRoutes.put("/:id",  subordinateController.updateSubordinate);

subordinatesRoutes.delete("/:id",  subordinateController.deleteSubordinate);

export default subordinatesRoutes;
