import { action } from "@elgato/streamdeck";

import { RankActionBase } from "./base";

@action({ UUID: "com.packrat.riot-tracker.lol-rank" })
export class LolRankAction extends RankActionBase {
	protected override game = "lol" as const;
	protected override queueType = "RANKED_SOLO_5x5";
	protected override kicker = "LOL";
}
