// One-off: exercises the actual src/riot.ts + src/badge.ts pipeline against the live Riot API,
// bypassing the Stream Deck SDK layer entirely, to confirm the core logic works end to end.
// Not part of the shipped plugin. Run with: npx tsx scripts/live-check.ts
import { getAccountByRiotId, getLolRank, getTftRank, pickQueue } from "../src/riot";
import { rankBadge } from "../src/badge";

const apiKey = process.env.RIOT_API_KEY;
if (!apiKey) {
	console.error("Missing RIOT_API_KEY env var.");
	process.exit(1);
}

async function check(gameName: string, tagLine: string, platform: string) {
	console.log(`\n=== ${gameName}#${tagLine} (${platform}) ===`);
	const account = await getAccountByRiotId(gameName, tagLine, platform, apiKey!);
	console.log("account:", account);
	if (!account) return;

	const lol = await getLolRank(account.puuid, platform, apiKey!);
	console.log("lol rank entries:", lol);
	const solo = lol ? pickQueue(lol, "RANKED_SOLO_5x5") : null;
	if (solo) {
		console.log(
			"badge svg bytes:",
			rankBadge({ kicker: "LOL", tier: solo.tier, rank: solo.rank, leaguePoints: solo.leaguePoints, wins: solo.wins, losses: solo.losses }).length
		);
	}

	const tft = await getTftRank(account.puuid, platform, apiKey!);
	console.log("tft rank entries:", tft);
}

await check("Hide on bush", "KR1", "kr");
