# Valorant Tracker for Stream Deck

A dedicated Stream Deck ranked dashboard for Valorant. It keeps the information you actually glance at during a Competitive session on physical keys: rank, RR, automatic session movement, record, latest result, recent performance, agents, maps and a 45 second spike timer.

This branch is a separate product implementation with UUID `com.packrat.valorant-tracker`. It does not change the existing Riot Rank Tracker product on `master`.

## Setup

The player data backend is HenrikDev. No Riot Developer Portal key is used by this plugin.

1. Install the plugin and add any Valorant Tracker action, or open one of the bundled dashboards.
2. Open that action's Property Inspector.
3. Enter the Riot ID in the exact format `Name#TAG`.
4. Press **Open HenrikDev Dashboard**, open **API Keys**, generate a key, and paste it into the Property Inspector.
5. Leave the region selector at its default unless automatic region detection cannot resolve the account.
6. Optionally set an act end date if you want to use the Act Countdown action.

The account configuration is stored in Stream Deck global settings, so it is entered once and shared by every Valorant Tracker action. The plugin normally resolves the account's actual region through HenrikDev Account v2 and uses the selected region only as fallback.

HenrikDev is an independent third party community API. Availability, endpoint behavior and rate limits are controlled by HenrikDev rather than PackRat.

## Bundled dashboards

The plugin ships editable dashboards for:

* Standard 15 key Stream Deck
* Stream Deck XL
* Stream Deck Neo

The manifest declares those profiles for automatic installation while also setting `DontAutoSwitchWhenInstalled`, so installation should not force the user's active page to change. A developer link does not prove packaged profile auto installation; that behavior remains a final packaged install boundary.

### Default 15 key dashboard

| Row | Key 1 | Key 2 | Key 3 | Key 4 | Key 5 |
| --- | --- | --- | --- | --- | --- |
| 1 | Current Rank | Current RR | Session RR | Session Record | Last Match |
| 2 | Headshot % | Top Agent | Agent K/D | Top Map | Damage |
| 3 | Agent Win Rate | Map Win Rate | Spike Timer | ACS | Session Reset |

The Standard dashboard is deliberately centered on automatic tracking. Log Win and Log Loss still exist as advanced fallback actions but do not occupy premium space on the default 15 key page. Refresh also remains available as an action; every metric key can force a refresh on press and the plugin refreshes centrally in the background.

## Actions

### Ranked session

* **Current Rank**: current competitive tier plus RR.
* **Current RR**: current RR plus last competitive RR movement.
* **Session RR**: persistent net RR from the tracked session.
* **Session Record**: persistent session wins and losses.
* **Last Match**: latest competitive result plus RR movement.
* **Refresh**: force one shared refresh for the account.

### Performance

* **Headshot %**: headshots divided by head, body and leg hits across the recent competitive sample returned by HenrikDev.
* **Top Agent**: a configurable top agent slot with K/D and win rate.
* **Agent K/D**: K/D for the selected top agent slot.
* **Agent Win Rate**: win rate for the selected top agent slot.
* **Damage**: damage dealt in the latest competitive match.
* **Top Map**: a configurable top map slot with win rate.
* **Map Win Rate**: win rate for the selected top map slot.
* **ACS**: recent competitive score divided by rounds played.
* **Recent Match**: configurable recent match slot, useful on XL dashboards.

Top agents and maps use the recent Competitive sample, ordered by games played first, then win rate and K/D as tie breakers.

### Controls

* **Spike Timer**: tap to start 45 seconds. Tap while active to reset. The key changes from normal to warning to critical as time expires.
* **Session Reset**: two tap confirmation. The first tap arms the reset for 2.5 seconds and the second clears the session. This prevents an accidental single press from deleting the session.
* **Log Win** and **Log Loss**: advanced manual fallback logging. An optional one time RR value can be entered in that key's Property Inspector. Manual entries update the dashboard immediately and reconcile against later API matches so a result is not permanently double counted.
* **Act Countdown**: displays the optional configured act end date.

## HenrikDev integration

Primary integration:

* Account v2 for automatic region discovery
* MMR v3 for current tier, RR and latest RR change
* MMR History v2 for match level RR movement
* Matchlist v4 for recent Competitive match statistics

Compatibility fallbacks are used only where explicitly supported by the client. Matchlist requests are filtered to `mode=competitive` and limited to ten current detailed matches.

Henrik JSON requests are bounded to 12 seconds. Optional remote artwork hydration is bounded to 6 seconds. Region discovery falls back to the selected shard for transient network, timeout, rate limit and server failures while authentication and malformed request failures still fail closed.

The match normalizer supports both current v4 nested combat data and the older fallback response shape. Competitive draws are recognized before false team loss booleans can turn a tied match into a loss.

## Data and caching

There is one plugin level data service, one account cache and one in flight Henrik refresh at a time. Twenty visible actions do not produce twenty copies of the same API request. Cached data is reused for five minutes and last known good data remains visible during temporary network or API failures.

Forced refreshes that arrive while another request is running are coalesced into at most one follow up pass. Henrik network work occurs outside the serialized mutation queue; its final store commit occurs inside that queue with account edits, manual controls and Reset so a late request cannot overwrite newer local state.

The Property Inspector never writes the complete runtime global store. It sends narrow account field updates to the plugin. The plugin service is the sole owner of complete session/cache/global settings writes.

Dynamic key images are cached per visible action. Identical output does not send another `setImage` IPC command, and multi key repaints are dispatched concurrently. The cache is invalidated when a key appears again so profile switching cannot leave a stale face behind.

## Session model

When a session is created, all already known match IDs become its baseline. New Competitive matches after that boundary are stored in a compact automatic session ledger containing match ID, start time, result and known RR change.

That ledger is deliberately independent from Henrik's newest ten detailed match window. A 15 match or longer play session therefore does not lose earlier wins, losses or RR when an old match disappears from the current response. Reset creates a new timestamp and known match baseline, so an older match that arrives late cannot reenter the new session.

Manual fallback entries record which automatic matches were already known when the button was pressed. If a genuinely new matching API result arrives later, the manual entry reconciles to it rather than creating a permanent duplicate.

## Error states

Keys never intentionally go blank. The renderer has explicit states for:

`SET ACCOUNT`, `API KEY`, `BAD KEY`, `BAD RIOT ID`, `BAD REGION`, `RATE LIMIT`, `OFFLINE`, `NOT FOUND`, `API ERROR`, `LOADING`, `UNRANKED` and stale last known good data.

## Privacy and consent

Riot ID, fallback region, HenrikDev API key, session state and cache are stored using Stream Deck settings on the user's computer. Player requests are sent only to HenrikDev as required for the tracker to function. PackRat does not receive the API key or player data, and the plugin has no PackRat account service or analytics endpoint.

Track only an account you own or have permission to use. The current HenrikDev release audit and paid product dependency are documented in `docs/HENRIKDEV_RELEASE_AUDIT.md`.

## Platform support

The implementation is Node/TypeScript plus HTTPS and SVG key rendering. It has no Windows only native dependency. The manifest targets Windows 10+ and macOS 12+. CI type checks, tests, builds and validates on Linux, Windows and macOS.

## Development

```text
npm ci
npm run typecheck
npm test
npm run visual:fixtures
python scripts/build_profiles.py
python scripts/profile_qa.py
python scripts/valorant_qa.py
npm run build
npx @elgato/cli validate com.packrat.valorant-tracker.sdPlugin --no-update-check
npx @elgato/cli pack com.packrat.valorant-tracker.sdPlugin --output dist --no-update-check
```

For normal Windows hardware iteration, use the RatPack command instead of hand copied builds:

```text
rat dev valorant-tracker
```

Rat Dev fetches the canonical external branch, creates an isolated candidate worktree, installs dependencies, type checks, builds, tests, generates and validates profiles, runs product QA, runs the official Elgato validator, and only then switches Stream Deck to the validated candidate. Activation failure attempts rollback to the previous development build.

### Optional live HenrikDev smoke test

The live smoke command uses the production HenrikDev client and reads credentials from environment variables. It is intentionally not part of CI and never prints the supplied API key or PUUID.

```text
$env:VALORANT_RIOT_ID="Name#TAG"
$env:VALORANT_REGION="na"
$env:HENRIK_API_KEY="your-key"
npm run smoke:henrik
```

The final host checklist is in `release/MANUAL-QA.md`. Marketplace copy is in `marketplace/marketplace.json` and release metadata is mirrored in `release/marketplace.json`.

## Product status

Automated release gates cover TypeScript errors, deterministic session stress tests, rolling Henrik match windows, renderer/error fixtures, profile generation and archive QA, structural product QA, deterministic Marketplace art, build, Elgato validation, packaging and release kit generation. Windows and macOS repeat the important typecheck, test, build, profile and Elgato validation path.

Real Stream Deck testing has already confirmed the plugin category, shared account settings, live Current Rank, live Current RR and manual Standard profile import/action resolution. Remaining release boundaries are a short exact current candidate host smoke test, packaged profile auto installation behavior, confirmation of the applicable HenrikDev support arrangement for a paid product, and final Marketplace pricing/submission approval.

Not affiliated with, endorsed by, or sponsored by Riot Games or HenrikDev.
