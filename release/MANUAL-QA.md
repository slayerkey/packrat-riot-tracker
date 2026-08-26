# Valorant Tracker final manual QA

Automated CI must be green before this checklist starts. This checklist is intentionally limited to boundaries that require a real Stream Deck installation, a real HenrikDev account, or physical responsiveness judgement.

## Already confirmed on real Stream Deck software

Observed during local development testing:

* PASS: Valorant Tracker plugin category appears in Stream Deck.
* PASS: Shared Riot account and HenrikDev settings persist between actions.
* PASS: Current Rank populates successfully from HenrikDev on a real account.
* PASS: Current RR populates successfully from HenrikDev on a real account.
* PASS: Standard profile was manually imported and its action references resolved correctly.
* PASS: Standard, XL and Neo `.streamDeckProfile` archives are bundled in the plugin and release candidate.

A developer link does not prove Marketplace style profile auto installation. That remains a packaged installation release boundary.

No API key is recorded in this checklist or committed to the repository.

## 1. Install exact current development candidate

Run:

```text
rat dev valorant-tracker
```

A successful run must report the exact current source commit and show both Link and Restart as verified. Rat Dev now builds and validates an isolated candidate before replacing the working plugin, and attempts rollback if activation fails.

After activation:

1. Confirm the existing Valorant Tracker profile resolves without question mark placeholders.
2. Confirm the Stream Deck app and Standard dashboard remain responsive when opening the profile and switching away from it.
3. Confirm Current Rank and Current RR populate from the configured real account.

## 2. Session reset and persistence

1. Confirm Session Reset shows `RESET / TAP TWICE` in its normal state.
2. Tap once and confirm it changes to `TAP AGAIN / RESET SESSION` without clearing the session yet.
3. Tap again within the confirmation window and confirm Session RR and Session Record become zero.
4. Press Current RR once to force a HenrikDev refresh and confirm the reset session remains zero rather than resurrecting old matches.
5. Restart Stream Deck and confirm the reset session still remains zero.

Automated tests already cover rapid manual mutations, old matches arriving late, reset boundaries, repeated API snapshots, manual/API reconciliation, a deterministic 1,000 transition state stress run, and a 15 match session rolling through HenrikDev's newest ten match window. The physical check is only verifying persistence through the real Stream Deck host.

## 3. Spike timer

1. Press Spike Timer and confirm it starts at 45 seconds.
2. Confirm it advances once per second without making the Stream Deck interface sluggish.
3. Press while active and confirm the timer resets.
4. Start it again, allow it to reach zero, and confirm the complete state is readable.
5. Press after completion and confirm a new 45 second timer starts.

## 4. Clean automatic Competitive result test

When a convenient real Competitive match is available:

1. Begin with a known session baseline before the match result appears in HenrikDev.
2. Do not use Log Win or Log Loss during this test.
3. After the match is ingested by HenrikDev, press Current RR once if you do not want to wait for the five minute poll.
4. Confirm Session Record increments exactly once.
5. Confirm Session RR reflects the reported RR movement exactly once.
6. Confirm Last Match and recent Competitive statistics update coherently.

Manual Log Win and Log Loss actions remain available as advanced fallbacks but are not part of the default Standard dashboard or the primary automatic workflow.

## 5. Packaged profile installation boundary

Before Marketplace submission, install the actual packaged `.streamDeckPlugin` candidate rather than a developer link and confirm:

1. Standard, XL and Neo profiles install according to the manifest `AutoInstall` declarations for the applicable connected device models.
2. Installation does not unexpectedly switch the user's active profile because `DontAutoSwitchWhenInstalled` is enabled.
3. Bundled profiles remain editable.

## 6. Final release decisions

Before paid Marketplace release:

1. Confirm the applicable HenrikDev project support arrangement for a paid product.
2. Confirm final Marketplace price and listing copy.
3. Perform one final package install and visual scan of the Marketplace art/release kit.

## Release boundary

The code path is release candidate quality once the automated gate is green. The remaining release blockers are the exact current host smoke test above, packaged profile auto installation behavior, HenrikDev paid project support confirmation, and final pricing/submission approval.
