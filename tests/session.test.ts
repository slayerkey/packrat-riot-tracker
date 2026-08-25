import assert from "node:assert/strict";
import test from "node:test";

import type { PlayerMatch, TrackerSnapshot } from "../src/valorant/model";
import { knownMatchIds, newSession, reconcileSession } from "../src/valorant/session";

function match(id: string, startedAt: number, result: "win" | "loss" = "win"): PlayerMatch {
	return {
		id,
		startedAt,
		map: "Ascent",
		agent: "Omen",
		result,
		kills: 10,
		deaths: 10,
		assists: 5,
		headshots: 10,
		bodyshots: 20,
		legshots: 2,
		damage: 2000,
		score: 3000,
		rounds: 20
	};
}

function cache(now: number): TrackerSnapshot {
	const recent = match("recent-only", now - 60_000, "win");
	return {
		fetchedAt: now,
		accountName: "Phoenix",
		accountTag: "1337",
		puuid: "fixture-puuid",
		rankName: "Ascendant 2",
		rankTierId: 22,
		rr: 65,
		lastChange: -19,
		lastMatch: recent,
		headshotPercent: 23,
		damage: 2726,
		acs: 210,
		agents: [],
		maps: [],
		recentMatches: [recent, match("history-and-recent", now - 120_000, "loss")],
		history: [{ matchId: "history-and-recent", date: now - 120_000, rr: 65, change: -19 }],
		session: { wins: 3, losses: 1, netRr: 20 }
	};
}

test("session reset baselines every match already visible in cache", () => {
	const now = 1_800_000_000_000;
	const snapshot = cache(now);
	assert.deepEqual(new Set(knownMatchIds(snapshot)), new Set(["history-and-recent", "recent-only"]));
	const session = newSession(snapshot, now);
	assert.deepEqual(new Set(session.baselineMatchIds), new Set(["history-and-recent", "recent-only"]));
});

test("matches from before a reset never rebound into the new session", () => {
	const now = 1_800_000_000_000;
	const session = newSession(cache(now), now);
	const oldButPreviouslyUnseen = match("late-old-match", now - 30_000, "win");
	const view = reconcileSession(
		session,
		[{ matchId: "late-old-match", date: now - 30_000, rr: 84, change: 19 }],
		[oldButPreviouslyUnseen]
	);
	assert.equal(view.wins, 0);
	assert.equal(view.losses, 0);
	assert.equal(view.netRr, 0);
});

test("manual result stays counted against matches that were already known when tapped", () => {
	const now = 1_800_000_000_000;
	const known = match("known-win", now - 5 * 60_000, "win");
	const session = {
		startedAt: now - 30 * 60_000,
		baselineMatchIds: [],
		manual: [
			{
				id: "manual-1",
				result: "win" as const,
				createdAt: now,
				knownMatchIds: [known.id]
			}
		]
	};
	const view = reconcileSession(session, [], [known]);
	assert.equal(view.wins, 2);
	assert.equal(view.session.manual[0]?.reconciledMatchId, undefined);
});

test("manual result reconciles once a previously unknown API match arrives", () => {
	const now = 1_800_000_000_000;
	const arrivedLater = match("new-win", now - 20 * 60_000, "win");
	const session = {
		startedAt: now - 30 * 60_000,
		baselineMatchIds: ["old-match"],
		manual: [
			{
				id: "manual-1",
				result: "win" as const,
				createdAt: now,
				knownMatchIds: ["old-match"]
			}
		]
	};
	const view = reconcileSession(session, [], [arrivedLater]);
	assert.equal(view.wins, 1);
	assert.equal(view.session.manual[0]?.reconciledMatchId, "new-win");
});
