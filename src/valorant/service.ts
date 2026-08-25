import streamDeck from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { fetchHenrikBundle, HenrikError, parseRiotId, REGIONS } from "./henrik";
import type {
	AccountSettings,
	AggregateItem,
	ErrorKind,
	GlobalStore,
	ManualResult,
	PlayerMatch,
	RuntimeState,
	TrackerSnapshot
} from "./model";
import { knownMatchIds, newSession, newSessionFromBaseline, reconcileSession } from "./session";

export const REFRESH_MS = 5 * 60_000;
export const STALE_MS = 15 * 60_000;

function cloneStore(value: GlobalStore | undefined): GlobalStore {
	return value && typeof value === "object" ? value : {};
}

function accountFingerprint(account: AccountSettings | undefined): string {
	return JSON.stringify({
		riotId: account?.riotId?.trim() ?? "",
		region: account?.region ?? "na",
		apiKey: account?.apiKey?.trim() ?? ""
	});
}

function cacheMatchesAccount(account: AccountSettings | undefined, cache: TrackerSnapshot | undefined): cache is TrackerSnapshot {
	const riot = parseRiotId(account?.riotId);
	if (!riot || !cache) return false;
	return (
		cache.accountName.trim().toLowerCase() === riot.name.trim().toLowerCase() &&
		cache.accountTag.trim().toLowerCase() === riot.tag.trim().toLowerCase()
	);
}

function aggregate(matches: PlayerMatch[], key: "agent" | "map"): AggregateItem[] {
	const groups = new Map<string, { name: string; icon?: string; games: number; wins: number; losses: number; kills: number; deaths: number; damage: number; score: number; rounds: number }>();
	for (const match of matches) {
		const name = match[key] || "Unknown";
		const current = groups.get(name) ?? {
			name,
			icon: key === "agent" ? match.agentIcon : undefined,
			games: 0,
			wins: 0,
			losses: 0,
			kills: 0,
			deaths: 0,
			damage: 0,
			score: 0,
			rounds: 0
		};
		current.games++;
		if (match.result === "win") current.wins++;
		if (match.result === "loss") current.losses++;
		current.kills += match.kills;
		current.deaths += match.deaths;
		current.damage += match.damage;
		current.score += match.score;
		current.rounds += match.rounds;
		if (!current.icon && key === "agent" && match.agentIcon) current.icon = match.agentIcon;
		groups.set(name, current);
	}
	return [...groups.values()]
		.map((group) => ({
			name: group.name,
			icon: group.icon,
			games: group.games,
			wins: group.wins,
			losses: group.losses,
			winRate: group.games ? (group.wins / group.games) * 100 : 0,
			kills: group.kills,
			deaths: group.deaths,
			kd: group.deaths ? group.kills / group.deaths : group.kills,
			damage: group.damage,
			acs: group.rounds ? group.score / group.rounds : 0
		}))
		.sort((a, b) => b.games - a.games || b.winRate - a.winRate || b.kd - a.kd || a.name.localeCompare(b.name));
}

function headshotPercent(matches: PlayerMatch[]): number | null {
	let heads = 0;
	let shots = 0;
	for (const match of matches) {
		heads += match.headshots;
		shots += match.headshots + match.bodyshots + match.legshots;
	}
	return shots ? (heads / shots) * 100 : null;
}

function overallAcs(matches: PlayerMatch[]): number | null {
	let score = 0;
	let rounds = 0;
	for (const match of matches) {
		score += match.score;
		rounds += match.rounds;
	}
	return rounds ? score / rounds : null;
}

function errorKind(error: unknown): { kind: ErrorKind; detail: string } {
	if (error instanceof HenrikError) {
		const detail = error.message || `HTTP ${error.status}`;
		if (error.status === 0) return { kind: "offline", detail };
		if (error.status === 400) return { kind: "invalid-riot-id", detail };
		if (error.status === 401) return { kind: "invalid-key", detail };
		if (error.status === 404) return { kind: "not-found", detail };
		if (error.status === 429) return { kind: "rate-limited", detail };
		if (error.status === 403 && /key|auth|token/i.test(detail)) return { kind: "invalid-key", detail };
		return { kind: "api-error", detail };
	}
	return { kind: "api-error", detail: error instanceof Error ? error.message : "unknown error" };
}

function configured(account: AccountSettings | undefined): { ok: true } | { ok: false; kind: ErrorKind; detail: string } {
	if (!account?.riotId) return { ok: false, kind: "no-account", detail: "Set Riot ID" };
	if (!parseRiotId(account.riotId)) return { ok: false, kind: "invalid-riot-id", detail: "Use Name#TAG" };
	if (!account.apiKey) return { ok: false, kind: "no-api-key", detail: "Add HenrikDev key" };
	if (account.region && !REGIONS.includes(account.region)) return { ok: false, kind: "invalid-region", detail: "Choose a supported region" };
	return { ok: true };
}

class ValorantDataService {
	private runtime: RuntimeState = { status: "idle", error: "none" };
	private listeners = new Set<() => void | Promise<void>>();
	private inFlight: Promise<RuntimeState> | null = null;
	private refreshAgain = false;
	private initialized = false;
	private lastAccountFingerprint = "";
	private mutationQueue: Promise<void> = Promise.resolve();

	get state(): RuntimeState {
		return this.runtime;
	}

	subscribe(listener: () => void | Promise<void>): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) {
			Promise.resolve(listener()).catch((error) => streamDeck.logger.error("repaint failed", error));
		}
	}

	private setRuntime(next: RuntimeState): RuntimeState {
		this.runtime = next;
		this.notify();
		return next;
	}

	private enqueueMutation(task: () => Promise<void>): Promise<void> {
		const run = this.mutationQueue.then(() => task(), () => task());
		this.mutationQueue = run.catch(() => undefined);
		return run;
	}

	async initialize(): Promise<void> {
		if (this.initialized) return;
		this.initialized = true;
		const store = cloneStore((await streamDeck.settings.getGlobalSettings()) as unknown as GlobalStore);
		this.lastAccountFingerprint = accountFingerprint(store.account);
		if (cacheMatchesAccount(store.account, store.cache)) {
			this.runtime = { status: "ready", error: "none", snapshot: store.cache };
		}
		streamDeck.settings.onDidReceiveGlobalSettings((ev) => {
			const nextStore = cloneStore(ev.settings as unknown as GlobalStore);
			const nextFingerprint = accountFingerprint(nextStore.account);
			const accountChanged = nextFingerprint !== this.lastAccountFingerprint;
			this.lastAccountFingerprint = nextFingerprint;
			const cache = cacheMatchesAccount(nextStore.account, nextStore.cache) ? nextStore.cache : undefined;
			if (accountChanged) {
				this.runtime = cache ? { status: "ready", error: "none", snapshot: cache } : { status: "loading", error: "none" };
			} else if (cache) {
				this.runtime = { status: "ready", error: "none", snapshot: cache };
			}
			this.notify();
			if (accountChanged) void this.refresh(true);
		});
	}

	async getStore(): Promise<GlobalStore> {
		return cloneStore((await streamDeck.settings.getGlobalSettings()) as unknown as GlobalStore);
	}

	private async writeStore(store: GlobalStore): Promise<void> {
		this.lastAccountFingerprint = accountFingerprint(store.account);
		await streamDeck.settings.setGlobalSettings(store as unknown as JsonObject);
	}

	async refresh(force = false): Promise<RuntimeState> {
		if (this.inFlight) {
			if (force) this.refreshAgain = true;
			return this.inFlight;
		}

		const run = this.doRefresh(force);
		this.inFlight = run;
		try {
			return await run;
		} finally {
			this.inFlight = null;
			if (this.refreshAgain) {
				this.refreshAgain = false;
				void this.refresh(true);
			}
		}
	}

	private async doRefresh(force: boolean): Promise<RuntimeState> {
		const initialStore = await this.getStore();
		const initialCache = cacheMatchesAccount(initialStore.account, initialStore.cache) ? initialStore.cache : undefined;
		const check = configured(initialStore.account);
		if (!check.ok) return this.setRuntime({ status: "error", error: check.kind, detail: check.detail, snapshot: initialCache });
		if (!force && initialCache && Date.now() - initialCache.fetchedAt < REFRESH_MS) {
			return this.setRuntime({ status: "ready", error: "none", snapshot: initialCache });
		}

		const requestedAccount = accountFingerprint(initialStore.account);
		this.setRuntime({ status: "loading", error: "none", snapshot: initialCache });
		try {
			const bundle = await fetchHenrikBundle(initialStore.account!);

			// Re-read settings after the network request. A manual result, session reset, or account
			// edit may have happened while HenrikDev was responding. Never overwrite newer local state
			// with the snapshot captured before the request started.
			const store = await this.getStore();
			if (accountFingerprint(store.account) !== requestedAccount) {
				this.refreshAgain = true;
				const cache = cacheMatchesAccount(store.account, store.cache) ? store.cache : undefined;
				return this.setRuntime({ status: cache ? "ready" : "loading", error: "none", snapshot: cache });
			}

			const samePlayer = store.cache?.puuid === bundle.account.puuid;
			let session = samePlayer ? store.session : undefined;
			if (!session) {
				session = newSessionFromBaseline([
					...bundle.history.map((entry) => entry.matchId),
					...bundle.matches.map((match) => match.id)
				]);
			}

			const sessionView = reconcileSession(session, bundle.history, bundle.matches);
			session = sessionView.session;
			const recentMatches = bundle.matches.slice(0, 10);
			const snapshot: TrackerSnapshot = {
				fetchedAt: Date.now(),
				accountName: bundle.account.name,
				accountTag: bundle.account.tag,
				puuid: bundle.account.puuid,
				rankName: bundle.rank.name,
				rankTierId: bundle.rank.tierId,
				rankIcon: bundle.rank.icon,
				rr: bundle.rank.rr,
				lastChange: bundle.rank.lastChange,
				lastMatch: recentMatches[0],
				headshotPercent: headshotPercent(recentMatches),
				damage: recentMatches[0]?.damage ?? null,
				acs: overallAcs(recentMatches),
				agents: aggregate(recentMatches, "agent"),
				maps: aggregate(recentMatches, "map"),
				recentMatches,
				history: bundle.history,
				session: {
					wins: sessionView.wins,
					losses: sessionView.losses,
					netRr: sessionView.netRr
				}
			};

			await this.writeStore({ ...store, session, cache: snapshot });
			return this.setRuntime({ status: "ready", error: "none", snapshot });
		} catch (error) {
			const mapped = errorKind(error);
			streamDeck.logger.warn(`HenrikDev refresh failed: ${mapped.detail}`);
			const latestStore = await this.getStore();
			const cache = cacheMatchesAccount(latestStore.account, latestStore.cache) ? latestStore.cache : undefined;
			return this.setRuntime({ status: "error", error: mapped.kind, detail: mapped.detail, snapshot: cache });
		}
	}

	async logResult(result: "win" | "loss", rr?: number): Promise<void> {
		return this.enqueueMutation(async () => {
			const store = await this.getStore();
			const cache = cacheMatchesAccount(store.account, store.cache) ? store.cache : undefined;
			const session = store.session ?? newSession(cache);
			const manual: ManualResult = {
				id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				result,
				rr: typeof rr === "number" && Number.isFinite(rr) ? rr : undefined,
				createdAt: Date.now(),
				knownMatchIds: knownMatchIds(cache)
			};
			const nextSession = { ...session, manual: [...session.manual, manual].slice(-20) };
			const nextCache = cache
				? {
						...cache,
						session: {
							wins: cache.session.wins + (result === "win" ? 1 : 0),
							losses: cache.session.losses + (result === "loss" ? 1 : 0),
							netRr: cache.session.netRr + (manual.rr ?? 0)
						}
					}
				: undefined;
			await this.writeStore({ ...store, session: nextSession, cache: nextCache });
			if (nextCache) this.setRuntime({ status: "ready", error: "none", snapshot: nextCache });
		});
	}

	async resetSession(): Promise<void> {
		return this.enqueueMutation(async () => {
			const store = await this.getStore();
			const cache = cacheMatchesAccount(store.account, store.cache) ? store.cache : undefined;
			const session = newSession(cache);
			const nextCache = cache ? { ...cache, session: { wins: 0, losses: 0, netRr: 0 } } : undefined;
			await this.writeStore({ ...store, session, cache: nextCache });
			if (nextCache) this.setRuntime({ status: "ready", error: "none", snapshot: nextCache });
		});
	}
}

export const valorantService = new ValorantDataService();
