# Valorant Tracker final manual QA

Automated CI must be green before this checklist starts. This checklist only covers boundaries that need a real Stream Deck installation, a real HenrikDev account, or human readability judgement.

## Current observed smoke status

Observed on a real local Stream Deck development installation on 2026-08-24:

* PASS: Valorant Tracker plugin category appears in Stream Deck.
* PASS: Shared Riot account and HenrikDev settings persist between actions.
* PASS: Current Rank populates successfully from HenrikDev on a real account.
* PASS: Current RR populates successfully from HenrikDev on a real account.
* PASS: Standard, XL and Neo `.streamDeckProfile` archives are present in the plugin source and release candidate.
* OPEN: Rat Dev linking did not visibly auto-install or switch to a bundled profile. Standard profile import and action resolution still need to be confirmed in current Stream Deck software.
* OPEN: Remaining actions, session controls, timer behavior, stale-data behavior and physical readability still need spot checking.

No API key is recorded in this checklist or committed to the repository.

## 1. Install candidate

1. Install the packaged `com.packrat.valorant-tracker.streamDeckPlugin` release candidate.
2. Confirm Stream Deck starts the plugin without a warning icon or crash loop.
3. Confirm the Valorant Tracker category contains all 20 actions.
4. Confirm installing the plugin does not automatically switch the user's active Stream Deck page.

## 2. Bundled profiles

For each available device model:

1. Confirm the matching Valorant Tracker profile was installed.
2. Open the profile and confirm every expected key is present in the intended position.
3. Confirm profile keys resolve to Valorant Tracker actions rather than missing plugin placeholders.
4. Confirm the profile remains editable by the user.
5. Confirm Standard uses 15 keys, XL fits the 8 by 4 grid without filler collisions, and Neo uses 8 keys.

## 3. One time setup

1. Select any Valorant Tracker action.
2. Enter a real Riot ID in `Name#TAG` format.
3. Choose the correct region.
4. Press `Open HenrikDev Dashboard` and confirm it opens the HenrikDev dashboard in the default browser.
5. Generate or retrieve the user's HenrikDev API key from the HenrikDev dashboard.
6. Paste the API key once.
7. Select a different Valorant Tracker action and confirm the same Riot ID, region and API key are already available because account setup is global.
8. Confirm the API key input is masked.

## 4. Live data

With a real HenrikDev key and a ranked account:

1. Confirm Current Rank matches the account's current competitive rank.
2. Confirm Current RR matches the account's current RR.
3. Confirm Last Match represents the latest competitive match and its RR movement.
4. Confirm Headshot %, Damage and ACS populate when recent competitive data exists.
5. Confirm Top Agent and Agent K/D show coherent values for slot 1.
6. Confirm Top Map shows a coherent recent map result for slot 1.
7. On XL, confirm slot 2 and slot 3 agent, map and recent match keys select different records when enough data exists.
8. Press a metric key and confirm a forced refresh does not blank unrelated keys.
9. Disconnect the network briefly or otherwise test stale data and confirm last known good values remain visible with the stale warning treatment.

## 5. Session tracking

1. Reset the session by holding Session Reset for at least 1.2 seconds.
2. Confirm a short accidental tap does not reset the session.
3. Play or wait for a new competitive result and confirm session wins or losses and net RR update after HenrikDev reports it.
4. Use Log Win or Log Loss with no manual RR and confirm the record updates.
5. Enter a one time RR adjustment on a manual result key, press it, and confirm the value is consumed and cleared.
6. After the real match later appears through HenrikDev, confirm the manual result reconciles instead of being permanently counted twice.
7. Restart Stream Deck and confirm the active session state survives.

## 6. Spike timer

1. Press Spike Timer and confirm it begins at 45 seconds.
2. Confirm the display advances without requiring repeated presses.
3. Confirm warning and critical visual states appear as time decreases.
4. Press while active and confirm the timer resets.
5. Let it reach zero and confirm the complete state is readable.
6. Press after completion and confirm a new 45 second timer starts.

## 7. Error states

Verify readable key faces for at least:

1. Missing Riot ID.
2. Invalid Riot ID format.
3. Missing HenrikDev API key.
4. Invalid HenrikDev API key.
5. Rate limited response if practical to reproduce safely.
6. Offline state.
7. Account not found.
8. No recent match or agent data.
9. Unranked account if an appropriate test account is available.

No state should leave a permanently blank key.

## 8. Readability and interaction

Check Standard, XL and Neo where hardware is available:

1. Rank and RR are readable at normal desk distance.
2. Session RR positive and negative states are immediately distinguishable.
3. Win and loss controls cannot be confused at a glance.
4. Agent and map names do not clip in common cases.
5. Long names degrade gracefully rather than overflowing the key.
6. Touch or key presses do not feel delayed because of background API work.
7. Repeated rapid refresh presses do not create visible instability.

## Release boundary

The product may move from automated QA complete to release ready only after:

1. The packaged plugin installs successfully.
2. At least one real HenrikDev account passes live data smoke testing.
3. At least the Standard profile imports and resolves correctly on current Stream Deck software.
4. Any hardware models available for final testing pass readability and interaction checks.
5. Final marketplace price and listing review are approved.
