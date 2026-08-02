import streamDeck from "@elgato/streamdeck";

import { LolRankAction } from "./actions/lol-rank";
import { TftRankAction } from "./actions/tft-rank";
import { startPoller } from "./poller";

streamDeck.logger.setLevel("info");

const lolRank = new LolRankAction();
const tftRank = new TftRankAction();

streamDeck.actions.registerAction(lolRank);
streamDeck.actions.registerAction(tftRank);

// Polling has to wait for the connection: the first thing a poll does is write the cache to
// global settings, and that call simply never resolves if the websocket is not up yet.
streamDeck.connect().then(() => {
	startPoller({
		run: async () => {
			await lolRank.pollAll();
			await tftRank.pollAll();
		},
		onError: (error) => streamDeck.logger.error("poll failed", error)
	});
});
