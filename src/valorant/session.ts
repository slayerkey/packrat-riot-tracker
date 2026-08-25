import type { ManualResult, MmrHistoryPoint, PlayerMatch, SessionState, TrackerSnapshot } from "./model";

export const MANUAL_RECONCILE_WINDOW_MS = 3 * 60 * 60_000;
export const MAX_MANUAL_RESULTS = 100;

export function uniqueMatchIds(ids: Array<string | undefined>): string[] {
	const unique = new Set<string>();
	for (const id of ids) {
		if (id) unique.add(id);
	}
	return [...unique].slice(0, 100);
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
		manual: []
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
	const baseline = new Set(session.baselineMatchIds);
	const matchesById = new Map(matches.map((match) => [match.id, match]));

	// Session membership is time bounded and baseline bounded. A late API response may reveal an
	// older match, but a reset is a hard boundary and older matches can never re-enter the session.
	const sessionHistory = history.filter((entry) => {
		if (!entry.matchId || baseline.has(entry.matchId)) return false;
		if (entry.date > 0) return entry.date >= session.startedAt;
		const match = matchesById.get(entry.matchId);
		return !!match && match.startedAt >= session.startedAt;
	});
	const sessionHistoryIds = new Set(sessionHistory.map((entry) => entry.matchId));
	const apiSessionMatches = matches.filter((match) => {
		if (!match.id || baseline.has(match.id)) return false;
		return match.startedAt >= session.startedAt || sessionHistoryIds.has(match.id);
	});

	const alreadyReconciled = new Set(session.manual.map((entry) => entry.reconciledMatchId).filter((id): id is string => !!id));
	const manual: ManualResult[] = session.manual.map((entry) => ({ ...entry, knownMatchIds: entry.knownMatchIds ? [...entry.knownMatchIds] : undefined }));
	for (const entry of manual) {
		if (entry.reconciledMatchId) continue;
		const knownWhenLogged = new Set(entry.knownMatchIds ?? session.baselineMatchIds);
		const candidate = apiSessionMatches.find(
			(match) =>
				!alreadyReconciled.has(match.id) &&
				!knownWhenLogged.has(match.id) &&
				match.result === entry.result &&
				match.startedAt >= session.startedAt &&
				match.startedAt >= entry.createdAt - MANUAL_RECONCILE_WINDOW_MS &&
				match.startedAt <= entry.createdAt + MANUAL_RECONCILE_WINDOW_MS
		);
		if (candidate) {
			entry.reconciledMatchId = candidate.id;
			alreadyReconciled.add(candidate.id);
		}
	}

	const nextSession = { ...session, manual };
	const unreconciled = manual.filter((entry) => !entry.reconciledMatchId);
	const apiWins = apiSessionMatches.filter((match) => match.result === "win").length;
	const apiLosses = apiSessionMatches.filter((match) => match.result === "loss").length;
	const netRr =
		sessionHistory.reduce((sum, entry) => sum + entry.change, 0) +
		unreconciled.reduce((sum, entry) => sum + (entry.rr ?? 0), 0);

	return {
		session: nextSession,
		wins: apiWins + unreconciled.filter((entry) => entry.result === "win").length,
		losses: apiLosses + unreconciled.filter((entry) => entry.result === "loss").length,
		netRr
	};
}
