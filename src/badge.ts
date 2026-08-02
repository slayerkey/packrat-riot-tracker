/**
 * Dynamic key faces for the Riot rank actions, same technique as plugins/_shared/src/badge.ts:
 * a key face is an SVG string, wrapped as a base64 data URI for setImage() (raw markup and a
 * plain-text data URI both silently fail to render). Every function here is pure.
 *
 * Design rule: tier name and colour coding only, text and rects. No rank badge artwork, no
 * League or TFT logos, no Riot branding of any kind on a key.
 */

const W = 144;
const BG = "#080a10";
const PANEL = "#141822";
const TEXT = "#f5faf8";
const MUTED = "#c4cee0";
const POSITIVE = "#2be86a";
const NEGATIVE = "#e0433d";
const STALE = "#f2b33d";
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Generic, non-official tier colours used only for text/background coding on a key, never as
 *  rank badge artwork. */
const TIER_COLOR: Record<string, string> = {
	IRON: "#5b5a57",
	BRONZE: "#8c5a3c",
	SILVER: "#9fa8b5",
	GOLD: "#d4af37",
	PLATINUM: "#3fd6c4",
	EMERALD: "#2be86a",
	DIAMOND: "#576bdb",
	MASTER: "#9b4fd6",
	GRANDMASTER: "#e0433d",
	CHALLENGER: "#f1c86b"
};

export function tierColor(tier: string): string {
	return TIER_COLOR[tier.toUpperCase()] ?? "#2a2f3a";
}

export function escapeXml(s: string): string {
	return String(s).replace(
		/[&<>"']/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] as string
	);
}

function luminance(color: string): number | null {
	const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
	if (!m) return null;
	const n = parseInt(m[1], 16);
	const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Picks black or white text for a filled tier colour. Perceived luminance, not a naive average,
 *  because gold and silver are bright enough to swallow white text. */
function readableOn(color: string): string {
	const l = luminance(color);
	return l !== null && l > 0.6 ? "#0b0d12" : TEXT;
}

type TextOpts = { x: number; y: number; size: number; fill: string; anchor?: "start" | "middle" | "end"; bold?: boolean };

function text(value: string, o: TextOpts): string {
	const anchor = o.anchor ?? "start";
	const weight = o.bold === false ? "500" : "700";
	return (
		`<text x="${o.x}" y="${o.y}" font-family="${FONT}" font-size="${o.size}" font-weight="${weight}" ` +
		`fill="${o.fill}" text-anchor="${anchor}" letter-spacing="0.5">${escapeXml(value)}</text>`
	);
}

/** Stale marker: a bar along the bottom edge, the one part of every badge that stays empty. */
function staleBar(on: boolean | undefined): string {
	return on ? `<rect y="${W - 5}" width="${W}" height="5" fill="${STALE}" />` : "";
}

function svg(body: string): string {
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">` +
		`<rect width="${W}" height="${W}" fill="${BG}" />${body}</svg>`
	);
}

/**
 * Wraps finished SVG markup in the form setImage() actually accepts: a base64 data URI. Copied
 * from plugins/_shared/src/badge.ts, a solved problem worth keeping identical.
 */
export function keyImage(markup: string): string {
	return `data:image/svg+xml;base64,${Buffer.from(markup, "utf-8").toString("base64")}`;
}

export type Delta = { lpDelta: number; tierChanged: boolean; label: string };

function deltaText(d: Delta): string {
	if (d.tierChanged) return `${d.lpDelta >= 0 ? "+1 RANK" : "-1 RANK"} ${d.label}`;
	return `${d.lpDelta >= 0 ? "+" : ""}${d.lpDelta} LP ${d.label}`;
}

function deltaColor(d: Delta): string {
	return d.lpDelta > 0 ? POSITIVE : d.lpDelta < 0 ? NEGATIVE : MUTED;
}

export type RankBadge = {
	/** Short game label drawn in the header band: "LOL", "TFT". */
	kicker: string;
	tier: string;
	/** I..IV; empty for the apex tiers, which rank on LP alone. */
	rank: string;
	leaguePoints: number;
	wins: number;
	losses: number;
	delta?: Delta;
	stale?: boolean;
	staleAge?: string;
};

export function rankBadge(b: RankBadge): string {
	const color = tierColor(b.tier);
	const fg = readableOn(color);
	const division = b.rank ? ` ${b.rank}` : "";
	return svg(
		`<rect width="${W}" height="40" fill="${color}" />` +
			text(b.kicker, { x: 10, y: 27, size: 17, fill: fg }) +
			text(`${b.wins}-${b.losses}`, { x: 134, y: 27, size: 15, fill: fg, anchor: "end", bold: false }) +
			`<rect y="40" width="${W}" height="66" fill="${PANEL}" />` +
			text(b.tier.toUpperCase() + division, { x: 72, y: 74, size: 16, fill: TEXT, anchor: "middle" }) +
			text(`${b.leaguePoints} LP`, { x: 72, y: 100, size: 24, fill: TEXT, anchor: "middle" }) +
			(b.delta
				? text(deltaText(b.delta), { x: 72, y: 127, size: 14, fill: deltaColor(b.delta), anchor: "middle" })
				: text("no history yet", { x: 72, y: 127, size: 12, fill: MUTED, anchor: "middle", bold: false })) +
			(b.stale && b.staleAge ? text(b.staleAge, { x: 138, y: 138, size: 11, fill: STALE, anchor: "end", bold: false }) : "") +
			staleBar(b.stale)
	);
}

export type MessageBadge = {
	kicker?: string;
	title: string;
	detail?: string;
	accent?: string;
	stale?: boolean;
};

/** Fallback face: not configured yet, unranked, or the account/key lookup failed with nothing
 *  cached to fall back to. */
export function messageBadge(b: MessageBadge): string {
	const accent = b.accent ?? "#2a2f3a";
	return svg(
		(b.kicker ? `<rect width="${W}" height="30" fill="${accent}" />` + text(b.kicker, { x: 10, y: 21, size: 14, fill: readableOn(accent) }) : "") +
			text(b.title, { x: 72, y: b.kicker ? 82 : 70, size: 18, fill: TEXT, anchor: "middle" }) +
			(b.detail ? text(b.detail, { x: 72, y: (b.kicker ? 82 : 70) + 22, size: 13, fill: MUTED, anchor: "middle", bold: false }) : "") +
			staleBar(b.stale)
	);
}
