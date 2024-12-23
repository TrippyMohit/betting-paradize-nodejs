import { parentPort } from "worker_threads";
import mongoose from "mongoose";
import Store from "../store/storeController";
import Bet, { BetDetail } from "../bets/betModel";
import { dequeue, getAll, removeItem, size } from "../utils/ProcessingQueue";
import { config } from "../config/config";
import Player from "../players/playerModel";
import { redisClient } from "../redisclient";
import { IBet, IBetDetail } from "../bets/betsType";
import { BETTYPE } from "../utils/utils";
import Score from "../scores/scoreModel";


class ProcessingQueueWorker {
  private redisClient: typeof redisClient;

  constructor() {
    this.redisClient = redisClient;
    this.connectDB()
  }

  async connectDB(): Promise<void> {
    try {
      mongoose.connection.on("connected", async () => {
        console.log("Connected to database successfully");
      });

      mongoose.connection.on("error", (err) => {
        console.log("Error in connecting to database.", err);
      });

      await mongoose.connect(config.databaseUrl as string);
    } catch (err) {
      console.error("Failed to connect to database.", err);
      process.exit(1);
    }
  }

  async startWorker(): Promise<void> {
    console.log("Processing Queue Worker Started")

    while (true) {
      try {
        this.redisClient.publish('live-update', 'true')
        await this.processBetsFromQueue()
      } catch (error) {
        console.error("Error Processing Queue Worker:", error);
      }

      await new Promise((resolve) => setTimeout(resolve, 30000));
    }
  }

  async processBetsFromQueue(): Promise<void> {
    let bets: IBetDetail[] = [];
    const sports = new Set<string>();

    try {
      const betQueue: string[] = await getAll();
      const parsedBetQueue: IBetDetail[] = betQueue.map((bet: string) => JSON.parse(bet));



      if (Array.isArray(parsedBetQueue)) {
        for (const bet of parsedBetQueue) {
          if (bet && bet.sport_key) {
            if (bet.status === "pending") {
              bets.push(bet);
              sports.add(bet.sport_key);
            }
            else {
              await removeItem(JSON.stringify(bet));
            }
          }
        }

        const sportKeys = Array.from(sports);

        if (bets.length > 0) {
          await this.processBets(sportKeys, bets);
        } else {
          console.log("Nothing to process in processing queue");
        }
      } else {
        console.log("No bets found in the queue");
      }
    } catch (error) {
      console.error('Error fetching or processing queue data:', error);
    }
  }

  async processBets(sportKeys: string[], bets: IBetDetail[]): Promise<void> {
    try {
      for (const sport of sportKeys) {
        const scoresData = await Store.getScoresForProcessing(sport, "3", "iso");

        if (!scoresData) {
          continue;
        }

        const { completedGames } = scoresData;
        console.log("COMPLETED GAMES : ", completedGames);


        for (const game of completedGames) {
          const betsToBeProcess = bets.filter((b) => b.event_id === game.id);

          if (betsToBeProcess.length > 0) {
            for (const bet of betsToBeProcess) {
              try {
                await this.processCompletedBet(bet._id, game);
                await removeItem(JSON.stringify(bet))
              } catch (error) {
                const parentBet = await Bet.findById(bet.key);

                if (parentBet) {
                  await Bet.findByIdAndUpdate(parentBet._id, { isResolved: false });
                  console.log(`Parent Bet with ID ${parentBet._id} marked as unresolved due to an error in processing bet detail.`);
                } else {
                  console.error(`Parent bet not found for bet detail ID ${bet._id}.`);
                }

                await removeItem(JSON.stringify(bet))
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error during bet processing:", error);
    }
  }

  async processCompletedBet(betDetailId: mongoose.Types.ObjectId, gameData: any): Promise<void> {
    const maxRetries = 3;
    let retryCount = 0;
    let currentBetDetail: IBetDetail | null = null;


    while (retryCount < maxRetries) {
      try {
        currentBetDetail = await BetDetail.findById(betDetailId);

        if (!currentBetDetail) {
          console.error("BetDetail not found after migration:", betDetailId);
          return;
        }

        await Score.findOneAndUpdate(
          { event_id: gameData.id },
          {
            event_id: gameData.id,
            teams: gameData.scores,
            completed: gameData.completed,
          },
          { upsert: true, new: true }
        );

        const parentBet: IBet = await Bet.findById(currentBetDetail.key);
        if (!parentBet) {
          return;
        }

        const playerId = parentBet.player.toString();
        const player = await Player.findById(playerId);
        if (!player) {
          return;
        }

        const agentId = player.createdBy.toString();

        let result: "won" | "lost" | "draw" | "pending" | "failed";

        switch (currentBetDetail.category) {
          case BETTYPE.H2H:
            result = this.checkH2HBetResult(currentBetDetail, gameData);
            break;

          case BETTYPE.SPREAD:
            result = this.checkSpreadBetResult(currentBetDetail, gameData);
            break;

          case BETTYPE.TOTAL:
            result = this.checkTotalsBetResult(currentBetDetail, gameData);
            break;
          case BETTYPE.OUTRIGHT:
            result = this.checkOutrightsBetResult(currentBetDetail, gameData);
            break;
          default:
            console.error(`Unknown bet category: ${currentBetDetail.category}`);
            return;
        }

        if (result === "pending" || result === "failed") {
          console.log(`Bet is ${result} for BetDetail ID ${currentBetDetail._id}`);
          return;
        }

        currentBetDetail.status = result;
        currentBetDetail.isResolved = true;
        await currentBetDetail.save();
        console.log(`BetDetail with ID ${currentBetDetail._id} updated to '${result}'`);

        await this.checkAndUpdateParentBet(parentBet, player, agentId);
        break;

      } catch (error) {
        console.error("Error during processing, retrying...", error);

        if (currentBetDetail) {
          await BetDetail.findByIdAndUpdate(betDetailId, {
            status: 'failed',
            isResolved: false,
          });
        }

        retryCount++;
        if (retryCount >= maxRetries) {
          await removeItem(JSON.stringify(currentBetDetail));

          if (currentBetDetail) {
            const parentBet = await Bet.findByIdAndUpdate(currentBetDetail.key, { status: 'failed', isResolved: false });
            const player = await Player.findById(parentBet.player);

            await this.publishRedisNotification(
              "BET_FAILED",
              player._id.toString(),
              player.username,
              player.createdBy.toString(),
              parentBet._id.toString(),
              `Bet failed! We have raised a ticket to your agent. You can contact your agent for further assistance.`,
              `Player ${player.username}'s bet has failed. Please resolve the bet as soon as possible.`
            );
            console.log(`Parent Bet with ID ${currentBetDetail.key} marked as 'failed' due to processing issue.`);
          }
          throw error;
        }
      }
    }
  }

  async checkAndUpdateParentBet(parentBet: IBet, player: any, agentId: string): Promise<void> {
    const updatedBetDetails = await BetDetail.find({ _id: { $in: parentBet.data } });

    const anyBetLost = updatedBetDetails.some(detail => detail.status === 'lost');
    const anyBetFailed = updatedBetDetails.some(detail => detail.status === 'failed');
    const anyBetDrawn = updatedBetDetails.some(detail => detail.status === 'draw');
    const betOnDrawn = updatedBetDetails.every(detail => detail.bet_on.name === 'Draw');

    if (anyBetLost) {
      await Bet.findByIdAndUpdate(parentBet._id, { status: 'lost', isResolved: true });
      await this.publishRedisNotification(
        "BET_LOST",
        player._id.toString(),
        player.username,
        agentId,
        parentBet._id.toString(),
        `Unfortunately, you lost your bet (ID: ${parentBet._id}). Better luck next time!`,
        `A player's bet (ID: ${parentBet._id}) has lost. Please review the details.`
      );
      return;
    }

    if (anyBetFailed) {
      await Bet.findByIdAndUpdate(parentBet._id, { status: 'failed', isResolved: false });
      await this.publishRedisNotification(
        "BET_FAILED",
        player._id.toString(),
        player.username,
        agentId,
        parentBet._id.toString(),
        `Bet failed! We have raised a ticket to your agent. You can contact your agent for further assistance.`,
        `Player ${player.username}'s bet has failed. Please resolve the bet as soon as possible.`
      );
      return;
    }
    if (anyBetDrawn && !betOnDrawn) {
      await Bet.findByIdAndUpdate(parentBet._id, { status: 'lost', isResolved: true });
      await this.publishRedisNotification(
        "BET_LOST",
        player._id.toString(),
        player.username,
        agentId,
        parentBet._id.toString(),
        `Unfortunately, you lost your bet (ID: ${parentBet._id}). Better luck next time!`,
        `A player's bet (ID: ${parentBet._id}) has lost. Please review the details.`
      );
      return;
    }
    const allBetsWon = updatedBetDetails.every(detail => detail.status === 'won');
    const allBetsDrawn = updatedBetDetails.every(detail => detail.status === 'draw');

    if (allBetsWon) {
      await Bet.findByIdAndUpdate(parentBet._id, { status: 'won', isResolved: true });
      await this.awardWinningsToPlayer(parentBet.player, parentBet.possibleWinningAmount);
      await this.publishRedisNotification(
        "BET_WON",
        player._id.toString(),
        player.username,
        agentId,
        parentBet._id.toString(),
        `Congratulations! Bet with ID ${parentBet._id} has won. You have been awarded $${parentBet.possibleWinningAmount}.`,
        `Player ${player.username} has won the bet with ID ${parentBet._id}, and the winnings of $${parentBet.possibleWinningAmount} have been awarded.`
      );
    } else if (allBetsDrawn && betOnDrawn) {
      await Bet.findByIdAndUpdate(parentBet._id, { status: 'draw', isResolved: true });
      await this.awardWinningsToPlayer(parentBet.player, parentBet.possibleWinningAmount);
      await this.publishRedisNotification(
        "BET_DRAWN",
        player._id.toString(),
        player.username,
        agentId,
        parentBet._id.toString(),
        `Congratulations! Bet with ID ${parentBet._id} has drawn. You have been awarded $${parentBet.possibleWinningAmount}.`,
        `Player ${player.username} has won the bet with ID ${parentBet._id}, and the winnings of $${parentBet.possibleWinningAmount} have been awarded.`
      );
    }
    else {
      await Bet.findByIdAndUpdate(parentBet._id, { isResolved: false });
      console.log(`Parent Bet with ID ${parentBet._id} has not been resolved.`);
    }
  }

  async awardWinningsToPlayer(playerId: mongoose.Schema.Types.ObjectId, possibleWinningAmount: number): Promise<void> {
    try {
      // Find the player and update their balance
      const player = await Player.findById(playerId);

      if (!player) {
        console.log(`Player with ID ${playerId} not found.`);
        return;
      }

      // Add the possible winning amount to the player's balance
      player.credits += possibleWinningAmount;

      // Save the updated player data
      await player.save();

      console.log(`Awarded ${possibleWinningAmount} to player with ID ${player._id}`);
    } catch (error) {
      console.error("Error updating player's balance:", error);
    }
  }

  checkH2HBetResult(betDetail: IBetDetail, gameData: any): "won" | "lost" | "draw" | "pending" | "failed" {
    const betOnTeam = betDetail.bet_on.name;

    if (!gameData.completed) {
      return "pending";
    }

    const homeTeamName = gameData.home_team;
    const awayTeamName = gameData.away_team;

    const homeTeamScore = gameData.scores.find((team: any) => team.name === homeTeamName)?.score;
    const awayTeamScore = gameData.scores.find((team: any) => team.name === awayTeamName)?.score;

    if (homeTeamScore === undefined || awayTeamScore === undefined) {
      return "failed";
    }

    if (homeTeamScore === awayTeamScore) {
      return betOnTeam === "draw" ? "won" : "draw";
    }

    const gameWinner = homeTeamScore > awayTeamScore ? homeTeamName : awayTeamName;
    return betOnTeam === gameWinner ? "won" : "lost";
  }

  checkSpreadBetResult(betDetail: IBetDetail, gameData: any): "won" | "lost" | "draw" | "pending" | "failed" {
    const spreadLine = betDetail.bet_on.points;
    const betOnTeam = betDetail.bet_on.name;
    const isFavorite = spreadLine < 0;

    if (!gameData.completed) {
      return "pending"
    }

    const homeTeamName = gameData.home_team;
    const awayTeamName = gameData.away_team;

    const homeTeamScore = gameData.scores.find((team: any) => team.name === homeTeamName)?.score;
    const awayTeamScore = gameData.scores.find((team: any) => team.name === awayTeamName)?.score;

    if (homeTeamScore == null || awayTeamScore == null) {
      return "failed";
    }

    const scoreDifference = homeTeamScore - awayTeamScore;

    if (Math.abs(scoreDifference) === Math.abs(spreadLine)) {
      return "draw";
    }

    // Handle bets on the favorite (negative spread)
    if (isFavorite) {
      if (betOnTeam === homeTeamName && scoreDifference > Math.abs(spreadLine)) {
        return "won" // Favorite covered the spread
      }
      else if (betOnTeam === awayTeamName && scoreDifference < -Math.abs(spreadLine)) {
        return "won" // Away team (underdog) won against the spread
      }
      return "lost"; // Favorite didn't cover, or underdog lost by more than the spread
    }

    // Handle bets on the underdog (positive spread)
    if (!isFavorite) {
      if (betOnTeam === homeTeamName && scoreDifference >= spreadLine) {
        return "won" // Home underdog covered or won outright
      } else if (betOnTeam === awayTeamName && scoreDifference <= spreadLine) {
        return "won" // Away underdog covered or won outright
      }

      return "lost"; // Underdog didn't cover
    }

    return "pending" // Fallback case, should not reach here
  }

  checkTotalsBetResult(betDetail: IBetDetail, gameData: any): "won" | "lost" | "draw" | "pending" | "failed" {
    const totalLine = betDetail.bet_on.points;
    const betOn = betDetail.bet_on.name; // 'Over' or 'Under'

    if (!gameData.completed) {
      return "pending";
    }

    const homeTeamScore = gameData.scores.find((team: any) => team.name === gameData.home_team)?.score;
    const awayTeamScore = gameData.scores.find((team: any) => team.name === gameData.away_team)?.score;

    if (homeTeamScore == null || awayTeamScore == null) {
      return "failed";
    }

    // Handle invalid scores (e.g., negative scores)
    if (homeTeamScore < 0 || awayTeamScore < 0) {
      console.error("Error: Invalid scores found (negative values).");
      return "failed";
    }

    const totalScore = homeTeamScore + awayTeamScore;

    if (totalScore === totalLine) {
      console.log("The total score equals the total line. It's a push (draw).");
      return "draw";
    }

    if (betOn === "Over") {
      return totalScore > totalLine ? "won" : "lost";
    } else if (betOn === "Under") {
      return totalScore < totalLine ? "won" : "lost";
    }

    return "pending";
  }

  checkOutrightsBetResult(betDetail: IBetDetail, gameData: any): "won" | "lost" | "draw" | "pending" | "failed" {
    const betOn = betDetail.bet_on.name;

    if (!gameData.completed) {
      return "pending";
    }

    const betOnTeam = gameData.scores.find((team: any) => team.name === betOn);

    if (!betOnTeam) {
      return "failed";
    }

    const betOnTeamScore = betOnTeam.score;

    if (betOnTeamScore == null || betOnTeamScore < 0) {
      console.error("Error: Invalid scores found (negative values or not defined).");
      return "failed";
    }

    const allScores = gameData.scores.map((team: any) => team.score);
    const maxScore = Math.max(...allScores);
    const teamsWithMaxScore = gameData.scores.filter((team: any) => team.score === maxScore);

    if (teamsWithMaxScore.length > 1) {
      const isBetOnTeamInDraw = teamsWithMaxScore.some((team: any) => team.name === betOn);
      if (isBetOnTeamInDraw) {
        return "draw";
      } else {
        return "lost";
      }
    }

    if (teamsWithMaxScore[0].name === betOn) {
      return "won";
    } else {
      return "lost";
    }

    return "pending";
  }


  async publishRedisNotification(type: string, playerId: string, username: string, agentId: string, betId: string, playerMessage: string, agentMessage: string): Promise<void> {
    try {
      await redisClient.publish("bet-notifications", JSON.stringify({
        type,
        player: {
          _id: playerId,
          username
        },
        agent: agentId,
        betId,
        playerMessage,
        agentMessage
      }));
      console.log(`Published ${type} notification for bet ${betId}`);
    } catch (error) {
      console.error(`Failed to publish ${type} notification for bet ${betId}:`, error);
    }
  }
}

parentPort.on('message', async (message) => {
  if (message === "start") {
    const worker = new ProcessingQueueWorker();
    await worker.startWorker()
  }
})