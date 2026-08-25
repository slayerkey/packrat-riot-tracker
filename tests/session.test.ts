import assert from "node:assert/strict";
import test from "node:test";

import type { MmrHistoryPoint, PlayerMatch, TrackerSnapshot } from "../src/valorant/model";
import { appendManualResult, knownMatchIds, newSession, newSessionFromBaseline, reconcileSession } from "../src/valorant/session";

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

function historyFor(value: PlayerMatch, change = value.result === "win" ? 20 : -18): MmrHistoryPoint {
	return { matchId: value.id, date: value.startedAt, rr: 50, change };
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
	const view = reconcileSession(session, [historyFor(oldButPreviouslyUnseen)], [oldButPreviouslyUnseen]);
	assert.equal(view.wins, 0);
	assert.equal(view.losses, 0);
	assert.equal(view.netRr, 0);
});

test("manual result stays counted against matches that were already known when tapped", () => {
	const now = 1_800_000_000_000;
	const known = match("known-win", now - 5 * 60_000, "win");
	let session = newSessionFromBaseline([], now - 30 * 60_000);
	session = appendManualResult(session, "win", [known.id], undefined, now, "manual-1");
	const view = reconcileSession(session, [], [known]);
	assert.equal(view.wins, 2);
	assert.equal(view.session.manual[0]?.reconciledMatchId, undefined);
});

test("manual result reconciles once a previously unknown API match arrives", () => {
	const now = 1_800_000_000_000;
	const arrivedLater = match("new-win", now - 20 * 60_000, "win");
	let session = newSessionFromBaseline(["old-match"], now - 30 * 60_000);
	session = appendManualResult(session, "win", ["old-match"], undefined, now, "manual-1");
	const view = reconcileSession(session, [], [arrivedLater]);
	assert.equal(view.wins, 1);
	assert.equal(view.session.manual[0]?.reconciledMatchId, "new-win");
});

test("five rapid wins and two rapid losses are deterministic without new API matches", () => {
	const now = 1_800_000_000_000;
	let session = newSessionFromBaseline([], now);
	for (let index = 0; index < 5; index++) {
		session = appendManualResult(session, "win", [], undefined, now + index, `win-${index}`);
	}
	for (let index = 0; index < 2; index++) {
		session = appendManualResult(session, "loss", [], undefined, now + 10 + index, `loss-${index}`);
	}
	const view = reconcileSession(session, [], []);
	assert.equal(view.wins, 5);
	assert.equal(view.losses, 2);
	assert.equal(view.netRr, 0);
});

test("twenty alternating manual results remain present and ordered", () => {
	const now = 1_800_000_000_000;
	let session = newSessionFromBaseline([], now);
	for (let index = 0; index < 20; index++) {
		session = appendManualResult(session, index % 2 === 0 ? "win" : "loss", [], undefined, now + index, `manual-${index}`);
	}
	const view = reconcileSession(session, [], []);
	assert.equal(view.wins, 10);
	assert.equal(view.losses, 10);
	assert.deepEqual(view.session.manual.map((entry) => entry.id), Array.from({ length: 20 }, (_, index) => `manual-${index}`));
});

test("repeated API snapshots are idempotent", () => {
	const now = 1_800_000_000_000;
	const win = match("api-win", now + 60_000, "win");
	const loss = match("api-loss", now + 120_000, "loss");
	let session = newSessionFromBaseline([], now);
	const first = reconcileSession(session, [historyFor(win), historyFor(loss)], [win, loss]);
	session = first.session;
	const second = reconcileSession(session, [historyFor(win), historyFor(loss)], [win, loss]);
	assert.deepEqual(
		{ wins: second.wins, losses: second.losses, netRr: second.netRr, session: second.session },
		{ wins: first.wins, losses: first.losses, netRr: first.netRr, session: first.session }
	);
});

test("reset followed immediately by the same refresh stays zero", () => {
	const now = 1_800_000_000_000;
	const win = match("old-win", now - 120_000, "win");
	const loss = match("old-loss", now - 60_000, "loss");
	const oldCache = cache(now);
	oldCache.recentMatches = [win, loss];
	oldCache.history = [historyFor(win), historyFor(loss)];
	oldCache.lastMatch = loss;
	const session = newSession(oldCache, now);
	const view = reconcileSession(session, oldCache.history, oldCache.recentMatches);
	assert.deepEqual({ wins: view.wins, losses: view.losses, netRr: view.netRr }, { wins: 0, losses: 0, netRr: 0 });
});

test("a new API match can replace a manual result without changing the visible record", () => {
	const now = 1_800_000_000_000;
	let session = newSessionFromBaseline([], now);
	session = appendManualResult(session, "win", [], 18, now + 1_000, "manual-win");
	const before = reconcileSession(session, [], []);
	assert.deepEqual({ wins: before.wins, losses: before.losses, netRr: before.netRr }, { wins: 1, losses: 0, netRr: 18 });

	const apiWin = match("api-win", now + 2_000, "win");
	const after = reconcileSession(before.session, [historyFor(apiWin, 18)], [apiWin]);
	assert.deepEqual({ wins: after.wins, losses: after.losses, netRr: after.netRr }, { wins: 1, losses: 0, netRr: 18 });
	assert.equal(after.session.manual[0]?.reconciledMatchId, "api-win");
});

test("deterministic 1000 transition stress run preserves reset and idempotency invariants", () => {
	let seed = 0x5eed1234;
	const random = () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed / 0x1_0000_0000;
	};

	let now = 1_800_000_000_000;
	let session = newSessionFromBaseline([], now);
	const matches: PlayerMatch[] = [];
	const history: MmrHistoryPoint[] = [];
	let nextMatch = 0;
	let nextManual = 0;

	for (let step = 0; step < 1000; step++) {
		now += 1000;
		const operation = Math.floor(random() * 6);
		if (operation === 0 || operation === 1) {
			session = appendManualResult(
				session,
				operation === 0 ? "win" : "loss",
				matches.map((item) => item.id),
				undefined,
				now,
				`manual-${nextManual++}`
			);
		} else if (operation === 2 || operation === 3) {
			const value = match(`api-${nextMatch++}`, now, operation === 2 ? "win" : "loss");
			matches.unshift(value);
			history.unshift(historyFor(value));
		} else if (operation === 5) {
			const baselineCache = cache(now);
			baselineCache.recentMatches = [...matches];
			baselineCache.history = [...history];
			baselineCache.lastMatch = matches[0];
			session = newSession(baselineCache, now);
			const resetView = reconcileSession(session, history, matches);
			assert.deepEqual(
				{ wins: resetView.wins, losses: resetView.losses, netRr: resetView.netRr },
				{ wins: 0, losses: 0, netRr: 0 },
				`reset invariant failed at transition ${step}`
			);
		}

		const first = reconcileSession(session, history, matches);
		session = first.session;
		const second = reconcileSession(session, history, matches);
		assert.deepEqual(
			{ wins: second.wins, losses: second.losses, netRr: second.netRr, manual: second.session.manual },
			{ wins: first.wins, losses: first.losses, netRr: first.netRr, manual: first.session.manual },
			`idempotency failed at transition ${step}`
		);
		assert.ok(first.wins >= 0 && first.losses >= 0, `negative record at transition ${step}`);
		for (const entry of first.session.manual) {
			if (entry.reconciledMatchId) assert.ok(!first.session.baselineMatchIds.includes(entry.reconciledMatchId));
		}
	}
});
