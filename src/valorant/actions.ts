import {
	action,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	type KeyUpEvent,
	SingletonAction,
	type WillAppearEvent
} from "@elgato/streamdeck";

import type { ActionSettings } from "./model";
import { renderControl, renderMetric, renderTimer, type Metric } from "./render";
import { valorantService } from "./service";

/** Stream Deck setImage silently ignores raw SVG markup. Dynamic faces must be base64 data URIs. */
function keyImage(markup: string): string {
	return `data:image/svg+xml;base64,${Buffer.from(markup, "utf-8").toString("base64")}`;
}

/**
 * A profile can make ten or more metric keys appear in the same instant. Each key still paints
 * immediately from the shared cache, but their background refresh requests are collapsed into one
 * call so opening a dashboard does not hammer Stream Deck with a burst of redundant repaints.
 */
let appearanceRefreshTimer: NodeJS.Timeout | null = null;
function scheduleAppearanceRefresh(): void {
	if (appearanceRefreshTimer) clearTimeout(appearanceRefreshTimer);
	appearanceRefreshTimer = setTimeout(() => {
		appearanceRefreshTimer = null;
		void valorantService.refresh(false);
	}, 150);
}

abstract class MetricActionBase extends SingletonAction<ActionSettings> {
	protected abstract metric: Metric;

	constructor() {
		super();
		valorantService.subscribe(() => this.paintAll());
	}

	override async onWillAppear(ev: WillAppearEvent<ActionSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		await this.paint(ev.action, ev.payload.settings);
		scheduleAppearanceRefresh();
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ActionSettings>): Promise<void> {
		if (ev.action.isKey()) await this.paint(ev.action, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<ActionSettings>): Promise<void> {
		await valorantService.refresh(true);
		await ev.action.showOk();
	}

	async paintAll(): Promise<void> {
		for (const instance of this.actions) {
			if (!instance.isKey()) continue;
			await this.paint(instance, await instance.getSettings<ActionSettings>());
		}
	}

	private async paint(key: KeyAction<ActionSettings>, settings: ActionSettings): Promise<void> {
		const store = await valorantService.getStore();
		await key.setImage(keyImage(renderMetric(this.metric, valorantService.state, settings ?? {}, store.account?.actEndDate)));
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
}

@action({ UUID: "com.packrat.valorant-tracker.refresh" })
export class RefreshAction extends MetricActionBase {
	protected override metric = "refresh" as const;
}

abstract class LogResultAction extends SingletonAction<ActionSettings> {
	protected abstract result: "win" | "loss";

	override async onWillAppear(ev: WillAppearEvent<ActionSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await ev.action.setImage(
				keyImage(renderControl(this.result === "win" ? "LOG WIN" : "LOG LOSS", "TAP AFTER MATCH", this.result === "win" ? "#35d07f" : "#ff4655"))
			);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<ActionSettings>): Promise<void> {
		const rr = typeof ev.payload.settings.manualRr === "number" ? ev.payload.settings.manualRr : undefined;
		await valorantService.logResult(this.result, rr);
		await ev.action.showOk();
		if (rr !== undefined) await ev.action.setSettings({ ...ev.payload.settings, manualRr: undefined });
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
export class SessionResetAction extends SingletonAction<ActionSettings> {
	private downAt = new WeakMap<object, number>();

	override async onWillAppear(ev: WillAppearEvent<ActionSettings>): Promise<void> {
		if (ev.action.isKey()) await ev.action.setImage(keyImage(renderControl("HOLD", "RESET SESSION", "#ff4655")));
	}

	override async onKeyDown(ev: KeyDownEvent<ActionSettings>): Promise<void> {
		this.downAt.set(ev.action as unknown as object, Date.now());
	}

	override async onKeyUp(ev: KeyUpEvent<ActionSettings>): Promise<void> {
		const started = this.downAt.get(ev.action as unknown as object) ?? Date.now();
		this.downAt.delete(ev.action as unknown as object);
		if (Date.now() - started < 1200) {
			await ev.action.showAlert();
			return;
		}
		await valorantService.resetSession();
		await ev.action.showOk();
	}
}

@action({ UUID: "com.packrat.valorant-tracker.spike-timer" })
export class SpikeTimerAction extends SingletonAction<ActionSettings> {
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
		}, 250);
	}

	private stopTicker(): void {
		if (!this.timer) return;
		clearInterval(this.timer);
		this.timer = null;
	}

	private async paintAll(): Promise<void> {
		for (const instance of this.actions) {
			if (instance.isKey()) await this.paint(instance);
		}
	}

	private async paint(key: KeyAction<ActionSettings>): Promise<void> {
		await key.setImage(keyImage(renderTimer(this.remaining())));
	}
}
