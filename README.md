# Valorant Tracker for Stream Deck

A dedicated Stream Deck ranked dashboard for Valorant. It keeps the information you actually glance at during a competitive session on physical keys: rank, RR, session movement, record, last result, recent performance, agents, maps, act countdown and a 45 second spike timer.

This branch is a separate product implementation with UUID `com.packrat.valorant-tracker`. It does not change the published Riot Rank Tracker product and does not merge with the existing XENEON Edge Valorant Tracker.

## Setup

The player data backend is HenrikDev. No Riot Developer Portal key is used by this plugin.

1. Install the plugin and add any Valorant Tracker action, or open one of the bundled dashboards.
2. Open that action's Property Inspector.
3. Enter the Riot ID as one field in the exact format `Name#TAG`.
4. Choose the Valorant shard: NA, EU, AP, KR, LATAM or BR.
5. Press **Open HenrikDev Dashboard**, open **API Keys**, generate a key, and paste it into the Property Inspector.
6. Optionally set an act end date if you want to use the Act Countdown action.

The account configuration is stored in Stream Deck **global settings**, so it is entered once and shared by every Valorant Tracker action. A user never needs to paste the HenrikDev key into 15 separate keys.

If HenrikDev directs an account through its Discord setup instead, request a Basic key in its get a key flow and use that key here.

HenrikDev is an independent third party community API. Availability, endpoint behavior and rate limits are controlled by HenrikDev rather than PackRat.

## Bundled dashboards

The plugin ships editable dashboards for:

* Standard 15 key Stream Deck
* Stream Deck XL
* Stream Deck Neo

The profiles install with the plugin but are configured not to force switch the user's active Stream Deck page during installation.

### Default 15 key dashboard

| Row | Key 1 | Key 2 | Key 3 | Key 4 | Key 5 |
| --- | --- | --- | --- | --- | --- |
| 1 | Current Rank | Current RR | Session RR | Session Record | Last Match |
| 2 | Headshot % | Top Agent | Agent K/D | Top Map | Damage |
| 3 | Log Win | Log Loss | Spike Timer | Act Countdown | Session Reset |

Refresh is available as an action but is intentionally not part of the default 15 key page. Every stat key can refresh on press and the plugin also refreshes centrally in the background.

## Actions

### Ranked session

* **Current Rank**: current competitive tier plus RR.
* **Current RR**: current RR plus last competitive RR movement.
* **Session RR**: net RR from the tracked session.
* **Session Record**: session wins and losses.
* **Last Match**: latest competitive result plus RR movement.
* **Refresh**: force one shared refresh for the account.

### Performance

* **Headshot %**: headshots divided by head, body and leg hits across the recent competitive sample returned by HenrikDev.
* **Top Agent**: a configurable top agent slot with K/D and win rate.
* **Agent K/D**: K/D for the selected top agent slot.
* **Agent Win Rate**: win rate for the selected top agent slot.
* **Damage**: damage dealt in the latest competitive match. This meaning is deliberate and must not silently change.
* **Top Map**: a configurable top map slot with win rate.
* **Map Win Rate**: win rate for the selected top map slot.
* **ACS**: recent competitive score divided by rounds played.
* **Recent Match**: configurable recent match slot, useful on XL dashboards.

Top agents and maps currently use the recent competitive match sample, ordered by games played first, then win rate and K/D as tie breakers. The unavailable XENEON source means this exact aggregation could not be copied, so this behavior is explicitly documented instead of pretending it is identical.

### Controls

* **Spike Timer**: tap to start 45 seconds. Tap while active to reset. The key changes from normal to warning to critical as time expires.
* **Log Win** and **Log Loss**: manual session logging. An optional one time RR value can be entered in that key's Property Inspector. Manual entries update the dashboard immediately and reconcile against later API matches so a result is not permanently double counted.
* **Session Reset**: hold for 1.2 seconds to reset the tracked session. The local dashboard resets immediately even if the network is unavailable.
* **Act Countdown**: displays the optional configured act end date.

## Data and caching

All Valorant player data comes from HenrikDev using the user's HenrikDev API key.

The plugin uses current HenrikDev endpoints as its primary integration:

* MMR v3 for current tier, RR and last RR change
* MMR History v2 for match level RR movement
* Matchlist v4 for recent competitive match statistics

Legacy fallbacks are used only for compatibility when a newer endpoint explicitly reports that it is unavailable.

There is one plugin level data service, one account cache and one in flight request at a time. Twenty visible actions do not produce twenty copies of the same API request. Cached data is reused for five minutes and last known good data remains visible during temporary network or API failures.

Forced refreshes that arrive while another request is running are coalesced and queued for one follow up pass. The service re reads local settings after the network request so an account edit, manual result, or session reset cannot be overwritten by an older request finishing late.

The background poller also uses a five minute cadence. A forced refresh from one key updates every visible Valorant Tracker action.

## Session model

When a tracked session is created, existing MMR history IDs become its baseline. New competitive games after that baseline contribute wins, losses and RR movement. Reset creates a fresh baseline.

Manual wins and losses are stored locally with timestamps and reflected on the dashboard immediately. When HenrikDev later returns a matching competitive result, the manual record is reconciled to that match so the session does not keep both copies.

## Error states

Keys never intentionally go blank. The renderer has explicit states for:

`SET ACCOUNT`, `API KEY`, `BAD KEY`, `BAD RIOT ID`, `BAD REGION`, `RATE LIMIT`, `OFFLINE`, `NOT FOUND`, `API ERROR`, `LOADING`, `UNRANKED` and stale last known good data.

## Privacy

Riot ID, region, HenrikDev API key, session state and cache are stored locally using Stream Deck settings. Player data is sent only to HenrikDev as required for the tracker to function. PackRat does not receive the API key or player data, and the plugin has no PackRat account service or analytics endpoint.

## Platform support

The implementation is Node/TypeScript plus HTTPS and SVG key rendering. It has no Windows only native dependency. The manifest targets Windows 10+ and macOS 12+. CI builds and validates on Linux, Windows and macOS; physical hardware remains the final confidence boundary for actual key readability and imported profile behavior.

## Development

```text
npm ci
npm test
npm run visual:fixtures
python scripts/build_profiles.py
python scripts/profile_qa.py
python scripts/valorant_qa.py
npm run build
npx @elgato/cli validate com.packrat.valorant-tracker.sdPlugin --no-update-check
npx @elgato/cli pack com.packrat.valorant-tracker.sdPlugin --output dist --no-update-check
```

`npm run visual:fixtures` creates deterministic Standard, XL, Neo and error state SVG contact sheets under `dist/visual-fixtures/` for review without requiring hardware.

### Optional live HenrikDev smoke test

The live smoke command uses the exact production HenrikDev client and reads credentials from environment variables. It is intentionally not part of CI and never prints the supplied API key or PUUID.

PowerShell example:

```text
$env:VALORANT_RIOT_ID="Name#TAG"
$env:VALORANT_REGION="na"
$env:HENRIK_API_KEY="your-key"
npm run smoke:henrik
```

The final physical release checklist is in `release/MANUAL-QA.md`. Marketplace copy and submission metadata are in `release/marketplace.json`.

Key implementation files:

| File | Purpose |
| --- | --- |
| `src/valorant/henrik.ts` | HenrikDev client and response compatibility parsing |
| `src/valorant/service.ts` | shared account cache, refresh coalescing, aggregation and session model |
| `src/valorant/render.ts` | dynamic 144 by 144 key SVG system and error/timer states |
| `src/valorant/actions.ts` | Stream Deck action classes and interactions |
| `com.packrat.valorant-tracker.sdPlugin/ui/` | global account Property Inspector plus per key slot/manual controls |
| `profiles/` | canonical Standard, XL and Neo dashboard definitions |
| `scripts/build_profiles.py` | deterministic V2 Stream Deck profile archive generator |
| `scripts/profile_qa.py` | source and archive profile validation |
| `scripts/build_visual_fixtures.ts` | deterministic dashboard and state contact sheets |
| `scripts/henrik_smoke.ts` | opt in live production client smoke test |
| `tests/valorant.test.ts` | host independent fixture and renderer tests |

## Product status

The automated release gate builds profiles, validates profile archives, runs fixture and structural QA, renders deterministic visual evidence, builds the plugin, validates through Elgato CLI, packages a release candidate and repeats the important build and validation steps on Windows and macOS.

Physical hardware, a real HenrikDev key, final deterministic marketplace art and the final marketplace price remain release boundaries. The draft PR stays unmerged until those are complete.

Not affiliated with, endorsed by, or sponsored by Riot Games or HenrikDev.
