# Riot Rank Tracker

A Stream Deck plugin that keeps your own League of Legends and Teamfight Tactics rank on your deck: current tier, division and LP, updating on its own while you play or stream. No alt-tabbing to the client to check where you stand.

Not affiliated with, endorsed by, or sponsored by Riot Games, League of Legends, or Teamfight Tactics. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

---

## Actions

### LoL Rank
Your current League of Legends ranked solo/duo tier, division and LP. Once the key has been tracking your account for a while it also shows how much that has moved since yesterday or since last week. Press to refresh.

### TFT Rank
The same, for Teamfight Tactics ranked.

## Setup

1. Get a personal API key from [developer.riotgames.com](https://developer.riotgames.com/) (sign in with your Riot account, no application needed for a personal key).
2. Drop a LoL Rank or TFT Rank key onto your deck and open its property inspector.
3. Enter your Riot ID as two fields: the game name, and the tag after the `#` (for example `Faker` and `KR1`).
4. Pick your region.
5. Paste your personal API key in.

The key redraws immediately from whatever it last saw, then checks in with Riot's API on its own every five minutes.

### The 24 hour catch

A personal Riot API key expires every 24 hours. There is no way around this without Riot approving a production key application, which is a separate, per-game process this project has not gone through yet. When a key's data stops updating, that is almost always why: grab a fresh key from the developer portal above and paste it into the property inspector again. Nothing else needs to change.

Your Riot ID and API key are stored only on your own machine, in that key's own Stream Deck settings. They are never written anywhere else and never leave your device except in the request this plugin makes directly to Riot's API.

## How "progress" works

Riot's API has no endpoint anywhere for historical rank or a per-game LP delta, for any game, on any key type. It only ever answers "what is this account's rank right now." So this plugin takes its own timestamped snapshot every time it checks in, and computes "since yesterday" or "since this week" from its own history. That means:

- There is nothing to show until the plugin has actually been running and checking in for that long. A key you set up ten minutes ago cannot yet know your rank "since yesterday", because it wasn't tracking yesterday.
- History only exists from whenever tracking starts. Nothing retroactive is possible; Riot does not expose it.
- History older than 30 days is dropped automatically, so it never grows without bound.

## When the connection drops

If a check-in fails, whether from an expired key, Riot's API being briefly unreachable, or anything else, the key keeps showing the last rank it actually got and draws an amber bar along the bottom edge once that data is getting old, so nothing stale passes for current.

## Current scope

- **League of Legends and Teamfight Tactics**: fully supported, personal-key access only, both confirmed working directly against Riot's live API.
- **VALORANT**: not included. Its rank and match endpoints require RSO (Riot's OAuth), where the player logs into an app and grants consent; a personal API key alone gets a flat 403. That is a real, separate build (OAuth flow, token storage, consent screen) and is out of scope for this pass. A possible future addition once that groundwork exists, nothing more.
- **Legends of Runeterra**: not included. LoR is reachable with a personal key, but Riot only exposes a top-N leaderboard by name for it, with no per-player rank lookup endpoint at all. There isn't enough per-player data available to justify a key face yet.

## What it never shows

Tier names, numbers, and colour coding only. No League, TFT, or Riot logos or artwork anywhere: not on the key faces, not on the action icons, not on the category icon. Riot's own terms forbid using their marks or implying partnership or endorsement, and this plugin holds to that everywhere, including this page.

---

## Development

Self-contained: this plugin does not import `../_shared`, the core the ESPN-based sport trackers share. A rank tracker is a different domain (a personal account and a personal key, not a public game schedule), so its client, cache, poller and key renderer all live under `src/` here. The *pattern* (SVG key faces as base64 data URIs, a single plugin-level poller, last-known-good data cached in global settings, a thin action subclass per action) mirrors the other trackers; none of the files are shared.

```
npm install
npm run build
npx @elgato/cli validate com.packrat.riot-tracker.sdPlugin
python scripts/gen-icons.py
```

| File | What it does |
|---|---|
| `src/riot.ts` | Riot API client: Riot ID → account, LoL rank, TFT rank, LoL/TFT recent match ids. Every call resolves to `null` on failure instead of throwing. |
| `src/cache.ts` | Timestamped rank snapshots per tracked account + queue, kept in Stream Deck global settings; the only place "progress over time" comes from. |
| `src/poller.ts` | The plugin's one background ticker, fixed five minute interval. |
| `src/badge.ts` | SVG key faces: tier, division, LP, and the delta line once there's history to show one. |
| `src/actions/` | `RankActionBase` plus the `LolRankAction` and `TftRankAction` subclasses. |
