/**
 * The one background ticker the plugin runs, same structural idea as plugins/_shared/src/poller.ts:
 * a single setInterval owned by the plugin process, not by an action instance, because a timer
 * owned by a key pauses the moment the user changes Stream Deck pages. Nothing in this file
 * imports the Stream Deck SDK, so it is plain functions.
 *
 * There is no live/soon/idle tier logic here. A rank tracker has no game schedule to derive a
 * cadence from, so it just polls on a fixed interval.
 */

/** How often the plugin checks every tracked account's rank. */
export const POLL_INTERVAL_MS = 5 * 60_000;

/** Cached data counts as stale once it has outlived three polls, the same "unreachable long
 *  enough that the user should know" rule the ESPN trackers use. */
export const STALE_AFTER_MS = POLL_INTERVAL_MS * 3;

export type PollerOptions = {
	/** Does the actual fetches and repaints. Never called twice concurrently. */
	run: () => Promise<void>;
	onError: (error: unknown) => void;
};

let handle: NodeJS.Timeout | null = null;
let running = false;
let options: PollerOptions | null = null;

async function tick(): Promise<void> {
	if (!options || running) return;
	running = true;
	try {
		await options.run();
	} catch (error) {
		// A failed poll must never take the ticker down with it.
		options.onError(error);
	} finally {
		running = false;
	}
}

/**
 * Starts the ticker. Idempotent.
 *
 * It deliberately does not poll immediately: a poll ends by writing to global settings, and a
 * settings call made before Stream Deck finishes the plugin registration handshake is simply
 * dropped, wedging the promise forever. The first poll comes from the first tick, or sooner from
 * refreshNow() once a key has appeared and registration has had time to complete.
 */
export function startPoller(opts: PollerOptions): void {
	options = opts;
	if (handle) return;
	handle = setInterval(() => void tick(), POLL_INTERVAL_MS);
}

/** Forces a poll now, for onWillAppear / onKeyDown so a key does not wait up to five minutes
 *  for its first real data. */
export function refreshNow(): void {
	void tick();
}
