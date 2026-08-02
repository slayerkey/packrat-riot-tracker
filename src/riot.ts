/**
 * Riot Games API client.
 *
 * Every function here resolves to null on failure (bad key, expired key, rate limit, network
 * error, unexpected shape) instead of throwing, the same defensive convention the ESPN client
 * uses in plugins/_shared/src/espn.ts. Callers keep showing their last known good data rather
 * than crash a poll.
 *
 * Auth is a personal developer key from https://developer.riotgames.com/, sent as the
 * X-Riot-Token header. It is supplied by the user at runtime through the property inspector and
 * lives only in that action instance's own settings; nothing in this file ever reads it from,
 * or writes it to, a file.
 */

export type Platform = "na1" | "euw1" | "eune1" | "kr" | "br1" | "la1" | "la2" | "oc1" | "jp1";

/** The wider routing cluster account-v1 and match-v5 use, distinct from the platform id that
 *  league-v4 / tft-league-v1 use directly. Per Riot's routing documentation. */
export type Continent = "americas" | "asia" | "europe" | "sea";

const CONTINENT_BY_PLATFORM: Record<string, Continent> = {
	na1: "americas",
	br1: "americas",
	la1: "americas",
	la2: "americas",
	euw1: "europe",
	eune1: "europe",
	kr: "asia",
	jp1: "asia",
	oc1: "sea"
};

export function continentFor(platform: string): Continent {
	return CONTINENT_BY_PLATFORM[platform] ?? "americas";
}

const TIMEOUT_MS = 8_000;

async function fetchJson(url: string, apiKey: string): Promise<unknown | null> {
	try {
		const res = await fetch(url, {
			signal: AbortSignal.timeout(TIMEOUT_MS),
			headers: { "X-Riot-Token": apiKey, accept: "application/json" }
		});
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}

export type RiotAccount = { puuid: string; gameName: string; tagLine: string };

/** Riot ID (gameName#tagLine) -> puuid. Works the same for every Riot game. */
export async function getAccountByRiotId(
	gameName: string,
	tagLine: string,
	platform: string,
	apiKey: string
): Promise<RiotAccount | null> {
	const continent = continentFor(platform);
	const url =
		`https://${continent}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/` +
		`${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
	const json = await fetchJson(url, apiKey);
	if (json === null) return null;
	const j = json as { puuid?: unknown; gameName?: unknown; tagLine?: unknown };
	if (typeof j.puuid !== "string" || j.puuid.length === 0) return null;
	return { puuid: j.puuid, gameName: String(j.gameName ?? gameName), tagLine: String(j.tagLine ?? tagLine) };
}

export type LeagueEntry = {
	queueType: string;
	/** IRON..CHALLENGER. */
	tier: string;
	/** I..IV; empty for the apex tiers (Master, Grandmaster, Challenger rank on LP alone). */
	rank: string;
	leaguePoints: number;
	wins: number;
	losses: number;
	hotStreak: boolean;
};

function parseLeagueEntries(json: unknown): LeagueEntry[] {
	if (!Array.isArray(json)) return [];
	const out: LeagueEntry[] = [];
	for (const raw of json) {
		const e = raw as Record<string, unknown>;
		if (typeof e.queueType !== "string" || typeof e.tier !== "string") continue;
		out.push({
			queueType: e.queueType,
			tier: e.tier,
			rank: typeof e.rank === "string" ? e.rank : "",
			leaguePoints: Number(e.leaguePoints) || 0,
			wins: Number(e.wins) || 0,
			losses: Number(e.losses) || 0,
			hotStreak: e.hotStreak === true
		});
	}
	return out;
}

/** Current rank in every LoL queue the account has played (RANKED_SOLO_5x5, RANKED_FLEX_SR, ...).
 *  Empty array means unranked in every queue, which is a real state, not a failure. */
export async function getLolRank(puuid: string, platform: string, apiKey: string): Promise<LeagueEntry[] | null> {
	const url = `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
	const json = await fetchJson(url, apiKey);
	return json === null ? null : parseLeagueEntries(json);
}

/** Same shape as getLolRank, TFT's own ranked queue(s). */
export async function getTftRank(puuid: string, platform: string, apiKey: string): Promise<LeagueEntry[] | null> {
	const url = `https://${platform}.api.riotgames.com/tft/league/v1/by-puuid/${puuid}`;
	const json = await fetchJson(url, apiKey);
	return json === null ? null : parseLeagueEntries(json);
}

/** Picks one queue's entry out of the array league-v4 / tft-league-v1 return. */
export function pickQueue(entries: LeagueEntry[], queueType: string): LeagueEntry | null {
	return entries.find((e) => e.queueType === queueType) ?? null;
}

function parseMatchIds(json: unknown): string[] {
	if (!Array.isArray(json)) return [];
	return json.filter((id): id is string => typeof id === "string");
}

export type MatchIdWindow = { startTimeSec?: number; endTimeSec?: number; count?: number };

/** Recent LoL match ids, optionally filtered to a time window. Riot has no LP-delta-per-match
 *  endpoint, so a caller would fetch each match to compute anything about them. */
export async function getLolMatchIds(
	puuid: string,
	platform: string,
	apiKey: string,
	window: MatchIdWindow = {}
): Promise<string[] | null> {
	const continent = continentFor(platform);
	const params = new URLSearchParams();
	if (window.startTimeSec !== undefined) params.set("startTime", String(window.startTimeSec));
	if (window.endTimeSec !== undefined) params.set("endTime", String(window.endTimeSec));
	params.set("count", String(window.count ?? 20));
	const url = `https://${continent}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?${params}`;
	const json = await fetchJson(url, apiKey);
	return json === null ? null : parseMatchIds(json);
}

/** Recent TFT match ids. */
export async function getTftMatchIds(
	puuid: string,
	platform: string,
	apiKey: string,
	count = 10
): Promise<string[] | null> {
	const continent = continentFor(platform);
	const url = `https://${continent}.api.riotgames.com/tft/match/v1/matches/by-puuid/${puuid}/ids?count=${count}`;
	const json = await fetchJson(url, apiKey);
	return json === null ? null : parseMatchIds(json);
}
