import type { AccountSettings, MmrHistoryPoint, PlayerMatch, Region } from "./model";

const BASE_URL = "https://api.henrikdev.xyz";

export class HenrikError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
	}
}

export function parseRiotId(value: string | undefined): { name: string; tag: string } | null {
	const text = value?.trim();
	if (!text) return null;
	const split = text.lastIndexOf("#");
	if (split <= 0 || split >= text.length - 1) return null;
	const name = text.slice(0, split).trim();
	const tag = text.slice(split + 1).trim();
	return name && tag ? { name, tag } : null;
}

export const REGIONS: Region[] = ["na", "eu", "ap", "kr", "latam", "br"];

async function requestJson(path: string, apiKey: string): Promise<any> {
	let response: Response;
	try {
		response = await fetch(`${BASE_URL}${path}`, {
			headers: {
				Authorization: apiKey,
				Accept: "application/json"
			}
		});
	} catch (error) {
		throw new HenrikError(0, error instanceof Error ? error.message : "network error");
	}

	let body: any = null;
	try {
		body = await response.json();
	} catch {
		body = null;
	}

	if (!response.ok) {
		const detail = body?.errors?.[0]?.message ?? body?.message ?? body?.error ?? body?.details ?? `HTTP ${response.status}`;
		throw new HenrikError(response.status, String(detail));
	}
	return body;
}

function encoded(value: string): string {
	return encodeURIComponent(value);
}

function asNumber(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function timestamp(value: unknown): number {
	if (typeof value === "number") {
		if (value > 10_000_000_000) return value;
		if (value > 1_000_000_000) return value * 1000;
	}
	if (typeof value === "string") {
		const parsed = Date.parse(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

function normalizeTeam(value: unknown): string {
	return asString(value).trim().toLowerCase();
}

function teamWon(match: any, team: string): boolean | null {
	if (!team) return null;
	const teams = match?.teams;
	if (Array.isArray(teams)) {
		const found = teams.find((entry) => normalizeTeam(entry?.team_id ?? entry?.teamId ?? entry?.team) === team);
		if (found) {
			if (typeof found.won === "boolean") return found.won;
			if (typeof found.has_won === "boolean") return found.has_won;
		}
	}
	if (teams && typeof teams === "object") {
		const found = teams[team] ?? teams[team[0]?.toUpperCase() + team.slice(1)] ?? teams[team.toUpperCase()];
		if (found) {
			if (typeof found.won === "boolean") return found.won;
			if (typeof found.has_won === "boolean") return found.has_won;
		}
	}
	return null;
}

function playerList(match: any): any[] {
	const players = match?.players;
	if (Array.isArray(players)) return players;
	if (!players || typeof players !== "object") return [];
	if (Array.isArray(players.all_players)) return players.all_players;
	const combined: any[] = [];
	for (const value of Object.values(players)) {
		if (Array.isArray(value)) combined.push(...value);
	}
	return combined;
}

function matchId(match: any): string {
	return asString(match?.metadata?.matchid ?? match?.metadata?.match_id ?? match?.metadata?.matchId ?? match?.match_id ?? match?.matchId ?? match?.id);
}

function matchStartedAt(match: any): number {
	return timestamp(
		match?.metadata?.started_at ??
			match?.metadata?.game_start ??
			match?.metadata?.gameStart ??
			match?.metadata?.game_start_patched ??
			match?.started_at ??
			match?.game_start
	);
}

function matchMap(match: any): string {
	const value = match?.metadata?.map?.name ?? match?.metadata?.map ?? match?.map?.name ?? match?.map;
	return asString(value, "Unknown");
}

function pickPlayer(match: any, puuid: string, name: string, tag: string): any | null {
	const normalizedName = name.toLowerCase();
	const normalizedTag = tag.toLowerCase();
	return (
		playerList(match).find((player) => asString(player?.puuid ?? player?.player_puuid).toLowerCase() === puuid.toLowerCase()) ??
		playerList(match).find(
			(player) =>
				asString(player?.name ?? player?.game_name ?? player?.gameName).toLowerCase() === normalizedName &&
				asString(player?.tag ?? player?.tag_line ?? player?.tagLine).toLowerCase() === normalizedTag
		) ??
		null
	);
}

function playerStats(player: any): any {
	return player?.stats ?? player?.statistics ?? player ?? {};
}

function normalizeMatch(match: any, puuid: string, name: string, tag: string): PlayerMatch | null {
	const player = pickPlayer(match, puuid, name, tag);
	if (!player) return null;
	const stats = playerStats(player);
	const team = normalizeTeam(player?.team ?? player?.team_id ?? player?.teamId);
	const won = teamWon(match, team);
	let result: PlayerMatch["result"] = "unknown";
	if (won === true) result = "win";
	else if (won === false) result = "loss";
	else {
		const direct = asString(player?.result ?? match?.result).toLowerCase();
		if (direct.includes("win")) result = "win";
		else if (direct.includes("loss") || direct.includes("defeat")) result = "loss";
		else if (direct.includes("draw")) result = "draw";
	}

	const rounds = asNumber(match?.metadata?.rounds_played ?? match?.metadata?.roundsPlayed ?? stats?.rounds_played ?? stats?.roundsPlayed, 0);
	return {
		id: matchId(match),
		startedAt: matchStartedAt(match),
		map: matchMap(match),
		agent: asString(player?.character ?? player?.agent?.name ?? player?.character_name ?? player?.characterName, "Unknown"),
		agentIcon: asString(player?.assets?.agent?.small ?? player?.assets?.agent?.displayIcon ?? player?.agent?.icon) || undefined,
		result,
		kills: asNumber(stats?.kills),
		deaths: asNumber(stats?.deaths),
		assists: asNumber(stats?.assists),
		headshots: asNumber(stats?.headshots ?? player?.headshots),
		bodyshots: asNumber(stats?.bodyshots ?? player?.bodyshots),
		legshots: asNumber(stats?.legshots ?? player?.legshots),
		damage: asNumber(player?.damage_made ?? player?.damageMade ?? stats?.damage ?? player?.damage),
		score: asNumber(stats?.score),
		rounds
	};
}

function matchArray(body: any): any[] {
	if (Array.isArray(body?.data)) return body.data;
	if (Array.isArray(body?.data?.matches)) return body.data.matches;
	if (Array.isArray(body?.matches)) return body.matches;
	return [];
}

function historyArray(body: any): any[] {
	if (Array.isArray(body?.data?.history)) return body.data.history;
	if (Array.isArray(body?.data)) return body.data;
	if (Array.isArray(body?.history)) return body.history;
	return [];
}

export type HenrikBundle = {
	account: { puuid: string; name: string; tag: string };
	rank: { tierId: number; name: string; rr: number; lastChange: number };
	history: MmrHistoryPoint[];
	matches: PlayerMatch[];
};

export async function fetchHenrikBundle(settings: AccountSettings): Promise<HenrikBundle> {
	const riot = parseRiotId(settings.riotId);
	if (!riot) throw new HenrikError(400, "invalid Riot ID");
	if (!settings.apiKey) throw new HenrikError(401, "missing API key");
	const region = settings.region ?? "na";
	const mmr = await requestJson(
		`/valorant/v3/mmr/${region}/pc/${encoded(riot.name)}/${encoded(riot.tag)}`,
		settings.apiKey
	);
	const account = mmr?.data?.account ?? {};
	const current = mmr?.data?.current ?? {};
	const puuid = asString(account?.puuid);
	if (!puuid) throw new HenrikError(502, "MMR response did not contain a PUUID");

	const [historyResult, matchesResult] = await Promise.allSettled([
		requestJson(`/valorant/v2/mmr-history/${region}/pc/${encoded(riot.name)}/${encoded(riot.tag)}`, settings.apiKey),
		requestJson(`/valorant/v4/matches/${region}/pc/${encoded(riot.name)}/${encoded(riot.tag)}?mode=competitive&size=10`, settings.apiKey)
	]);

	let historyBody: any = null;
	if (historyResult.status === "fulfilled") historyBody = historyResult.value;
	else if (historyResult.reason instanceof HenrikError && historyResult.reason.status === 410) {
		historyBody = await requestJson(`/valorant/v1/mmr-history/${region}/${encoded(riot.name)}/${encoded(riot.tag)}`, settings.apiKey);
	}

	let matchesBody: any = null;
	if (matchesResult.status === "fulfilled") matchesBody = matchesResult.value;
	else if (matchesResult.reason instanceof HenrikError && [404, 410, 501].includes(matchesResult.reason.status)) {
		matchesBody = await requestJson(`/valorant/v3/matches/${region}/${encoded(riot.name)}/${encoded(riot.tag)}?mode=competitive&size=10`, settings.apiKey);
	}

	const history: MmrHistoryPoint[] = historyArray(historyBody)
		.map((entry) => ({
			matchId: asString(entry?.match_id ?? entry?.matchId),
			date: timestamp(entry?.date ?? entry?.date_raw ?? entry?.dateRaw),
			rr: asNumber(entry?.rr ?? entry?.ranking_in_tier),
			change: asNumber(entry?.last_change ?? entry?.mmr_change_to_last_game),
			map: asString(entry?.map?.name ?? entry?.map) || undefined,
			tierName: asString(entry?.tier?.name ?? entry?.currenttierpatched) || undefined
		}))
		.filter((entry) => !!entry.matchId)
		.sort((a, b) => b.date - a.date);

	const matches = matchArray(matchesBody)
		.map((match) => normalizeMatch(match, puuid, riot.name, riot.tag))
		.filter((match): match is PlayerMatch => !!match)
		.sort((a, b) => b.startedAt - a.startedAt);

	return {
		account: {
			puuid,
			name: asString(account?.name, riot.name),
			tag: asString(account?.tag, riot.tag)
		},
		rank: {
			tierId: asNumber(current?.tier?.id),
			name: asString(current?.tier?.name, "Unranked"),
			rr: asNumber(current?.rr),
			lastChange: asNumber(current?.last_change)
		},
		history,
		matches
	};
}
