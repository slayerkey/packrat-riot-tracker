import type {
	AutomaticSessionResult,
	ManualResult,
	MmrHistoryPoint,
	PlayerMatch,
	SessionState,
	TrackerSnapshot
} from "./model";

export const MANUAL_RECONCILE_WINDOW_MS = 3 * 60 * 60_000;
export const MAX_MANUAL_RESULTS = 100;

export function uniqueMatchIds(ids: Array<string | undefined>): string[] {
	const unique = new Set<string>();
	for (const id of ids) {
		if (id) unique.add(id);
	}
	return [...unique].slice(0, 250);
}

export function knownMatchIds(cache: TrackerSnapshot | undefined): string[] {
	if (!cache) return [];
	return uniqueMatchIds([
		...cache.history.map((entry) => entry.matchId),
		...cache.recentMatches.map((match) => match.id),
		cache.lastMatch?.id
	]);
}

export function newSessionFromBaseline(baselineMatchIds: string[], now = Date.now()): SessionState {
	return {
		startedAt: now,
		baselineMatchIds: uniqueMatchIds(baselineMatchIds),
		manual: [],
		automatic: []
	};
}

export function newSession(cache: TrackerSnapshot | undefined, now = Date.now()): SessionState {
	return newSessionFromBaseline(knownMatchIds(cache), now);
}

export function appendManualResult(
	session: SessionState,
	result: "win" | "loss",
	knownIds: string[],
	rr?: number,
	now = Date.now(),
	id = `${now}-${Math.random().toString(36).slice(2, 8)}`
): SessionState {
	const manual: ManualResult = {
		id,
		result,
		rr: typeof rr === "number" && Number.isFinite(rr) ? rr : undefined,
		createdAt: now,
		knownMatchIds: uniqueMatchIds(knownIds)
	};
	return {
		...session,
		manual: [...session.manual, manual].slice(-MAX_MANUAL_RESULTS)
	};
}

function resultFromHistory(change: number): AutomaticSessionResult["result"] {
	if (change > 0) return "win";
	if (change < 0) return "loss";
	return "unknown";
}

function mergeAutomaticResults(
	session: SessionState,
	history: MmrHistoryPoint[],
	matches: PlayerMatch[]
): AutomaticSessionResult[] {
	const baseline = new Set(session.baselineMatchIds);
	const byId = new Map<string, AutomaticSessionResult>();

	// Persist what has already been observed. This ledger is the durable source for session record
	// and RR, so a long session does not shrink when an old match falls out of Henrik's recent list.
	for (const entry of session.automatic ?? []) {
		if (!entry.matchId || baseline.has(entry.matchId) || entry.startedAt < session.startedAt) continue;
		byId.set(entry.matchId, { ...entry });
	}

	const matchesById = new Map(matches.map((match) => [match.id, match]));
	for (const match of matches) {
		if (!match.id || baseline.has(match.id) || match.startedAt < session.startedAt) continue;
		const previous = byId.get(match.id);
		byId.set(match.id, {
			matchId: match.id,
			startedAt: match.startedAt,
			result: match.result !== "unknown" ? match.result : previous?.result ?? "unknown",
			change: previous?.change
		});
	}

	for (const point of history) {
		if (!point.matchId || baseline.has(point.matchId)) continue;
		const match = matchesById.get(point.matchId);
		const previous = byId.get(point.matchId);
		const startedAt = point.date > 0 ? point.date : match?.startedAt ?? previous?.startedAt ?? 0;
		if (startedAt < session.startedAt) continue;
		const result =
			match && match.result !== "unknown"
				? match.result
				: previous?.result && previous.result !== "unknown"
					? previous.result
					: resultFromHistory(point.change);
		byId.set(point.matchId, {
			matchId: point.matchId,
			startedAt,
			result,
			change: point.change
		});
	}

	return [...byId.values()].sort((a, b) => a.startedAt - b.startedAt || a.matchId.localeCompare(b.matchId));
}

export function reconcileSession(
	session: SessionState,
	history: MmrHistoryPoint[],
	matches: PlayerMatch[]
): {
	session: SessionState;
	wins: number;
	losses: number;
	netRr: number;
} {
	const automatic = mergeAutomaticResults(session, history, matches);
	const alreadyReconciled = new Set(session.manual.map((entry) => entry.reconciledMatchId).filter((id): id is string => !!id));
	const manual: ManualResult[] = session.manual.map((entry) => ({
		...entry,
		knownMatchIds: entry.knownMatchIds ? [...entry.knownMatchIds] : undefined
	}));

	for (const entry of manual) {
		if (entry.reconciledMatchId) continue;
		const knownWhenLogged = new Set(entry.knownMatchIds ?? session.baselineMatchIds);
		const candidate = automatic.find(
			(result) =>
				!alreadyReconciled.has(result.matchId) &&
				!knownWhenLogged.has(result.matchId) &&
				result.result === entry.result &&
				result.startedAt >= session.startedAt &&
				result.startedAt >= entry.createdAt - MANUAL_RECONCILE_WINDOW_MS &&
				result.startedAt <= entry.createdAt + MANUAL_RECONCILE_WINDOW_MS
		);
		if (candidate) {
			entry.reconciledMatchId = candidate.matchId;
			alreadyReconciled.add(candidate.matchId);
		}
	}

	const nextSession = { ...session, manual, automatic };
	const unreconciled = manual.filter((entry) => !entry.reconciledMatchId);
	const automaticWins = automatic.filter((entry) => entry.result === "win").length;
	const automaticLosses = automatic.filter((entry) => entry.result === "loss").length;
	const netRr =
		automatic.reduce((sum, entry) => sum + (entry.change ?? 0), 0) +
		unreconciled.reduce((sum, entry) => sum + (entry.rr ?? 0), 0);

	return {
		session: nextSession,
		wins: automaticWins + unreconciled.filter((entry) => entry.result === "win").length,
		losses: automaticLosses + unreconciled.filter((entry) => entry.result === "loss").length,
		netRr
	};
}
