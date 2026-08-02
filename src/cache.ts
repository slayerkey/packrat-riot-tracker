/**
 * Last known good store for tracked accounts, kept in Stream Deck's global settings the same way
 * plugins/_shared/src/cache.ts does for the ESPN trackers. That gives every action instance the
 * same view and survives a plugin restart, which is what lets a key redraw instantly on
 * onWillAppear before the first network poll has even started.
 *
 * It also doubles as the only history Riot's API does not provide: league-v4 / tft-league-v1
 * are a snapshot of right now, with no endpoint anywhere for "what was my LP yesterday". So this
 * plugin takes its own timestamped snapshot on every poll and keeps a short trailing window of
 * them per tracked account+queue, which is what "progress" is computed from. There is nothing to
 * show until tracking has been running for a while; that is a real limitation, not a bug.
 *
 * Keyed by Riot ID rather than puuid, deliberately: the key needs to be buildable from the
 * action's own settings with no network round trip, so a key can redraw from cache the instant
 * it appears.
 */
import streamDeck from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

export type RankSnapshot = {
	fetchedAt: number;
	tier: string;
	rank: string;
	leaguePoints: number;
	wins: number;
	losses: number;
};

export type RiotCache = {
	snapshots?: Record<string, RankSnapshot[]>;
};

/** Snapshots older than this are dropped on every write, so global settings cannot grow forever. */
export const MAX_SNAPSHOT_AGE_MS = 30 * 24 * 60 * 60_000;

export const WINDOW_24H_MS = 24 * 60 * 60_000;
export const WINDOW_7D_MS = 7 * 24 * 60 * 60_000;

export function snapshotKey(game: "lol" | "tft", platform: string, gameName: string, tagLine: string, queueType: string): string {
	return `${game}:${platform}:${gameName.trim().toLowerCase()}#${tagLine.trim().toLowerCase()}:${queueType}`;
}

export async function readCache(): Promise<RiotCache> {
	return ((await streamDeck.settings.getGlobalSettings()) as RiotCache) ?? {};
}

/** Appends one snapshot for `key`, prunes anything past MAX_SNAPSHOT_AGE_MS, and returns the
 *  resulting list (oldest first). */
export async function appendSnapshot(key: string, snapshot: RankSnapshot): Promise<RankSnapshot[]> {
	const cache = await readCache();
	const cutoff = snapshot.fetchedAt - MAX_SNAPSHOT_AGE_MS;
	const pruned = (cache.snapshots?.[key] ?? []).filter((s) => s.fetchedAt >= cutoff);
	pruned.push(snapshot);
	const next: RiotCache = { ...cache, snapshots: { ...(cache.snapshots ?? {}), [key]: pruned } };
	await streamDeck.settings.setGlobalSettings(next as unknown as JsonObject);
	return pruned;
}

export function snapshotsFor(cache: RiotCache, key: string): RankSnapshot[] {
	return cache.snapshots?.[key] ?? [];
}

export function latest(snapshots: RankSnapshot[]): RankSnapshot | undefined {
	return snapshots[snapshots.length - 1];
}

/** The most recent snapshot at or before `windowMs` ago. Undefined when history does not reach
 *  back that far yet, which is expected for the first `windowMs` after tracking starts. */
export function snapshotAround(snapshots: RankSnapshot[], windowMs: number, nowMs: number): RankSnapshot | undefined {
	const target = nowMs - windowMs;
	let best: RankSnapshot | undefined;
	for (const s of snapshots) {
		if (s.fetchedAt <= target) best = s;
	}
	return best;
}

const TIER_ORDER = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
const DIVISION_VALUE: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 };

/** A single comparable number for a tier+division+LP, so two snapshots can be compared even when
 *  the player has been promoted or demoted between them. Approximate (divisions are not exactly
 *  100 LP wide at every tier) but good enough for a "moved up/down" indicator on a key. */
function rankScore(s: RankSnapshot): number {
	const tierIndex = Math.max(TIER_ORDER.indexOf(s.tier.toUpperCase()), 0);
	const division = DIVISION_VALUE[s.rank.toUpperCase()] ?? 0;
	return (tierIndex * 4 + division) * 100 + s.leaguePoints;
}

export type Delta = { lpDelta: number; tierChanged: boolean; label: string };

/** Compares the latest snapshot against an older one, for the "since 24h ago" / "since 7 days
 *  ago" line on the key. Undefined when there is no earlier snapshot to compare against. */
export function describeDelta(now: RankSnapshot, then: RankSnapshot | undefined, label: string): Delta | undefined {
	if (!then) return undefined;
	return { lpDelta: rankScore(now) - rankScore(then), tierChanged: now.tier !== then.tier || now.rank !== then.rank, label };
}
