import express from "express";
import Store from "./storeController";

const storeRoutes = express.Router();

//NOTE: for testing 

// storeRoutes.get("/", Store.getRequestCount);
// storeRoutes.get("/sports", async (req, res) => {
//   try {
//
//     const sportName = req.query.sportName as string | undefined;
//     const query = req.query.query as string | undefined;
//     if (sportName === undefined) {
//       return res.status(400).json({ error: "Missing sportName" });
//     }
//     const sports = await Store.searchEvent(sportName, query);
//     return res.json(sports);
//   } catch (err) {
//     console.log(err)
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// });
// storeRoutes.get("/sports/:sport/events", Store.getSportEvents);


export default storeRoutes
