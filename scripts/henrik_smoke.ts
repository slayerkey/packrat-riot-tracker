import { fetchHenrikBundle, HenrikError, REGIONS } from "../src/valorant/henrik";
import type { Region } from "../src/valorant/model";

function required(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`Missing ${name}`);
	return value;
}

async function main(): Promise<void> {
	const riotId = required("VALORANT_RIOT_ID");
	const apiKey = required("HENRIK_API_KEY");
	const requestedRegion = (process.env.VALORANT_REGION?.trim().toLowerCase() || "na") as Region;
	if (!REGIONS.includes(requestedRegion)) {
		throw new Error(`VALORANT_REGION must be one of: ${REGIONS.join(", ")}`);
	}

	const startedAt = Date.now();
	const bundle = await fetchHenrikBundle({ riotId, apiKey, region: requestedRegion });
	const elapsedMs = Date.now() - startedAt;

	// Deliberately never print the supplied API key, PUUID, or full Riot ID.
	console.log(
		JSON.stringify(
			{
				ok: true,
				region: requestedRegion,
				rank: bundle.rank.name,
				rr: bundle.rank.rr,
				lastChange: bundle.rank.lastChange,
				historyPoints: bundle.history.length,
				recentCompetitiveMatches: bundle.matches.length,
				elapsedMs
			},
			null,
			2
		)
	);
}

main().catch((error: unknown) => {
	if (error instanceof HenrikError) {
		console.error(
			JSON.stringify(
				{
					ok: false,
					status: error.status,
					error: error.message
				},
				null,
				2
			)
		);
	} else {
		console.error(error instanceof Error ? error.message : String(error));
	}
	process.exitCode = 1;
});
