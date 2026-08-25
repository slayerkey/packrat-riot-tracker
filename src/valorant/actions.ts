import {
	action,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent
} from "@elgato/streamdeck";

import type { ActionSettings } from "./model";
import { renderControl, renderMetric, renderTimer, type Metric } from "./render";
import { valorantService, type AccountField } from "./service";

/** Stream Deck setImage silently ignores raw SVG markup. Dynamic faces must be base64 data URIs. */
function keyImage(markup: string): string {
	return `data:image/svg+xml;base64,${Buffer.from(markup, "utf-8").toString("base64")}`;
}

/**
 * Stream Deck IPC is much more expensive than rendering a small SVG string. Cache the exact image
 * per key instance and never send a duplicate setImage command. This keeps refresh/status events
 * from repainting fifteen unchanged keys over and over.
 */
const lastImageByAction = new WeakMap<object, string>();
async function setKeyImage(key: KeyAction<ActionSettings>, image: string): Promise<void> {
	const instance = key as unknown as object;
	if (lastImageByAction.get(instance) === image) return;
	lastImageByAction.set(instance, image);
	await key.setImage(image);
}

const ACCOUNT_FIELDS = new Set<AccountField>(["riotId", "region", "apiKey", "actEndDate"]);

/**
 * Every action uses the same Property Inspector, so every action must be able to receive account
 * edits. The PI sends only a field patch; it never writes the complete global state object itself.
 * The service is the sole owner/writer of session, cache and account persistence.
 */
abstract class AccountAwareAction extends SingletonAction<ActionSettings> {
	override async onSendToPlugin(ev: any): Promise<void> {
		const payload = ev?.payload;
		if (!payload || payload.type !== "account-update" || !ACCOUNT_FIELDS.has(payload.field)) return;
		await valorantService.updateAccountField(payload.field as AccountField, payload.value);
	}
}

/**
 * A profile can make ten or more metric keys appear in the same instant. Each key paints from the
 * shared cache immediately, while their background refresh requests collapse into one call.
 */
let appearanceRefreshTimer: NodeJS.Timeout | null = null;
function scheduleAppearanceRefresh(): void {
	if (appearanceRefreshTimer) clearTimeout(appearanceRefreshTimer);
	appearanceRefreshTimer = setTimeout(() => {
		appearanceRefreshTimer = null;
		void valorantService.refresh(false);
	}, 400);
}

abstract class MetricActionBase extends AccountAwareAction {
	protected abstract metric: Metric;
	private settingsByAction = new WeakMap<object, ActionSettings>();

	constructor() {
		super();
		valorantService.subscribe(() => this.paintAll());
	}

	override async onWillAppear(ev: WillAppearEvent<ActionSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const settings = ev.payload.settings ?? {};
		this.settingsByAction.set(ev.action as unknown as object, settings);
		await this.paint(ev.action, settings);
		scheduleAppearanceRefresh();
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ActionSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const settings = ev.payload.settings ?? {};
		this.settingsByAction.set(ev.action as unknown as object, settings);
		await this.paint(ev.action, settings);
	}

	override async onKeyDown(ev: KeyDownEvent<ActionSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const settings = this.settingsByAction.get(ev.action as unknown as object) ?? ev.payload.settings ?? {};
		await setKeyImage(ev.action, keyImage(renderControl("REFRESH", "CHECKING", "#5da9ff")));
		void valorantService.refresh(true).finally(() => this.paint(ev.action, settings).catch(() => undefined));
	}

	async paintAll(): Promise<void> {
		await Promise.all(
			[...this.actions].map(async (instance) => {
				if (!instance.isKey()) return;
				const settings = this.settingsByAction.get(instance as unknown as object) ?? {};
				await this.paint(instance, settings);
			})
		);
	}

	protected async paint(key: KeyAction<ActionSettings>, settings: ActionSettings): Promise<void> {
		const actEndDate = this.metric === "act-countdown" ? (await valorantService.getStore()).account?.actEndDate : undefined;
		await setKeyImage(key, keyImage(renderMetric(this.metric, valorantService.state, settings ?? {}, actEndDate)));
	}
}

@action({ UUID: "com.packrat.valorant-tracker.rank" })
export class RankAction extends MetricActionBase {
	protected override metric = "rank" as const;
}

@action({ UUID: "com.packrat.valorant-tracker.rr" })
export class RrAction extends MetricActionBase {
	protected override metric = "rr" as const;
}

@action({ UUID: "com.packrat.valorant-tracker.session-rr" })
export class SessionRrAction extends MetricActionBase {
	protected override metric = "session-rr" as const;
}

@action({ UUID: "com.packrat.valorant-tracker.session-record" })
export class SessionRecordAction extends MetricActionBase {
	protected override metric = "session-record" as const;
}

@action({ UUID: "com.packrat.valorant-tracker.last-match" })
export class LastMatchAction extends MetricActionBase {
	protected override metric = "last-match" as const;
}

@action({ UUID: "com.packrat.valorant-tracker.headshot" })
export class HeadshotAction extends MetricActionBase {
	protected override metric = "headshot" as const;
}

@action({ UUID: "com.packrat.valorant-tracker.top-agent" })
export class TopAgentAction extends MetricActionBase {
	protected override metric = "top-agent" as const;
}

@action({ UUID: "com.packrat.valorant-tracker.agent-kd" })
export class AgentKdAction extends MetricActionBase {
	protected override metric = "agent-kd" as const;
}

@action({ UUID: "com.packrat.valorant-tracker.agent-win-rate" })
export class AgentWinRateAction extends MetricActionBase {
	protected override metric = "agent-win-rate" as const;
}

@action({ UUID: "com.packrat.valorant-tracker.damage" })
export class DamageAction extends MetricActionBase {
	protected override metric = "damage" as const;
}

@action({ UUID: "com.packrat.valorant-tracker.top-map" })
export class TopMapAction extends MetricActionBase {
	protected override metric = "top-map" as const;
}

@action({ UUID: "com.packrat.valorant-tracker.map-win-rate" })
export class MapWinRateAction extends MetricActionBase {
	protected override metric = "map-win-rate" as const;
}

@action({ UUID: "com.packrat.valorant-tracker.acs" })
export class AcsAction extends MetricActionBase {
	protected override metric = "acs" as const;
}

@action({ UUID: "com.packrat.valorant-tracker.recent-match" })
export class RecentMatchAction extends MetricActionBase {
	protected override metric = "recent-match" as const;
}

@action({ UUID: "com.packrat.valorant-tracker.act-countdown" })
export class ActCountdownAction extends MetricActionBase {
	protected override metric = "act-countdown" as const;

	override async onKeyDown(ev: KeyDownEvent<ActionSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const store = await valorantService.getStore();
		if (!store.account?.actEndDate) {
			await setKeyImage(ev.action, keyImage(renderControl("SET DATE", "IN SETTINGS", "#f0ad4e")));
			setTimeout(() => void this.paintAll(), 1200);
			return;
		}
		await setKeyImage(ev.action, keyImage(renderControl("ACT DATE", "EDIT SETTINGS", "#f0ad4e")));
		setTimeout(() => void this.paintAll(), 1200);
	}
}

@action({ UUID: "com.packrat.valorant-tracker.refresh" })
export class RefreshAction extends MetricActionBase {
	protected override metric = "refresh" as const;
}

abstract class LogResultAction extends AccountAwareAction {
	protected abstract result: "win" | "loss";

	private defaultImage(): string {
		return keyImage(
			renderControl(
				this.result === "win" ? "LOG WIN" : "LOG LOSS",
				"MANUAL FALLBACK",
				this.result === "win" ? "#35d07f" : "#ff4655"
			)
		);
	}

	private async paint(key: KeyAction<ActionSettings>): Promise<void> {
		await setKeyImage(key, this.defaultImage());
	}

	override async onWillAppear(ev: WillAppearEvent<ActionSettings>): Promise<void> {
		if (ev.action.isKey()) await this.paint(ev.action);
	}

	override async onKeyDown(ev: KeyDownEvent<ActionSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const rr = typeof ev.payload.settings.manualRr === "number" ? ev.payload.settings.manualRr : undefined;
		await valorantService.logResult(this.result, rr);
		const title = this.result === "win" ? "WIN LOGGED" : "LOSS LOGGED";
		const detail = rr === undefined ? "SESSION +1" : `${rr > 0 ? "+" : ""}${Math.round(rr)} RR`;
		const accent = this.result === "win" ? "#35d07f" : "#ff4655";
		await setKeyImage(ev.action, keyImage(renderControl(title, detail, accent)));
		if (rr !== undefined) await ev.action.setSettings({ ...ev.payload.settings, manualRr: undefined });
		setTimeout(() => void this.paint(ev.action).catch(() => undefined), 1200);
	}
}

@action({ UUID: "com.packrat.valorant-tracker.log-win" })
export class LogWinAction extends LogResultAction {
	protected override result = "win" as const;
}

@action({ UUID: "com.packrat.valorant-tracker.log-loss" })
export class LogLossAction extends LogResultAction {
	protected override result = "loss" as const;
}

@action({ UUID: "com.packrat.valorant-tracker.session-reset" })
export class SessionResetAction extends AccountAwareAction {
	private armedUntil = new WeakMap<object, number>();

	private async paintDefault(key: KeyAction<ActionSettings>): Promise<void> {
		await setKeyImage(key, keyImage(renderControl("RESET", "TAP TWICE", "#ff4655")));
	}

	override async onWillAppear(ev: WillAppearEvent<ActionSettings>): Promise<void> {
		if (ev.action.isKey()) await this.paintDefault(ev.action);
	}

	override async onKeyDown(ev: KeyDownEvent<ActionSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const key = ev.action as unknown as object;
		const now = Date.now();
		const until = this.armedUntil.get(key) ?? 0;

		if (now <= until) {
			this.armedUntil.delete(key);
			await valorantService.resetSession();
			await setKeyImage(ev.action, keyImage(renderControl("RESET", "SESSION CLEARED", "#35d07f")));
			setTimeout(() => void this.paintDefault(ev.action).catch(() => undefined), 1200);
			return;
		}

		const armedUntil = now + 2500;
		this.armedUntil.set(key, armedUntil);
		await setKeyImage(ev.action, keyImage(renderControl("TAP AGAIN", "RESET SESSION", "#f0ad4e")));
		setTimeout(() => {
			if ((this.armedUntil.get(key) ?? 0) !== armedUntil) return;
			this.armedUntil.delete(key);
			void this.paintDefault(ev.action).catch(() => undefined);
		}, 2500);
	}
}

@action({ UUID: "com.packrat.valorant-tracker.spike-timer" })
export class SpikeTimerAction extends AccountAwareAction {
	private startedAt: number | null = null;
	private timer: NodeJS.Timeout | null = null;

	override async onWillAppear(ev: WillAppearEvent<ActionSettings>): Promise<void> {
		if (ev.action.isKey()) await this.paint(ev.action);
	}

	override async onKeyDown(ev: KeyDownEvent<ActionSettings>): Promise<void> {
		const remaining = this.remaining();
		if (remaining !== null && remaining > 0) {
			this.startedAt = null;
			this.stopTicker();
		} else {
			this.startedAt = Date.now();
			this.startTicker();
		}
		await this.paintAll();
	}

	private remaining(): number | null {
		if (this.startedAt === null) return null;
		return Math.max(0, 45 - (Date.now() - this.startedAt) / 1000);
	}

	private startTicker(): void {
		if (this.timer) return;
		this.timer = setInterval(() => {
			void this.paintAll();
			if (this.remaining() === 0) this.stopTicker();
		}, 1000);
	}

	private stopTicker(): void {
		if (!this.timer) return;
		clearInterval(this.timer);
		this.timer = null;
	}

	private async paintAll(): Promise<void> {
		await Promise.all(
			[...this.actions].map(async (instance) => {
				if (instance.isKey()) await this.paint(instance);
			})
		);
	}

	private async paint(key: KeyAction<ActionSettings>): Promise<void> {
		await setKeyImage(key, keyImage(renderTimer(this.remaining())));
	}
}
