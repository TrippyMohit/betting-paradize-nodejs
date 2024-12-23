import { Bookmaker } from "./types";

class StoreService {
  constructor(){

  }
  public selectBookmaker(bookmakers: Bookmaker[]): Bookmaker | null {
    
    let bestBookmaker: Bookmaker;
    let highestMargin = -Infinity;

    bookmakers?.forEach((bookmaker: Bookmaker) => {
      bookmaker?.markets?.forEach((market) => {
        let totalImpliedProbability = 0;

        market?.outcomes?.forEach((outcome) => {
          const impliedProbability = 1 / outcome.price;
          totalImpliedProbability += impliedProbability;
        });

        // Calculate the bookmaker's margin for the current market
        const bookmakerMargin = (totalImpliedProbability - 1) * 100;

        // Update the highest margin and best bookmaker if needed
        if (bookmakerMargin > highestMargin) {
          highestMargin = bookmakerMargin;
          bestBookmaker = bookmaker;
        }
      });
    });

    return bestBookmaker;

  }

}

export default StoreService;
