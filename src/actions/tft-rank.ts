import { action } from "@elgato/streamdeck";

import { RankActionBase } from "./base";

@action({ UUID: "com.packrat.riot-tracker.tft-rank" })
export class TftRankAction extends RankActionBase {
	protected override game = "tft" as const;
	protected override queueType = "RANKED_TFT";
	protected override kicker = "TFT";
}
