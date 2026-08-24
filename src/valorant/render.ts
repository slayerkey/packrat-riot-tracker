import type { ActionSettings, RuntimeState, TrackerSnapshot } from "./model";

export type Metric =
	| "rank"
	| "rr"
	| "session-rr"
	| "session-record"
	| "last-match"
	| "headshot"
	| "top-agent"
	| "agent-kd"
	| "agent-win-rate"
	| "damage"
	| "top-map"
	| "map-win-rate"
	| "acs"
	| "recent-match"
	| "act-countdown"
	| "refresh";

const BG = "#0b0b0e";
const PANEL = "#131318";
const WHITE = "#f7f7f8";
const MUTED = "#9b9ba6";
const RED = "#ff4655";
const GREEN = "#35d07f";
const AMBER = "#f0ad4e";

function esc(value: unknown): string {
	return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? char);
}

function svg(content: string, accent = RED): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
	<rect width="144" height="144" rx="18" fill="${BG}"/>
	<rect x="6" y="6" width="132" height="132" rx="14" fill="${PANEL}" stroke="#23232b"/>
	<rect x="6" y="132" width="132" height="6" rx="3" fill="${accent}"/>
	${content}
	</svg>`;
}

function label(text: string): string {
	return `<text x="72" y="25" text-anchor="middle" fill="${MUTED}" font-family="Arial,sans-serif" font-size="12" font-weight="700" letter-spacing="1">${esc(text)}</text>`;
}

function main(value: string, size = 44, y = 85, color = WHITE): string {
	return `<text x="72" y="${y}" text-anchor="middle" fill="${color}" font-family="Arial,sans-serif" font-size="${size}" font-weight="800">${esc(value)}</text>`;
}

function sub(value: string, y = 111, color = MUTED, size = 13): string {
	return `<text x="72" y="${y}" text-anchor="middle" fill="${color}" font-family="Arial,sans-serif" font-size="${size}" font-weight="700">${esc(value)}</text>`;
}

function shortName(value: string, max = 12): string {
	const text = value.trim();
	return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

function signed(value: number, suffix = ""): string {
	if (value > 0) return `+${Math.round(value)}${suffix}`;
	if (value < 0) return `−${Math.abs(Math.round(value))}${suffix}`;
	return `0${suffix}`;
}

function rankColor(rank: string): string {
	const value = rank.toLowerCase();
	if (value.includes("radiant")) return "#f7d77a";
	if (value.includes("immortal")) return "#e65d8b";
	if (value.includes("ascendant")) return "#59d6a2";
	if (value.includes("diamond")) return "#b37df2";
	if (value.includes("platinum")) return "#66d5d8";
	if (value.includes("gold")) return "#e9bd55";
	if (value.includes("silver")) return "#b6c4cf";
	if (value.includes("bronze")) return "#c17c50";
	if (value.includes("iron")) return "#81818a";
	return RED;
}

function rankMark(rank: string, color: string): string {
	const parts = rank.split(/\s+/);
	const division = parts.at(-1)?.match(/^\d$/) ? parts.at(-1) : "";
	const tier = parts[0]?.slice(0, 3).toUpperCase() ?? "VAL";
	return `<path d="M72 35 98 50 91 80 72 101 53 80 46 50Z" fill="${color}" opacity=".2" stroke="${color}" stroke-width="3"/>
	<path d="M72 43 89 53 84 73 72 88 60 73 55 53Z" fill="${color}" opacity=".8"/>
	<text x="72" y="67" text-anchor="middle" fill="${BG}" font-family="Arial,sans-serif" font-size="12" font-weight="900">${esc(tier)}${esc(division)}</text>`;
}

function errorImage(state: RuntimeState): string {
	if (state.status === "loading" && !state.snapshot) return svg(`${label("VALORANT")}${main("…", 48)}${sub("LOADING")}`, RED);
	const mapping: Record<string, [string, string]> = {
		"no-account": ["SET ACCOUNT", "Name#TAG"],
		"no-api-key": ["API KEY", "HenrikDev"],
		"invalid-riot-id": ["BAD RIOT ID", "Use Name#TAG"],
		"invalid-region": ["BAD REGION", "Check setup"],
		"invalid-key": ["BAD KEY", "HenrikDev"],
		"rate-limited": ["RATE LIMIT", "Try later"],
		offline: ["OFFLINE", "Check network"],
		"not-found": ["NOT FOUND", "Check Riot ID"],
		"api-error": ["API ERROR", "HenrikDev"]
	};
	const [title, detail] = mapping[state.error] ?? ["NO DATA", "Open settings"];
	return svg(`${label("VALORANT")}${main(title, title.length > 9 ? 22 : 28, 76, state.error === "rate-limited" ? AMBER : RED)}${sub(detail, 105)}`, state.error === "rate-limited" ? AMBER : RED);
}

function selected<T>(items: T[], settings: ActionSettings): T | undefined {
	const slot = Math.max(1, Math.min(5, Math.round(settings.slot ?? 1)));
	return items[slot - 1];
}

function countdown(dateText: string | undefined): { primary: string; secondary: string } | null {
	if (!dateText) return null;
	const end = Date.parse(dateText);
	if (!Number.isFinite(end)) return null;
	const diff = Math.max(0, end - Date.now());
	const hours = Math.floor(diff / 3_600_000);
	const days = Math.floor(hours / 24);
	if (days >= 3) return { primary: String(days), secondary: "DAYS LEFT" };
	if (hours >= 1) return { primary: `${Math.floor(hours / 24)}D ${hours % 24}H`, secondary: "ACT ENDS" };
	const mins = Math.max(0, Math.floor(diff / 60_000));
	return { primary: `${mins}M`, secondary: "ACT ENDS" };
}

export function renderMetric(metric: Metric, state: RuntimeState, settings: ActionSettings, actEndDate?: string): string {
	const snapshot = state.snapshot;
	if (!snapshot) return errorImage(state);
	const stale = Date.now() - snapshot.fetchedAt > 15 * 60_000;
	const staleAccent = stale ? AMBER : RED;

	if (state.status === "error" && stale) {
		// Keep the last known good information visible, but the amber footer makes staleness obvious.
	}

	switch (metric) {
		case "rank": {
			const color = rankColor(snapshot.rankName);
			return svg(`${label(shortName(snapshot.rankName, 15).toUpperCase())}${rankMark(snapshot.rankName, color)}${sub(`${snapshot.rr} RR`, 119, WHITE, 16)}`, stale ? AMBER : color);
		}
		case "rr": {
			const changeColor = snapshot.lastChange > 0 ? GREEN : snapshot.lastChange < 0 ? RED : MUTED;
			return svg(`${label("CURRENT RR")}${main(String(snapshot.rr), 52)}${sub(signed(snapshot.lastChange, " LAST"), 111, changeColor, 13)}`, staleAccent);
		}
		case "session-rr": {
			const value = snapshot.session.netRr;
			const color = value > 0 ? GREEN : value < 0 ? RED : WHITE;
			return svg(`${label("SESSION")}${main(signed(value), 42, 81, color)}${sub("RR", 109, color)}`, stale ? AMBER : color);
		}
		case "session-record":
			return svg(`${label("SESSION")}<text x="46" y="82" text-anchor="middle" fill="${GREEN}" font-family="Arial,sans-serif" font-size="34" font-weight="900">${snapshot.session.wins}W</text><text x="98" y="82" text-anchor="middle" fill="${RED}" font-family="Arial,sans-serif" font-size="34" font-weight="900">${snapshot.session.losses}L</text>${sub(`${snapshot.session.wins + snapshot.session.losses} GAMES`, 108)}`, staleAccent);
		case "last-match": {
			const result = snapshot.lastMatch?.result ?? "unknown";
			const word = result === "win" ? "WIN" : result === "loss" ? "LOSS" : result === "draw" ? "DRAW" : "NO MATCH";
			const color = result === "win" ? GREEN : result === "loss" ? RED : MUTED;
			return svg(`${label("LAST MATCH")}${main(word, word.length > 5 ? 26 : 38, 76, color)}${sub(signed(snapshot.lastChange, " RR"), 107, snapshot.lastChange >= 0 ? GREEN : RED, 15)}`, stale ? AMBER : color);
		}
		case "headshot":
			return svg(`${label("HEADSHOT")}${main(snapshot.headshotPercent == null ? "—" : `${Math.round(snapshot.headshotPercent)}%`, 44)}${sub("RECENT COMP", 111)}`, staleAccent);
		case "damage":
			return svg(`${label("DAMAGE")}${main(snapshot.damage == null ? "—" : String(Math.round(snapshot.damage)), snapshot.damage != null && snapshot.damage >= 10000 ? 34 : 42)}${sub("LAST MATCH", 111)}`, staleAccent);
		case "acs":
			return svg(`${label("ACS")}${main(snapshot.acs == null ? "—" : String(Math.round(snapshot.acs)), 48)}${sub("RECENT COMP", 111)}`, staleAccent);
		case "top-agent": {
			const item = selected(snapshot.agents, settings);
			if (!item) return svg(`${label("TOP AGENT")}${main("—", 42)}${sub("NO DATA")}`, staleAccent);
			return svg(`${label(`AGENT #${settings.slot ?? 1}`)}${main(shortName(item.name.toUpperCase(), 10), item.name.length > 8 ? 25 : 31, 73)}${sub(`${item.kd.toFixed(2)} KD · ${Math.round(item.winRate)}% WR`, 105, WHITE, 12)}`, staleAccent);
		}
		case "agent-kd": {
			const item = selected(snapshot.agents, settings);
			return svg(`${label(item ? shortName(item.name.toUpperCase(), 12) : "AGENT KD")}${main(item ? item.kd.toFixed(2) : "—", 48)}${sub("K/D", 111)}`, staleAccent);
		}
		case "agent-win-rate": {
			const item = selected(snapshot.agents, settings);
			return svg(`${label(item ? shortName(item.name.toUpperCase(), 12) : "AGENT WR")}${main(item ? `${Math.round(item.winRate)}%` : "—", 46)}${sub(item ? `${item.wins}W ${item.losses}L` : "NO DATA", 111)}`, staleAccent);
		}
		case "top-map": {
			const item = selected(snapshot.maps, settings);
			if (!item) return svg(`${label("TOP MAP")}${main("—", 42)}${sub("NO DATA")}`, staleAccent);
			return svg(`${label(`MAP #${settings.slot ?? 1}`)}${main(shortName(item.name.toUpperCase(), 11), item.name.length > 9 ? 25 : 31, 74)}${sub(`${Math.round(item.winRate)}% WR · ${item.games}G`, 106, WHITE, 12)}`, staleAccent);
		}
		case "map-win-rate": {
			const item = selected(snapshot.maps, settings);
			return svg(`${label(item ? shortName(item.name.toUpperCase(), 12) : "MAP WR")}${main(item ? `${Math.round(item.winRate)}%` : "—", 46)}${sub(item ? `${item.wins}W ${item.losses}L` : "NO DATA", 111)}`, staleAccent);
		}
		case "recent-match": {
			const item = selected(snapshot.recentMatches, settings);
			if (!item) return svg(`${label("RECENT")}${main("—", 42)}${sub("NO MATCH")}`, staleAccent);
			const resultColor = item.result === "win" ? GREEN : item.result === "loss" ? RED : MUTED;
			return svg(`${label(`MATCH #${settings.slot ?? 1}`)}${main(item.result === "win" ? "WIN" : item.result === "loss" ? "LOSS" : "DRAW", 32, 69, resultColor)}${sub(`${shortName(item.map, 9)} · ${item.kills}/${item.deaths}`, 100, WHITE, 12)}${sub(shortName(item.agent, 10).toUpperCase(), 117, MUTED, 10)}`, stale ? AMBER : resultColor);
		}
		case "act-countdown": {
			const value = countdown(actEndDate);
			return value ? svg(`${label("ACT")}${main(value.primary, value.primary.length > 4 ? 34 : 50)}${sub(value.secondary, 111)}`, staleAccent) : svg(`${label("ACT")}${main("SET DATE", 25, 77)}${sub("OPTIONAL", 106)}`, staleAccent);
		}
		case "refresh": {
			const age = Math.max(0, Math.round((Date.now() - snapshot.fetchedAt) / 60_000));
			return svg(`${label("REFRESH")}${main(state.status === "loading" ? "…" : "READY", 31, 76, state.status === "loading" ? AMBER : WHITE)}${sub(age < 1 ? "JUST NOW" : `${age}M AGO`, 107)}`, state.status === "loading" ? AMBER : staleAccent);
		}
	}
}

export function renderControl(title: string, detail: string, accent = RED): string {
	return svg(`${label("VALORANT")}${main(title, title.length > 7 ? 25 : 34, 76)}${sub(detail, 107)}`, accent);
}

export function renderTimer(remainingSeconds: number | null): string {
	if (remainingSeconds == null) return svg(`${label("SPIKE")}${main("45", 54)}${sub("TAP TO START", 112)}`, RED);
	const value = Math.max(0, Math.ceil(remainingSeconds));
	const accent = value <= 7 ? RED : value <= 20 ? AMBER : WHITE;
	return svg(`${label(value > 0 ? "SPIKE" : "DONE")}${main(String(value), 58, 88, accent)}${sub(value > 0 ? "TAP TO RESET" : "TAP TO RESTART", 117, accent, 11)}`, accent);
}
