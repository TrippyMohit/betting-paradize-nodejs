import { config } from "../config/config";
import axios from "axios";
import StoreService from "./storeServices";
import { activeRooms } from "../socket/socket";
import { io } from "../server";
import { redisClient } from "../../src/redisclient";

class Store {
  private storeService: StoreService;
  private redisGetAsync;
  private redisSetAsync;

  constructor() {
    this.storeService = new StoreService();
    this.initializeRedis();
  }


  private async initializeRedis() {
    try {
      this.redisGetAsync = redisClient.get.bind(redisClient);
      this.redisSetAsync = redisClient.set.bind(redisClient);
    } catch (error) {
      console.error("Redis client connection error:", error);
      this.redisGetAsync = async () => null;
      this.redisSetAsync = async () => null;
    }
  }

  private async fetchFromApi(
    url: string,
    params: any,
    cacheKey: string
  ): Promise<any> {
    // Check if the data is already in the Redis cache
    const cachedData = await this.redisGetAsync(cacheKey);
    if (cachedData) {
      // console.log(JSON.parse(cachedData), "cached");

      return JSON.parse(cachedData);
    }
    try {
      const response = await axios.get(url, {
        params: { ...params, apiKey: config.oddsApi.key },
      });

      let cacheDuration = 30; // Default to 1 minute (60 seconds)

      if (cacheKey === 'sportsList') {
        cacheDuration = 43200; // 12 hours (12 * 60 * 60 = 43200 seconds)
      }

      // Cache the data in Redis
      await this.redisSetAsync(
        cacheKey,
        JSON.stringify(response.data),
        "EX",
        cacheDuration
      ); // Cache for 12 hours
      return response.data;
    } catch (error) {
      console.log("EVENT ODDS ERROR", error);
      throw new Error(error.message || "Error Fetching Data");
    }
  }

  public getSports(): Promise<any> {
    return this.fetchFromApi(`${config.oddsApi.url}/sports`, {}, "sportsList");
  }

  public getScores(
    sport: string,
    daysFrom: string | undefined,
    dateFormat: string | undefined
  ): Promise<any> {
    const cacheKey = `scores_${sport}_${daysFrom}_${dateFormat || "iso"}`;
    return this.fetchFromApi(
      `${config.oddsApi.url}/sports/${sport}/scores`,
      { daysFrom, dateFormat },
      cacheKey
    );
  }

  public async getScoresForProcessing(
    sport: string,
    daysFrom: string | undefined,
    dateFormat: string | undefined
  ) {
    const cacheKey = `scores_${sport}_${daysFrom}_${dateFormat || "iso"}`;
    const scoresResponse = await this.fetchFromApi(
      `${config.oddsApi.url}/sports/${sport}/scores`,
      { daysFrom, dateFormat },
      cacheKey
    );
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const completedGames = scoresResponse.filter(
      (game: any) => game.completed
    );

    const futureUpcomingGames = scoresResponse.filter((game: any) => {
      const commenceTime = new Date(game.commence_time);
      return commenceTime > endOfToday && !game.completed;
    });
    return {
      futureUpcomingGames,
      completedGames
    }
  }

  // HANDLE ODDS
  public async getOdds(
    sport: string,
    markets?: string | undefined,
    regions?: string | undefined,
    player?: any
  ): Promise<any> {
    try {
      const cacheKey = `odds_${sport}_h2h_us`;
      // Fetch data from the API
      const oddsResponse = await this.fetchFromApi(
        `${config.oddsApi.url}/sports/${sport}/odds`,
        {
          // markets: "h2h", // Default to 'h2h' if not provided
          regions: "us", // Default to 'us' if not provided
          oddsFormat: "decimal",
        },
        cacheKey
      );
      //  console.log(oddsResponse, "odds response");

      const scoresResponse = await this.getScores(sport, "1", "iso");
      const filteredScores = scoresResponse.filter(
        (score: any) => score.completed === false && score.scores !== null
      );

      console.log(filteredScores, "filtered scores");
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);

      const endOfToday = new Date(now);
      endOfToday.setHours(23, 59, 59, 999);

      const processedData = oddsResponse.map((game: any) => {
        const bookmaker = this.storeService.selectBookmaker(game.bookmakers);
        const matchedScore = scoresResponse.find(
          (score: any) => score.id === game.id
        );

        if (bookmaker === undefined) {
          return {};
        }
        return {
          id: game?.id,
          sport_key: game?.sport_key,
          sport_title: game?.sport_title,
          commence_time: game?.commence_time,
          home_team: game?.home_team,
          away_team: game?.away_team,
          markets: bookmaker?.markets || [],
          scores: matchedScore?.scores || [],
          completed: matchedScore?.completed,
          last_update: matchedScore?.last_update,
          selected: bookmaker?.key,
        };
      });


      const liveGames = processedData.filter((game: any) => {
        const commenceTime = new Date(game.commence_time);
        return commenceTime <= now && !game.completed;
      });
      //  console.log(liveGames, "live");

      const todaysUpcomingGames = processedData.filter((game: any) => {
        const commenceTime = new Date(game.commence_time);
        return (
          commenceTime > now &&
          commenceTime >= startOfToday &&
          commenceTime <= endOfToday &&
          !game.completed
        );
      });

      const futureUpcomingGames = processedData.filter((game: any) => {
        const commenceTime = new Date(game.commence_time);
        return commenceTime > endOfToday && !game.completed;
      });

      const completedGames = processedData.filter(
        (game: any) => game.completed
      );

      return {
        live_games: liveGames,
        todays_upcoming_games: todaysUpcomingGames,
        future_upcoming_games: futureUpcomingGames,
        completed_games: completedGames || [],
      };
    } catch (error) {
      console.log(error.message);
      if (player) {
        player.sendError(error.message);
      }
    }
  }

  public async getOddsForProcessing(
    sport: string,
  ) {
    const cacheKey = `odds_${sport}_h2h_us`;

    const oddsResponse = await this.fetchFromApi(
      `${config.oddsApi.url}/sports/${sport}/odds`,
      {
        markets: "h2h,spreads,totals", // Default to 'h2h' if not provided
        regions: "us", // Default to 'us' if not provided
        oddsFormat: "decimal",
      },
      cacheKey
    );
    return oddsResponse

  }
  public getEvents(sport: string, dateFormat?: string): Promise<any> {
    const cacheKey = `events_${sport}_${dateFormat || "iso"}`;
    return this.fetchFromApi(
      `${config.oddsApi.url}/sports/${sport}/events`,
      { dateFormat },
      cacheKey
    );
  }
  public async getEventOdds(
    sport: string,
    eventId: string,
    markets?: string | undefined,
    regions?: string | undefined,
    oddsFormat?: string | undefined,
    dateFormat?: string | undefined
  ): Promise<any> {
    const categoriesData = await this.getCategories();
    const has_outrights = categoriesData
      ?.flatMap((item) => item?.events)
      ?.find((event) => event?.key === sport)?.has_outrights;

    markets = has_outrights ? "outrights" : "h2h,spreads,totals";
    regions = "us"
    const cacheKey = `eventOdds_${sport}_${eventId}_${regions}_${markets}_${dateFormat || "iso"
      }_${oddsFormat || "decimal"}`;

    const data = await this.fetchFromApi(
      `${config.oddsApi.url}/sports/${sport}/events/${eventId}/odds`,
      { regions, markets, dateFormat: "iso", oddsFormat: "decimal" },
      cacheKey
    );
    const { bookmakers } = data;

    const selectBookmakers = this.storeService.selectBookmaker(bookmakers);

    return {
      ...data,
      markets: selectBookmakers.markets,
      selected: selectBookmakers?.key,
    };
  }

  //search event from getOdds
  public async searchEvent(
    sport: string,
    query: string
  ): Promise<any> {
    //using getEvents with sportname 
    const events = await this.getOdds(sport);
    if (query === "") return events
    let filteredEvents = {
      live_games: [],
      todays_upcoming_games: [],
      future_upcoming_games: [],
    }
    events.live_games.forEach((event: any) => {
      if (
        event?.home_team?.toLowerCase()?.includes(query?.toLowerCase()) ||
        event?.away_team?.toLowerCase()?.includes(query?.toLowerCase())
      ) {
        filteredEvents.live_games.push(event)
      }
    })
    events.todays_upcoming_games.forEach((event: any) => {
      if (
        event?.home_team?.toLowerCase()?.includes(query?.toLowerCase()) ||
        event?.away_team?.toLowerCase()?.includes(query?.toLowerCase())
      ) {
        filteredEvents.todays_upcoming_games.push(event)
      }
    })
    events.future_upcoming_games.forEach((event: any) => {
      if (
        event?.home_team?.toLowerCase()?.includes(query?.toLowerCase()) ||
        event?.away_team?.toLowerCase()?.includes(query?.toLowerCase())
      ) {
        filteredEvents.future_upcoming_games.push(event)
      }
    })
    return filteredEvents
  }

  public async getCategories(): Promise<
    {
      category: string;
      events: any;
    }[]
  > {
    try {
      const sportsData = await this.fetchFromApi(
        `${config.oddsApi.url}/sports`,
        {},
        "sportsList"
      );
      const groupedData: { [key: string]: any[] } = {};
      groupedData["All"] = [];

      sportsData.forEach((item) => {
        const { group, title, key, has_outrights, active } = item;

        if (!groupedData[group]) {
          groupedData[group] = [];
        }

        groupedData[group].push({ title, key, has_outrights, active });
        groupedData["All"].push({ title, key, has_outrights, active });
      });

      const categories = Object.keys(groupedData).map((group) => ({
        category: group,
        events: groupedData[group],
      }));

      return categories;
    } catch (error) {
      console.error("Error fetching categories:", error);
      throw new Error("Failed to fetch categories");
    }
  }

  public async getCategorySports(category: string): Promise<any> {
    try {
      const sportsData = await this.getSports();

      if (category.toLowerCase() === "all") {
        return sportsData.filter((sport: any) => sport.active);
      }

      const categorySports = sportsData.filter(
        (sport: any) => sport.group === category && sport.active
      );

      return categorySports;
    } catch (error) {
      console.error("Error fetching category sports:", error);
      throw new Error("Failed to fetch category sports");
    }
  }
    
  public async updateLiveData() {
    console.log([...activeRooms], "Active Rooms");

    const currentActive = this.removeInactiveRooms();

    for (const sport of currentActive) {
        const liveData = await this.getOdds(sport) || {};

        const liveGamesForSport = liveData.live_games|| {};
        const todaysUpcomingGamesForSport = liveData.todays_upcoming_games || {};
        const futureUpcomingGamesForSport = liveData.future_upcoming_games || {};         
        if (
            liveGamesForSport.length > 0 ||
            todaysUpcomingGamesForSport.length > 0 ||
            futureUpcomingGamesForSport.length > 0
        ) {
            io.to(sport).emit("data", {
                type: "ODDS",
                data: {
                    live_games: liveGamesForSport,
                    todays_upcoming_games: todaysUpcomingGamesForSport,
                    future_upcoming_games: futureUpcomingGamesForSport,
                },
            });
            console.log(`Data broadcasted to room: ${sport}`);
        } else {
            console.log(`No relevant data available for sport: ${sport}`);
        }
    }
}

public removeInactiveRooms() {
  const rooms = io.sockets.adapter.rooms;
  console.log(rooms, "Socket.io Rooms");

  const currentRooms = new Set(rooms.keys());
  console.log(currentRooms, "Currently Active Rooms");

  console.log([...activeRooms], "Initial Active Rooms Set");

  activeRooms.forEach((room) => {
      if (!currentRooms.has(room)) {
            activeRooms.delete(room); // Remove inactive rooms
      }
  });

  console.log([...activeRooms], "Updated Active Rooms Set");

    return activeRooms; // Return the updated set of active rooms
}

}

export default new Store();
