import express from "express";
import transactionController from "./transactionController";
import { checkUser, verifyRole } from "../utils/middleware";
const transactionRoutes = express.Router();

transactionRoutes.post("/", verifyRole(["admin", "agent", "distributor", "subdistributor"]), transactionController.transaction);
transactionRoutes.get("/", verifyRole(["admin"]), transactionController.getAllTransactions);
transactionRoutes.get("/admin", transactionController.getMonthlyTransactionStats)
transactionRoutes.get("/user",  transactionController.getMonthlyTransactionStatsForUser)
transactionRoutes.get("/:userId", verifyRole(["admin"]), transactionController.getSpecificUserTransactions);
transactionRoutes.get("/:superior/subordinate", transactionController.getSuperiorSubordinateTransaction);
transactionRoutes.get("/:player/players", checkUser, verifyRole(["admin","distributor", "subdistributor", "agent"]), transactionController.getSpecificPlayerTransactions);

export default transactionRoutes;





// import express from "express";
// import { TransactionController } from "./transactionController";
// import { checkUser } from "../utils/middleware";

// const transactionController = new TransactionController();
// const transactionRoutes = express.Router();

// transactionRoutes.get("/all", checkUser, transactionController.getAllTransactions);
// transactionRoutes.get("/", checkUser, transactionController.getTransactions);
// transactionRoutes.get("/:subordinateId", checkUser, transactionController.getTransactionsBySubId);

// export default transactionRoutes;
