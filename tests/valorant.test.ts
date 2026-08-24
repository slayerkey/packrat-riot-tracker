import assert from "node:assert/strict";
import test from "node:test";

import { parseRiotId } from "../src/valorant/henrik";
import type { RuntimeState, TrackerSnapshot } from "../src/valorant/model";
import { renderMetric, renderTimer } from "../src/valorant/render";

function snapshot(overrides: Partial<TrackerSnapshot> = {}): TrackerSnapshot {
	return {
		fetchedAt: Date.now(),
		accountName: "Phoenix",
		accountTag: "1337",
		puuid: "fixture-puuid",
		rankName: "Ascendant 2",
		rankTierId: 23,
		rr: 67,
		lastChange: 22,
		lastMatch: {
			id: "match-1",
			startedAt: Date.now() - 60_000,
			map: "Ascent",
			agent: "Reyna",
			result: "win",
			kills: 24,
			deaths: 16,
			assists: 5,
			headshots: 21,
			bodyshots: 49,
			legshots: 7,
			damage: 4132,
			score: 6100,
			rounds: 24
		},
		headshotPercent: 27.27,
		damage: 4132,
		acs: 254.2,
		agents: [
			{ name: "Reyna", games: 5, wins: 4, losses: 1, winRate: 80, kills: 100, deaths: 76, kd: 1.3158, damage: 18000, acs: 255 },
			{ name: "Omen", games: 3, wins: 1, losses: 2, winRate: 33.33, kills: 49, deaths: 51, kd: 0.96, damage: 9200, acs: 201 }
		],
		maps: [
			{ name: "Ascent", games: 4, wins: 3, losses: 1, winRate: 75, kills: 70, deaths: 52, kd: 1.35, damage: 13000, acs: 248 },
			{ name: "Haven", games: 3, wins: 1, losses: 2, winRate: 33.33, kills: 45, deaths: 47, kd: 0.96, damage: 8700, acs: 199 }
		],
		recentMatches: [],
		history: [{ matchId: "match-1", date: Date.now() - 60_000, rr: 67, change: 22, map: "Ascent", tierName: "Ascendant 2" }],
		session: { wins: 4, losses: 2, netRr: 74 },
		...overrides
	};
}

function ready(value: TrackerSnapshot): RuntimeState {
	return { status: "ready", error: "none", snapshot: value };
}

test("Riot ID parser accepts Name#TAG and preserves embedded # in the name", () => {
	assert.deepEqual(parseRiotId("Phoenix#1337"), { name: "Phoenix", tag: "1337" });
	assert.deepEqual(parseRiotId("Very#Long#TAG"), { name: "Very#Long", tag: "TAG" });
	assert.equal(parseRiotId("Phoenix"), null);
	assert.equal(parseRiotId("#TAG"), null);
});

test("rank fixture renders mid-rank and RR", () => {
	const image = renderMetric("rank", ready(snapshot()), {}, undefined);
	assert.match(image, /ASCENDANT 2/);
	assert.match(image, /67 RR/);
});

test("Radiant, Immortal and unranked fixtures render readable states", () => {
	assert.match(renderMetric("rank", ready(snapshot({ rankName: "Radiant", rr: 812 })), {}, undefined), /RADIANT/);
	assert.match(renderMetric("rank", ready(snapshot({ rankName: "Immortal 3", rr: 344 })), {}, undefined), /IMMORTAL 3/);
	assert.match(renderMetric("rank", ready(snapshot({ rankName: "Unranked", rankTierId: 0, rr: 0 })), {}, undefined), /UNRANKED/);
});

test("positive and negative session fixtures are explicit", () => {
	assert.match(renderMetric("session-rr", ready(snapshot({ session: { wins: 4, losses: 2, netRr: 74 } })), {}, undefined), /\+74/);
	assert.match(renderMetric("session-rr", ready(snapshot({ session: { wins: 1, losses: 4, netRr: -32 } })), {}, undefined), /−32/);
	assert.match(renderMetric("session-record", ready(snapshot()), {}, undefined), /4W/);
	assert.match(renderMetric("session-record", ready(snapshot()), {}, undefined), /2L/);
});

test("last match, headshot, damage and ACS fixtures remain glanceable", () => {
	const state = ready(snapshot());
	assert.match(renderMetric("last-match", state, {}, undefined), /WIN/);
	assert.match(renderMetric("last-match", state, {}, undefined), /\+22 RR/);
	assert.match(renderMetric("headshot", state, {}, undefined), /27%/);
	assert.match(renderMetric("damage", state, {}, undefined), /4132/);
	assert.match(renderMetric("acs", state, {}, undefined), /254/);
});

test("slot settings select additional agents and maps for XL dashboards", () => {
	const state = ready(snapshot());
	assert.match(renderMetric("top-agent", state, { slot: 2 }, undefined), /OMEN/);
	assert.match(renderMetric("agent-kd", state, { slot: 2 }, undefined), /0\.96/);
	assert.match(renderMetric("top-map", state, { slot: 2 }, undefined), /HAVEN/);
	assert.match(renderMetric("map-win-rate", state, { slot: 2 }, undefined), /33%/);
});

test("no recent matches do not create blank keys", () => {
	const empty = ready(snapshot({ lastMatch: undefined, recentMatches: [], agents: [], maps: [], headshotPercent: null, damage: null, acs: null }));
	assert.match(renderMetric("recent-match", empty, {}, undefined), /NO MATCH/);
	assert.match(renderMetric("top-agent", empty, {}, undefined), /NO DATA/);
	assert.match(renderMetric("top-map", empty, {}, undefined), /NO DATA/);
});

test("all important error fixtures have visible key states", () => {
	const cases: Array<[RuntimeState["error"], RegExp]> = [
		["no-account", /SET ACCOUNT/],
		["no-api-key", /API KEY/],
		["invalid-riot-id", /BAD RIOT ID/],
		["invalid-region", /BAD REGION/],
		["invalid-key", /BAD KEY/],
		["rate-limited", /RATE LIMIT/],
		["offline", /OFFLINE/],
		["api-error", /API ERROR/]
	];
	for (const [error, expected] of cases) {
		assert.match(renderMetric("rr", { status: "error", error }, {}, undefined), expected);
	}
});

test("long player names never get injected into key SVG output", () => {
	const veryLong = "PlayerNameThatWouldNeverFitOnAKey";
	const image = renderMetric("rr", ready(snapshot({ accountName: veryLong })), {}, undefined);
	assert.ok(!image.includes(veryLong));
});

test("spike timer has idle, normal, warning, critical and complete states", () => {
	assert.match(renderTimer(null), /TAP TO START/);
	assert.match(renderTimer(45), />45</);
	assert.match(renderTimer(20), />20</);
	assert.match(renderTimer(7), />7</);
	assert.match(renderTimer(0), /DONE/);
	assert.match(renderTimer(0), /TAP TO RESTART/);
});

test("act countdown renders configured and missing-date states", () => {
	assert.match(renderMetric("act-countdown", ready(snapshot()), {}, undefined), /SET DATE/);
	const tomorrow = new Date(Date.now() + 30 * 60 * 60_000).toISOString();
	assert.match(renderMetric("act-countdown", ready(snapshot()), {}, tomorrow), /ACT ENDS|DAYS LEFT/);
});
