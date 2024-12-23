import { redisClient } from "../redisclient";

/* Function to remove a bet from the waiting queue
* @param bet - stringified object eg: {betID: "1234", commence_time: "2022-01-01T00:00:00.000Z"}
* @usage -         const data = {
         betId: detail._id.toString(),
         commence_time: new Date(detail.commence_time),
       }
       removeFromWaitingQueue(JSON.stringify(data));

* */
export async function removeFromWaitingQueue(bet: any) {
  //here bet is a stringified object eg:{betID: "1234", commence_time: "2022-01-01T00:00:00.000Z"}
  /*
          const data = {
            betId: detail._id.toString(),
            commence_time: new Date(detail.commence_time),
          }
          removeFromWaitingQueue(JSON.stringify(data));
   * */
  await redisClient.zrem('waitingQueue', bet);
}
