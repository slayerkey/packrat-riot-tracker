import {
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent
} from "@elgato/streamdeck";

import { messageBadge, keyImage, rankBadge } from "../badge";
import { appendSnapshot, describeDelta, latest, readCache, snapshotAround, snapshotKey, WINDOW_24H_MS, WINDOW_7D_MS } from "../cache";
import { getAccountByRiotId, getLolRank, getTftRank, pickQueue } from "../riot";
import { STALE_AFTER_MS } from "../poller";

export type RankSettings = {
	gameName?: string;
	tagLine?: string;
	platform?: string;
	/** Personal Riot API key from https://developer.riotgames.com/, expires every 24h. Lives only
	 *  in this action instance's own settings, never in global settings. */
	apiKey?: string;
};

function ageLabel(ms: number): string {
	const min = Math.round(ms / 60_000);
	if (min < 60) return `${min}m`;
	const hr = Math.round(min / 60);
	if (hr < 24) return `${hr}h`;
	return `${Math.round(hr / 24)}d`;
}

/**
 * Shared behaviour for both rank actions: paint from cache immediately, poll Riot's API in the
 * background, and always resolve to a key face, never an unhandled rejection. Same
 * base-class-plus-thin-subclass shape as plugins/_shared/src/actions/event.ts, but self-contained:
 * each Riot ID is a per-key setting, not a shared league-wide cache entry, so this base class
 * polls each of its own visible instances rather than reading one global board.
 */
export abstract class RankActionBase extends SingletonAction<RankSettings> {
	protected abstract game: "lol" | "tft";
	protected abstract queueType: string;
	protected abstract kicker: string;

	override async onWillAppear(ev: WillAppearEvent<RankSettings>): Promise<void> {
		if (ev.action.isKey()) await this.paint(ev.action, ev.payload.settings);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<RankSettings>): Promise<void> {
		if (ev.action.isKey()) await this.paint(ev.action, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<RankSettings>): Promise<void> {
		await this.pollOne(ev.action, ev.payload.settings);
		await ev.action.showOk();
	}

	/** Called by the plugin's single poller for every visible instance of this action. */
	async pollAll(): Promise<void> {
		for (const instance of this.actions) {
			if (!instance.isKey()) continue;
			const settings = await instance.getSettings<RankSettings>();
			await this.pollOne(instance, settings);
		}
	}

	private configured(settings: RankSettings): settings is Required<RankSettings> {
		return !!(settings.gameName && settings.tagLine && settings.platform && settings.apiKey);
	}

	private async pollOne(key: KeyAction<RankSettings>, settings: RankSettings): Promise<void> {
		if (!this.configured(settings)) return;
		const account = await getAccountByRiotId(settings.gameName, settings.tagLine, settings.platform, settings.apiKey);
		if (!account) {
			await this.paint(key, settings);
			return;
		}
		const entries =
			this.game === "lol"
				? await getLolRank(account.puuid, settings.platform, settings.apiKey)
				: await getTftRank(account.puuid, settings.platform, settings.apiKey);
		if (entries === null) {
			await this.paint(key, settings);
			return;
		}
		const entry = pickQueue(entries, this.queueType);
		if (!entry) {
			await key.setImage(keyImage(messageBadge({ kicker: this.kicker, title: "UNRANKED", detail: "no games this queue" })));
			return;
		}
		const cacheKey = snapshotKey(this.game, settings.platform, settings.gameName, settings.tagLine, this.queueType);
		await appendSnapshot(cacheKey, {
			fetchedAt: Date.now(),
			tier: entry.tier,
			rank: entry.rank,
			leaguePoints: entry.leaguePoints,
			wins: entry.wins,
			losses: entry.losses
		});
		await this.paint(key, settings);
	}

	/** Redraws a key from cache only, no network. Called on appear/settings so a key shows
	 *  something instantly, and again after a poll writes a fresh snapshot. */
	private async paint(key: KeyAction<RankSettings>, settings: RankSettings): Promise<void> {
		const show = (markup: string): Promise<void> => key.setImage(keyImage(markup));

		if (!this.configured(settings)) {
			await show(messageBadge({ kicker: this.kicker, title: "SET UP", detail: "add Riot ID + key" }));
			return;
		}

		const cache = await readCache();
		const cacheKey = snapshotKey(this.game, settings.platform, settings.gameName, settings.tagLine, this.queueType);
		const snapshots = cache.snapshots?.[cacheKey] ?? [];
		const last = latest(snapshots);
		if (!last) {
			await show(messageBadge({ kicker: this.kicker, title: "LOADING", detail: "checking in..." }));
			return;
		}

		const now = Date.now();
		const stale = now - last.fetchedAt > STALE_AFTER_MS;
		const delta =
			describeDelta(last, snapshotAround(snapshots, WINDOW_24H_MS, now), "24H") ??
			describeDelta(last, snapshotAround(snapshots, WINDOW_7D_MS, now), "7D");

		await show(
			rankBadge({
				kicker: this.kicker,
				tier: last.tier,
				rank: last.rank,
				leaguePoints: last.leaguePoints,
				wins: last.wins,
				losses: last.losses,
				delta,
				stale,
				staleAge: stale ? ageLabel(now - last.fetchedAt) : undefined
			})
		);
	}
}
