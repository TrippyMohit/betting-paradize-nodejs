import createHttpError from "http-errors";
import { NextFunction, Request, Response } from "express";
import Score from "./scoreModel";
import { log } from "console";

class scoreContoller {
    //STEPS
    //-> get eventId from request params
    //->if no eventId in params throw error
    //->match and get eventId with event_id in scorecollection 
   //send response
   async getEventScore(req:Request, res:Response, next:NextFunction){
      try {
        const {eventId} = req.params;
        if(!eventId) throw createHttpError(400, "eventId not found");
        const score = await Score.findOne({
            event_id:eventId
        })
        res.status(200).json(score);
      } catch (error) {
        console.log(error);
        next(error)
      }
   } 
}

export default new scoreContoller();