export interface Sport {
    key: string;
    active: boolean;
    group: string;
    description: string;
    title: string;
    has_outrights: boolean;
}

export interface Event {
    id: string;
    sport_key: string;
    sport_title: string;
    commence_time: string;
    home_team: string;
    away_team: string;
}

export interface Outcomes {
    name: string,
    price: number
}

export interface Markets {
    key: string,
    last_update: Date,
    outcomes: Outcomes[]
}

export interface Bookmaker {
    key: string,
    title: string,
    last_update: Date,
    markets: Markets[]
}