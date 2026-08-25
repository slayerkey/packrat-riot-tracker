import streamDeck from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { fetchHenrikBundle, HenrikError, parseRiotId, REGIONS } from "./henrik";
import type {
	AccountSettings,
	AggregateItem,
	ErrorKind,
	GlobalStore,
	PlayerMatch,
	Region,
	RuntimeState,
	TrackerSnapshot
} from "./model";
import { appendManualResult, knownMatchIds, newSession, newSessionFromBaseline, reconcileSession } from "./session";

export const REFRESH_MS = 5 * 60_000;
export const STALE_MS = 15 * 60_000;
export type AccountField = "riotId" | "region" | "apiKey" | "actEndDate";

function cloneStore(value: GlobalStore | undefined): GlobalStore {
	return value && typeof value === "object" ? { ...value } : {};
}

function storeRevision(store: GlobalStore | undefined): number {
	const value = Number(store?.revision ?? 0);
	return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
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
		if (error.status === 0 || error.status === 408) return { kind: "offline", detail };
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

function normalizeAccountValue(field: AccountField, value: unknown): string | Region | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (field === "region") {
		const region = trimmed.toLowerCase() as Region;
		return REGIONS.includes(region) ? region : undefined;
	}
	return trimmed;
}

function applyAccountField(current: AccountSettings, field: AccountField, value: string | Region | undefined): AccountSettings {
	switch (field) {
		case "riotId":
			return { ...current, riotId: value as string | undefined };
		case "region":
			return { ...current, region: value as Region | undefined };
		case "apiKey":
			return { ...current, apiKey: value as string | undefined };
		case "actEndDate":
			return { ...current, actEndDate: value as string | undefined };
	}
}

class ValorantDataService {
	private runtime: RuntimeState = { status: "idle", error: "none" };
	private listeners = new Set<() => void | Promise<void>>();
	private inFlight: Promise<RuntimeState> | null = null;
	private refreshAgain = false;
	private initialized = false;
	private lastAccountFingerprint = "";
	private mutationQueue: Promise<void> = Promise.resolve();
	private store: GlobalStore = {};
	private lastRevision = 0;

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

	private enqueueMutation<T>(task: () => Promise<T>): Promise<T> {
		const run = this.mutationQueue.then(() => task(), () => task());
		this.mutationQueue = run.then(() => undefined, () => undefined);
		return run;
	}

	async initialize(): Promise<void> {
		if (this.initialized) return;
		this.initialized = true;
		const store = cloneStore((await streamDeck.settings.getGlobalSettings()) as unknown as GlobalStore);
		this.store = store;
		this.lastRevision = storeRevision(store);
		this.lastAccountFingerprint = accountFingerprint(store.account);
		if (cacheMatchesAccount(store.account, store.cache)) {
			this.runtime = { status: "ready", error: "none", snapshot: store.cache };
		}

		streamDeck.settings.onDidReceiveGlobalSettings((ev) => {
			const nextStore = cloneStore(ev.settings as unknown as GlobalStore);
			const nextRevision = storeRevision(nextStore);
			if (nextRevision <= this.lastRevision) return;

			const nextFingerprint = accountFingerprint(nextStore.account);
			const accountChanged = nextFingerprint !== this.lastAccountFingerprint;
			this.store = nextStore;
			this.lastRevision = nextRevision;
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
		return cloneStore(this.store);
	}

	private async writeStore(store: GlobalStore): Promise<GlobalStore> {
		const revision = Math.max(this.lastRevision, storeRevision(store)) + 1;
		const nextStore = { ...store, revision };
		this.store = nextStore;
		this.lastRevision = revision;
		this.lastAccountFingerprint = accountFingerprint(nextStore.account);
		await streamDeck.settings.setGlobalSettings(nextStore as unknown as JsonObject);
		return nextStore;
	}

	async updateAccountField(field: AccountField, value: unknown): Promise<void> {
		const shouldRefresh = await this.enqueueMutation(async () => {
			const store = await this.getStore();
			const current = store.account ?? {};
			const nextValue = normalizeAccountValue(field, value);
			if (current[field] === nextValue) return false;

			const account = applyAccountField(current, field, nextValue);
			const identityChanged = (field === "riotId" || field === "region") && current[field] !== nextValue;
			const nextStore: GlobalStore = { ...store, account };
			if (identityChanged) {
				delete nextStore.session;
				delete nextStore.cache;
			}
			await this.writeStore(nextStore);

			const check = configured(account);
			const cache = cacheMatchesAccount(account, nextStore.cache) ? nextStore.cache : undefined;
			if (!check.ok) {
				this.setRuntime({ status: "error", error: check.kind, detail: check.detail, snapshot: cache });
			} else if (field === "actEndDate") {
				this.notify();
			} else if (cache && !identityChanged) {
				this.setRuntime({ status: "ready", error: "none", snapshot: cache });
			} else {
				this.setRuntime({ status: "loading", error: "none", snapshot: cache });
			}
			return check.ok && field !== "actEndDate";
		});

		if (shouldRefresh) void this.refresh(true);
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
			return await this.enqueueMutation(async () => {
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
			});
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
			const knownIds = [
				...knownMatchIds(cache),
				...(session.automatic ?? []).map((entry) => entry.matchId)
			];
			let nextSession = appendManualResult(session, result, knownIds, rr);
			let nextCache = cache;

			if (cache) {
				const view = reconcileSession(nextSession, cache.history, cache.recentMatches);
				nextSession = view.session;
				nextCache = {
					...cache,
					session: { wins: view.wins, losses: view.losses, netRr: view.netRr }
				};
			}

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
