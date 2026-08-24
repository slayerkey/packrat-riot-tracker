import streamDeck from "@elgato/streamdeck";

import {
	AcsAction,
	ActCountdownAction,
	AgentKdAction,
	AgentWinRateAction,
	DamageAction,
	HeadshotAction,
	LastMatchAction,
	LogLossAction,
	LogWinAction,
	MapWinRateAction,
	RankAction,
	RecentMatchAction,
	RefreshAction,
	RrAction,
	SessionRecordAction,
	SessionResetAction,
	SessionRrAction,
	SpikeTimerAction,
	TopAgentAction,
	TopMapAction
} from "./valorant/actions";
import { startPoller } from "./poller";
import { valorantService } from "./valorant/service";

streamDeck.logger.setLevel("info");

const actions = [
	new RankAction(),
	new RrAction(),
	new SessionRrAction(),
	new SessionRecordAction(),
	new LastMatchAction(),
	new HeadshotAction(),
	new TopAgentAction(),
	new AgentKdAction(),
	new AgentWinRateAction(),
	new DamageAction(),
	new TopMapAction(),
	new MapWinRateAction(),
	new AcsAction(),
	new RecentMatchAction(),
	new ActCountdownAction(),
	new SpikeTimerAction(),
	new LogWinAction(),
	new LogLossAction(),
	new SessionResetAction(),
	new RefreshAction()
];

for (const action of actions) streamDeck.actions.registerAction(action);

streamDeck.connect().then(async () => {
	await valorantService.initialize();
	startPoller({
		run: () => valorantService.refresh(false).then(() => undefined),
		onError: (error) => streamDeck.logger.error("Valorant poll failed", error)
	});
	void valorantService.refresh(false);
});
