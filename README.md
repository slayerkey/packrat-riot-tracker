# Valorant Tracker for Stream Deck

A dedicated Stream Deck ranked dashboard for Valorant. It keeps the information you actually glance at during a competitive session on physical keys: rank, RR, session movement, record, last result, recent performance, agents, maps, act countdown and a 45 second spike timer.

This branch is a separate product implementation with UUID `com.packrat.valorant-tracker`. It does not change the published Riot Rank Tracker product and does not merge with the existing XENEON Edge Valorant Tracker.

## Setup

The player-data backend is HenrikDev. No Riot Developer Portal key is used by this plugin.

1. Install the plugin and add any Valorant Tracker action.
2. Open that action's Property Inspector.
3. Enter the Riot ID as one field in the exact format `Name#TAG`.
4. Choose the Valorant shard: NA, EU, AP, KR, LATAM or BR.
5. Get a HenrikDev API key from `api.henrikdev.xyz/dashboard/`, open **API Keys**, generate a key, and paste it into the Property Inspector.
6. Optionally set an act end date if you want to use the Act Countdown action.

The account configuration is stored in Stream Deck **global settings**, so it is entered once and shared by every Valorant Tracker action. A user never needs to paste the HenrikDev key into 15 separate keys.

If HenrikDev directs an account through its Discord setup instead, request a Basic key in its get-a-key flow and use that key here.

## Default 15 key dashboard

| Row | Key 1 | Key 2 | Key 3 | Key 4 | Key 5 |
| --- | --- | --- | --- | --- | --- |
| 1 | Current Rank | Current RR | Session RR | Session Record | Last Match |
| 2 | Headshot % | Top Agent | Agent K/D | Top Map | Damage |
| 3 | Log Win | Log Loss | Spike Timer | Act Countdown | Session Reset |

Refresh is available as an action but is intentionally not part of the default 15 key page. Every stat key can refresh on press and the plugin also refreshes centrally in the background.

## Actions

### Ranked session

- **Current Rank**: current competitive tier plus RR.
- **Current RR**: current RR plus last competitive RR movement.
- **Session RR**: net RR from the tracked session.
- **Session Record**: session wins and losses.
- **Last Match**: latest competitive result plus RR movement.
- **Refresh**: force one shared refresh for the account.

### Performance

- **Headshot %**: headshots divided by head + body + leg hits across the recent competitive sample returned by HenrikDev.
- **Top Agent**: a configurable top-agent slot with K/D and win rate.
- **Agent K/D**: K/D for the selected top-agent slot.
- **Agent Win Rate**: win rate for the selected top-agent slot.
- **Damage**: damage dealt in the latest competitive match. This meaning is deliberate and must not silently change.
- **Top Map**: a configurable top-map slot with win rate.
- **Map Win Rate**: win rate for the selected top-map slot.
- **ACS**: recent competitive score divided by rounds played.
- **Recent Match**: configurable recent match slot, useful on XL dashboards.

Top agents and maps currently use the recent competitive match sample, ordered by games played first, then win rate and K/D as tie breakers. The unavailable XENEON source means this exact aggregation could not be copied, so this behavior is explicitly documented instead of pretending it is identical.

### Controls

- **Spike Timer**: tap to start 45 seconds. Tap while active to reset. The key changes from normal to warning to critical as time expires.
- **Log Win** and **Log Loss**: manual session logging. An optional one-time RR value can be entered in that key's Property Inspector. Manual entries reconcile against later API matches so a result is not permanently double counted.
- **Session Reset**: hold for 1.2 seconds to reset the tracked session.
- **Act Countdown**: displays the optional configured act end date.

## Data and caching

All Valorant player data comes from HenrikDev using the user's HenrikDev API key.

The plugin uses current HenrikDev endpoints as its primary integration:

- MMR v3 for current tier, RR and last RR change
- MMR History v2 for match-level RR movement
- Matchlist v4 for recent competitive match statistics

Legacy fallbacks are used only for compatibility when a newer endpoint explicitly reports that it is unavailable.

There is one plugin-level data service, one account cache and one in-flight request at a time. Twenty visible actions do not produce twenty copies of the same API request. Cached data is reused for five minutes and last-known-good data remains visible during temporary network or API failures.

The background poller also uses a five minute cadence. A forced refresh from one key updates every visible Valorant Tracker action.

## Session model

When a tracked session is created, existing MMR history IDs become its baseline. New competitive games after that baseline contribute wins, losses and RR movement. Reset creates a fresh baseline.

Manual wins and losses are stored locally with timestamps. When HenrikDev later returns a matching competitive result, the manual record is reconciled to that match so the session does not keep both copies.

## Error states

Keys never intentionally go blank. The renderer has explicit states for:

`SET ACCOUNT`, `API KEY`, `BAD KEY`, `BAD RIOT ID`, `BAD REGION`, `RATE LIMIT`, `OFFLINE`, `NOT FOUND`, `API ERROR`, `LOADING`, `UNRANKED` and stale last-known-good data.

## Privacy

Riot ID, region, HenrikDev API key, session state and cache are stored locally using Stream Deck settings. Player data is sent only to HenrikDev as required for the tracker to function. The plugin has no Packrat account service and no Packrat analytics endpoint.

## Platform support

The implementation is Node/TypeScript plus HTTPS and SVG key rendering. It has no Windows-only native dependency. The manifest targets Windows 10+ and macOS 12+; public compatibility claims should still follow final package/import validation.

## Development

```text
npm ci
npm test
npm run build
npx @elgato/cli validate com.packrat.valorant-tracker.sdPlugin --no-update-check
npx @elgato/cli pack com.packrat.valorant-tracker.sdPlugin --output dist --no-update-check
```

GitHub Actions runs the same build, fixture, Elgato validation and packaging gate before physical Stream Deck testing.

Key implementation files:

| File | Purpose |
| --- | --- |
| `src/valorant/henrik.ts` | HenrikDev client and response compatibility parsing |
| `src/valorant/service.ts` | shared account cache, refresh coalescing, aggregation and session model |
| `src/valorant/render.ts` | dynamic 144x144 key SVG system and error/timer states |
| `src/valorant/actions.ts` | Stream Deck action classes and interactions |
| `com.packrat.valorant-tracker.sdPlugin/ui/` | global account Property Inspector plus per-key slot/manual controls |
| `tests/valorant.test.ts` | host-independent fixture and renderer tests |

## Product status

The automated release gate builds, tests, validates and packages the plugin in GitHub Actions. Physical hardware remains the final place to judge key readability, press behavior and profile layout, not the place to discover basic build errors.

Not affiliated with, endorsed by, or sponsored by Riot Games or HenrikDev.
