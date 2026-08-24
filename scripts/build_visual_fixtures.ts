import fs from "node:fs";
import path from "node:path";

import type { ActionSettings, RuntimeState, TrackerSnapshot } from "../src/valorant/model";
import { renderControl, renderMetric, renderTimer, type Metric } from "../src/valorant/render";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist", "visual-fixtures");
const PREFIX = "com.packrat.valorant-tracker.";
const KEY = 144;
const GAP = 18;
const PAD = 28;
const LABEL = 25;

const METRICS = new Set<Metric>([
	"rank",
	"rr",
	"session-rr",
	"session-record",
	"last-match",
	"headshot",
	"top-agent",
	"agent-kd",
	"agent-win-rate",
	"damage",
	"top-map",
	"map-win-rate",
	"acs",
	"recent-match",
	"act-countdown",
	"refresh"
]);

function fixtureSnapshot(): TrackerSnapshot {
	const now = Date.now();
	const recentMatches = [
		{ id: "m1", startedAt: now - 25 * 60_000, map: "Ascent", agent: "Jett", result: "win" as const, kills: 24, deaths: 16, assists: 5, headshots: 21, bodyshots: 49, legshots: 7, damage: 4132, score: 6100, rounds: 24 },
		{ id: "m2", startedAt: now - 85 * 60_000, map: "Haven", agent: "Omen", result: "loss" as const, kills: 18, deaths: 19, assists: 12, headshots: 14, bodyshots: 45, legshots: 6, damage: 3310, score: 4930, rounds: 23 },
		{ id: "m3", startedAt: now - 145 * 60_000, map: "Lotus", agent: "Jett", result: "win" as const, kills: 27, deaths: 15, assists: 4, headshots: 23, bodyshots: 51, legshots: 4, damage: 4460, score: 6480, rounds: 22 },
		{ id: "m4", startedAt: now - 205 * 60_000, map: "Bind", agent: "Sova", result: "win" as const, kills: 17, deaths: 14, assists: 15, headshots: 12, bodyshots: 38, legshots: 5, damage: 3065, score: 4380, rounds: 21 },
		{ id: "m5", startedAt: now - 265 * 60_000, map: "Ascent", agent: "Jett", result: "loss" as const, kills: 20, deaths: 18, assists: 6, headshots: 17, bodyshots: 44, legshots: 5, damage: 3655, score: 5220, rounds: 24 }
	];
	return {
		fetchedAt: now,
		accountName: "Fixture",
		accountTag: "QA",
		puuid: "fixture-puuid",
		rankName: "Ascendant 2",
		rankTierId: 23,
		rr: 67,
		lastChange: 22,
		lastMatch: recentMatches[0],
		headshotPercent: 27,
		damage: 4132,
		acs: 254,
		agents: [
			{ name: "Jett", games: 5, wins: 3, losses: 2, winRate: 60, kills: 108, deaths: 82, kd: 1.32, damage: 19000, acs: 258 },
			{ name: "Omen", games: 3, wins: 2, losses: 1, winRate: 66.7, kills: 55, deaths: 49, kd: 1.12, damage: 9800, acs: 214 },
			{ name: "Sova", games: 2, wins: 1, losses: 1, winRate: 50, kills: 35, deaths: 31, kd: 1.13, damage: 6600, acs: 207 }
		],
		maps: [
			{ name: "Ascent", games: 4, wins: 3, losses: 1, winRate: 75, kills: 78, deaths: 60, kd: 1.3, damage: 14000, acs: 249 },
			{ name: "Haven", games: 3, wins: 1, losses: 2, winRate: 33.3, kills: 48, deaths: 50, kd: 0.96, damage: 9000, acs: 201 },
			{ name: "Lotus", games: 2, wins: 2, losses: 0, winRate: 100, kills: 51, deaths: 33, kd: 1.55, damage: 8500, acs: 271 }
		],
		recentMatches,
		history: [
			{ matchId: "m1", date: recentMatches[0].startedAt, rr: 67, change: 22, map: "Ascent", tierName: "Ascendant 2" }
		],
		session: { wins: 4, losses: 2, netRr: 74 }
	};
}

function imageHref(svg: string): string {
	return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function keySvg(actionUuid: string, settings: ActionSettings, state: RuntimeState): string {
	const suffix = actionUuid.startsWith(PREFIX) ? actionUuid.slice(PREFIX.length) : actionUuid;
	if (METRICS.has(suffix as Metric)) {
		const actEnd = new Date(Date.now() + 5 * 24 * 60 * 60_000).toISOString();
		return renderMetric(suffix as Metric, state, settings, actEnd);
	}
	if (suffix === "log-win") return renderControl("LOG WIN", "TAP AFTER MATCH", "#35d07f");
	if (suffix === "log-loss") return renderControl("LOG LOSS", "TAP AFTER MATCH", "#ff4655");
	if (suffix === "session-reset") return renderControl("HOLD", "RESET SESSION", "#ff4655");
	if (suffix === "spike-timer") return renderTimer(18);
	return renderControl("UNKNOWN", suffix.toUpperCase(), "#f0ad4e");
}

function labelFor(actionUuid: string, settings: ActionSettings): string {
	const suffix = actionUuid.startsWith(PREFIX) ? actionUuid.slice(PREFIX.length) : actionUuid;
	const slot = settings.slot ? ` #${settings.slot}` : "";
	return `${suffix.replaceAll("-", " ")}${slot}`.toUpperCase();
}

function escapeXml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? char);
}

function buildDashboard(slug: string): void {
	const definition = JSON.parse(fs.readFileSync(path.join(ROOT, "profiles", `${slug}.json`), "utf8"));
	const columns = definition.grid.columns as number;
	const rows = definition.grid.rows as number;
	const width = PAD * 2 + columns * KEY + (columns - 1) * GAP;
	const height = PAD * 2 + rows * (KEY + LABEL) + (rows - 1) * GAP;
	const state: RuntimeState = { status: "ready", error: "none", snapshot: fixtureSnapshot() };
	const body: string[] = [];
	for (const key of definition.keys) {
		const settings: ActionSettings = key.settings ?? {};
		const x = PAD + key.column * (KEY + GAP);
		const y = PAD + key.row * (KEY + LABEL + GAP);
		body.push(`<image href="${imageHref(keySvg(key.action, settings, state))}" x="${x}" y="${y}" width="${KEY}" height="${KEY}"/>`);
		body.push(`<text x="${x + KEY / 2}" y="${y + KEY + 18}" text-anchor="middle" fill="#9b9ba6" font-family="Arial,sans-serif" font-size="10" font-weight="700">${escapeXml(labelFor(key.action, settings))}</text>`);
	}
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#070709"/>${body.join("")}</svg>`;
	fs.writeFileSync(path.join(DIST, `${slug}.svg`), svg);
}

function buildStates(): void {
	const cases: Array<{ label: string; svg: string }> = [
		{ label: "SET ACCOUNT", svg: renderMetric("rr", { status: "error", error: "no-account" }, {}) },
		{ label: "NO API KEY", svg: renderMetric("rr", { status: "error", error: "no-api-key" }, {}) },
		{ label: "BAD KEY", svg: renderMetric("rr", { status: "error", error: "invalid-key" }, {}) },
		{ label: "RATE LIMIT", svg: renderMetric("rr", { status: "error", error: "rate-limited" }, {}) },
		{ label: "OFFLINE", svg: renderMetric("rr", { status: "error", error: "offline" }, {}) },
		{ label: "API ERROR", svg: renderMetric("rr", { status: "error", error: "api-error" }, {}) },
		{ label: "SPIKE 45", svg: renderTimer(45) },
		{ label: "SPIKE 20", svg: renderTimer(20) },
		{ label: "SPIKE 7", svg: renderTimer(7) },
		{ label: "SPIKE DONE", svg: renderTimer(0) }
	];
	const columns = 5;
	const rows = 2;
	const width = PAD * 2 + columns * KEY + (columns - 1) * GAP;
	const height = PAD * 2 + rows * (KEY + LABEL) + (rows - 1) * GAP;
	const body = cases.map((item, index) => {
		const column = index % columns;
		const row = Math.floor(index / columns);
		const x = PAD + column * (KEY + GAP);
		const y = PAD + row * (KEY + LABEL + GAP);
		return `<image href="${imageHref(item.svg)}" x="${x}" y="${y}" width="${KEY}" height="${KEY}"/><text x="${x + KEY / 2}" y="${y + KEY + 18}" text-anchor="middle" fill="#9b9ba6" font-family="Arial,sans-serif" font-size="10" font-weight="700">${escapeXml(item.label)}</text>`;
	}).join("");
	fs.writeFileSync(path.join(DIST, "states.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#070709"/>${body}</svg>`);
}

fs.mkdirSync(DIST, { recursive: true });
for (const slug of ["standard", "xl", "neo"]) buildDashboard(slug);
buildStates();
console.log(`VISUAL FIXTURES BUILT ${path.relative(ROOT, DIST)}`);
