export type Region = "na" | "eu" | "ap" | "kr" | "latam" | "br";

export type AccountSettings = {
	riotId?: string;
	region?: Region;
	apiKey?: string;
	actEndDate?: string;
};

export type ManualResult = {
	id: string;
	result: "win" | "loss";
	rr?: number;
	createdAt: number;
	knownMatchIds?: string[];
	reconciledMatchId?: string;
};

export type SessionState = {
	startedAt: number;
	baselineMatchIds: string[];
	manual: ManualResult[];
};

export type PlayerMatch = {
	id: string;
	startedAt: number;
	map: string;
	agent: string;
	agentIcon?: string;
	result: "win" | "loss" | "draw" | "unknown";
	kills: number;
	deaths: number;
	assists: number;
	headshots: number;
	bodyshots: number;
	legshots: number;
	damage: number;
	score: number;
	rounds: number;
};

export type MmrHistoryPoint = {
	matchId: string;
	date: number;
	rr: number;
	change: number;
	map?: string;
	tierName?: string;
};

export type AggregateItem = {
	name: string;
	icon?: string;
	games: number;
	wins: number;
	losses: number;
	winRate: number;
	kills: number;
	deaths: number;
	kd: number;
	damage: number;
	acs: number;
};

export type TrackerSnapshot = {
	fetchedAt: number;
	accountName: string;
	accountTag: string;
	puuid: string;
	rankName: string;
	rankTierId: number;
	rankIcon?: string;
	rr: number;
	lastChange: number;
	lastMatch?: PlayerMatch;
	headshotPercent: number | null;
	damage: number | null;
	acs: number | null;
	agents: AggregateItem[];
	maps: AggregateItem[];
	recentMatches: PlayerMatch[];
	history: MmrHistoryPoint[];
	session: {
		wins: number;
		losses: number;
		netRr: number;
	};
};

export type ErrorKind =
	| "none"
	| "no-account"
	| "no-api-key"
	| "invalid-riot-id"
	| "invalid-region"
	| "invalid-key"
	| "rate-limited"
	| "offline"
	| "not-found"
	| "api-error";

export type RuntimeState = {
	status: "idle" | "loading" | "ready" | "error";
	error: ErrorKind;
	detail?: string;
	snapshot?: TrackerSnapshot;
};

export type GlobalStore = {
	account?: AccountSettings;
	session?: SessionState;
	cache?: TrackerSnapshot;
};

export type ActionSettings = {
	slot?: number;
	manualRr?: number;
};
