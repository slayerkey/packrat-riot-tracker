import type { AccountSettings, MmrHistoryPoint, PlayerMatch, Region } from "./model";

const BASE_URL = "https://api.henrikdev.xyz";
const API_TIMEOUT_MS = 12_000;
const ASSET_TIMEOUT_MS = 6_000;
const assetCache = new Map<string, Promise<string | undefined>>();
const rankIconCache = new Map<string, string | undefined>();
const accountRegionCache = new Map<string, Region>();

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

function networkFailureStatus(error: unknown): number {
	const name = typeof error === "object" && error && "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
	return name === "TimeoutError" || name === "AbortError" ? 408 : 0;
}

async function requestJson(path: string, apiKey: string): Promise<any> {
	let response: Response;
	try {
		response = await fetch(`${BASE_URL}${path}`, {
			headers: {
				Authorization: apiKey,
				Accept: "application/json"
			},
			signal: AbortSignal.timeout(API_TIMEOUT_MS)
		});
	} catch (error) {
		throw new HenrikError(networkFailureStatus(error), error instanceof Error ? error.message : "network error");
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

async function fetchAssetDataUrl(url: string | undefined): Promise<string | undefined> {
	if (!url || !/^https:\/\//i.test(url)) return undefined;
	const existing = assetCache.get(url);
	if (existing) return existing;
	const promise = (async () => {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(ASSET_TIMEOUT_MS) });
			if (!response.ok) return undefined;
			const bytes = Buffer.from(await response.arrayBuffer());
			if (!bytes.length || bytes.length > 1_000_000) return undefined;
			const mime = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "image/png";
			if (!new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]).has(mime)) return undefined;
			return `data:${mime};base64,${bytes.toString("base64")}`;
		} catch {
			return undefined;
		}
	})();
	assetCache.set(url, promise);
	return promise;
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

function normalizeRegion(value: unknown): Region | undefined {
	const normalized = asString(value).trim().toLowerCase() as Region;
	return REGIONS.includes(normalized) ? normalized : undefined;
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

function teamRoundScore(entry: any): number {
	return asNumber(entry?.rounds_won ?? entry?.roundsWon ?? entry?.rounds?.won, -1);
}

function matchDrawn(match: any): boolean {
	const direct = asString(match?.result ?? match?.metadata?.result).toLowerCase();
	if (direct.includes("draw") || direct.includes("tie")) return true;
	const teams = match?.teams;
	const scores = Array.isArray(teams)
		? teams.map((entry) => teamRoundScore(entry)).filter((score) => score >= 0)
		: teams && typeof teams === "object"
			? Object.values(teams).map((entry) => teamRoundScore(entry)).filter((score) => score >= 0)
			: [];
	return scores.length >= 2 && scores[0] === scores[1];
}

function totalRounds(match: any): number {
	const explicit = asNumber(
		match?.metadata?.rounds_played ??
			match?.metadata?.roundsPlayed ??
			match?.rounds_played ??
			match?.roundsPlayed,
		0
	);
	if (explicit > 0) return explicit;
	if (Array.isArray(match?.rounds) && match.rounds.length) return match.rounds.length;
	const teams = match?.teams;
	if (Array.isArray(teams)) {
		const won = teams.reduce(
			(sum, entry) => sum + asNumber(entry?.rounds_won ?? entry?.roundsWon ?? entry?.rounds?.won),
			0
		);
		if (won > 0) return won;
	}
	if (teams && typeof teams === "object") {
		const won = Object.values(teams).reduce<number>(
			(sum, entry: any) => sum + asNumber(entry?.rounds_won ?? entry?.roundsWon ?? entry?.rounds?.won),
			0
		);
		if (won > 0) return won;
	}
	return 0;
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
	const direct = asString(player?.result ?? match?.result).toLowerCase();
	let result: PlayerMatch["result"] = "unknown";
	if (direct.includes("draw") || direct.includes("tie") || matchDrawn(match)) result = "draw";
	else if (won === true) result = "win";
	else if (won === false) result = "loss";
	else if (direct.includes("win")) result = "win";
	else if (direct.includes("loss") || direct.includes("defeat")) result = "loss";

	const rounds = asNumber(stats?.rounds_played ?? stats?.roundsPlayed, totalRounds(match));
	const agentId = asString(player?.agent?.id);
	const agentIcon =
		asString(player?.assets?.agent?.small ?? player?.assets?.agent?.displayIcon ?? player?.agent?.icon) ||
		(agentId ? `https://media.valorant-api.com/agents/${encoded(agentId)}/displayicon.png` : undefined);
	return {
		id: matchId(match),
		startedAt: matchStartedAt(match),
		map: matchMap(match),
		agent: asString(player?.character ?? player?.agent?.name ?? player?.character_name ?? player?.characterName, "Unknown"),
		agentIcon,
		result,
		kills: asNumber(stats?.kills),
		deaths: asNumber(stats?.deaths),
		assists: asNumber(stats?.assists),
		headshots: asNumber(stats?.headshots ?? player?.headshots),
		bodyshots: asNumber(stats?.bodyshots ?? player?.bodyshots),
		legshots: asNumber(stats?.legshots ?? player?.legshots),
		damage: asNumber(
			player?.damage_made ??
				player?.damageMade ??
				stats?.damage?.dealt ??
				stats?.damage ??
				player?.damage?.dealt ??
				player?.damage
		),
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

async function legacyRankIcon(region: Region, name: string, tag: string, apiKey: string, rankName: string): Promise<string | undefined> {
	const cacheKey = rankName.trim().toLowerCase();
	if (rankIconCache.has(cacheKey)) return rankIconCache.get(cacheKey);
	try {
		const body = await requestJson(`/valorant/v2/mmr/${region}/${encoded(name)}/${encoded(tag)}`, apiKey);
		const current = body?.data?.current_data ?? body?.data?.currentData ?? {};
		const iconUrl = asString(current?.images?.large ?? current?.images?.small);
		const dataUrl = await fetchAssetDataUrl(iconUrl);
		rankIconCache.set(cacheKey, dataUrl);
		return dataUrl;
	} catch {
		rankIconCache.set(cacheKey, undefined);
		return undefined;
	}
}

function shouldUseRegionFallback(error: unknown): boolean {
	if (!(error instanceof HenrikError)) return false;
	return [0, 408, 404, 410, 429].includes(error.status) || error.status >= 500;
}

async function resolveRegion(name: string, tag: string, apiKey: string, fallback: Region): Promise<{ region: Region; account?: any }> {
	const key = `${name.trim().toLowerCase()}#${tag.trim().toLowerCase()}`;
	const cached = accountRegionCache.get(key);
	if (cached) return { region: cached };

	try {
		const body = await requestJson(`/valorant/v2/account/${encoded(name)}/${encoded(tag)}`, apiKey);
		const account = body?.data ?? {};
		const detected = normalizeRegion(account?.region);
		const region = detected ?? fallback;
		accountRegionCache.set(key, region);
		return { region, account };
	} catch (error) {
		// Region discovery is optional. Transient account-helper failures should fall back to the
		// user's selected shard rather than blocking otherwise valid rank and match endpoints.
		if (shouldUseRegionFallback(error)) return { region: fallback };
		throw error;
	}
}

export type HenrikBundle = {
	account: { puuid: string; name: string; tag: string };
	rank: { tierId: number; name: string; rr: number; lastChange: number; icon?: string };
	history: MmrHistoryPoint[];
	matches: PlayerMatch[];
};

export async function fetchHenrikBundle(settings: AccountSettings): Promise<HenrikBundle> {
	const riot = parseRiotId(settings.riotId);
	if (!riot) throw new HenrikError(400, "invalid Riot ID");
	if (!settings.apiKey) throw new HenrikError(401, "missing API key");
	const fallbackRegion = settings.region ?? "na";
	const resolved = await resolveRegion(riot.name, riot.tag, settings.apiKey, fallbackRegion);
	const region = resolved.region;
	const mmr = await requestJson(
		`/valorant/v3/mmr/${region}/pc/${encoded(riot.name)}/${encoded(riot.tag)}`,
		settings.apiKey
	);
	const account = mmr?.data?.account ?? resolved.account ?? {};
	const current = mmr?.data?.current ?? {};
	const puuid = asString(account?.puuid ?? resolved.account?.puuid);
	if (!puuid) throw new HenrikError(502, "MMR response did not contain a PUUID");
	const rankName = asString(current?.tier?.name, "Unranked");

	const [historyResult, matchesResult, rankIconResult] = await Promise.allSettled([
		requestJson(`/valorant/v2/mmr-history/${region}/pc/${encoded(riot.name)}/${encoded(riot.tag)}`, settings.apiKey),
		requestJson(`/valorant/v4/matches/${region}/pc/${encoded(riot.name)}/${encoded(riot.tag)}?mode=competitive&size=10`, settings.apiKey),
		legacyRankIcon(region, riot.name, riot.tag, settings.apiKey, rankName)
	]);

	let historyBody: any = null;
	if (historyResult.status === "fulfilled") historyBody = historyResult.value;
	else if (historyResult.reason instanceof HenrikError && [404, 410, 501].includes(historyResult.reason.status)) {
		historyBody = await requestJson(`/valorant/v1/mmr-history/${region}/${encoded(riot.name)}/${encoded(riot.tag)}`, settings.apiKey);
	} else {
		throw historyResult.reason;
	}

	let matchesBody: any = null;
	if (matchesResult.status === "fulfilled") matchesBody = matchesResult.value;
	else if (matchesResult.reason instanceof HenrikError && [404, 410, 501].includes(matchesResult.reason.status)) {
		matchesBody = await requestJson(`/valorant/v3/matches/${region}/${encoded(riot.name)}/${encoded(riot.tag)}?mode=competitive&size=10`, settings.apiKey);
	} else {
		throw matchesResult.reason;
	}

	const history: MmrHistoryPoint[] = historyArray(historyBody)
		.map((entry) => ({
			matchId: asString(entry?.match_id ?? entry?.matchId),
			date: timestamp(entry?.date ?? entry?.date_raw ?? entry?.dateRaw),
			rr: asNumber(entry?.rr ?? entry?.ranking_in_tier ?? entry?.rankingInTier),
			change: asNumber(entry?.last_change ?? entry?.lastChange ?? entry?.mmr_change_to_last_game ?? entry?.mmrChangeToLastGame),
			map: asString(entry?.map?.name ?? entry?.map) || undefined,
			tierName: asString(entry?.tier?.name ?? entry?.currenttier_patched ?? entry?.currenttierpatched ?? entry?.currentTierPatched) || undefined
		}))
		.filter((entry) => !!entry.matchId)
		.sort((a, b) => b.date - a.date);

	const rawMatches = matchArray(matchesBody)
		.map((match) => normalizeMatch(match, puuid, riot.name, riot.tag))
		.filter((match): match is PlayerMatch => !!match)
		.sort((a, b) => b.startedAt - a.startedAt);

	const matches = await Promise.all(
		rawMatches.map(async (match) => {
			if (!match.agentIcon) return match;
			const dataUrl = await fetchAssetDataUrl(match.agentIcon);
			return dataUrl ? { ...match, agentIcon: dataUrl } : match;
		})
	);

	return {
		account: {
			puuid,
			name: asString(account?.name ?? resolved.account?.name, riot.name),
			tag: asString(account?.tag ?? resolved.account?.tag, riot.tag)
		},
		rank: {
			tierId: asNumber(current?.tier?.id),
			name: rankName,
			rr: asNumber(current?.rr),
			lastChange: asNumber(current?.last_change ?? current?.lastChange),
			icon: rankIconResult.status === "fulfilled" ? rankIconResult.value : undefined
		},
		history,
		matches
	};
}

export const __test = {
	normalizeMatch,
	historyArray,
	totalRounds,
	normalizeRegion,
	matchDrawn,
	shouldUseRegionFallback,
	networkFailureStatus
};
