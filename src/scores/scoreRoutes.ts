import express from "express";
import scoreController from "./scoreController";

const scoreRoutes = express.Router();

scoreRoutes.get("/:eventId", scoreController.getEventScore );
export default scoreRoutes;