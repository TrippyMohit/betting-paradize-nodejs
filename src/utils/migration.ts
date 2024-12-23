// import { BetDetail } from "../bets/betModel";

// export async function migrateLegacyBet(betDetail: any) {
//     try {
//         if (betDetail.home_team && betDetail.away_team) {
//             // console.log(`Migrating legacy bet with ID ${betDetail._id}...`);

//             const newTeams = [
//                 { name: betDetail.home_team?.name, odds: betDetail.home_team?.odds },
//                 { name: betDetail.away_team?.name, odds: betDetail.away_team?.odds }
//             ];

//             let newBetOn: any;

//             if (betDetail.bet_on === "home_team" && betDetail.home_team) {
//                 newBetOn = {
//                     name: betDetail.home_team.name,
//                     odds: betDetail.home_team.odds
//                 }
//             } else if (betDetail.bet_on === "away_team" && betDetail.away_team) {
//                 newBetOn = {
//                     name: betDetail.away_team.name,
//                     odds: betDetail.away_team.odds
//                 }
//             } else if (["Over", "Under"].includes(betDetail.bet_on)) {
//                 newBetOn = {
//                     name: betDetail.bet_on,
//                     odds: 0
//                 }
//             } else {
//                 console.error(`Invalid bet_on value: ${betDetail.bet_on}`);
//                 return
//             }

//             const newCategory = betDetail.market;
//             const newBookmaker = betDetail.selected;


//             const result = await BetDetail.updateOne(
//                 { _id: betDetail._id },
//                 {
//                     $set: {
//                         teams: newTeams,
//                         bet_on: newBetOn,
//                         category: newCategory,
//                         bookmaker: newBookmaker,
//                     },
//                     $unset: { home_team: "", away_team: "", market: "", selected: "" }
//                 },
//                 { new: true, strict: false }
//             );

//             if (result) {
//                 // console.log("Updated BetDetail:", result);
//             }
//             else {
//                 // console.log("Failed to update BetDetail:", result);
//             }

//             // console.log(`Bet with ID ${betDetail._id} successfully migrated.`);
//         } else {
//             // console.log(`Bet with ID ${betDetail._id} is already fully migrated, skipping.`);
//         }
//     } catch (error) {
//         // console.error(`Error migrating legacy bet with ID ${betDetail}:`, error);
//     }
// }