# HenrikDev release audit

Checked against the current HenrikDev documentation and public project README on 2026-08-25.

## Endpoints used by Valorant Tracker

The product is aligned with the current documented stable endpoints:

- Account v2: `/valorant/v2/account/{name}/{tag}`
- MMR v3: `/valorant/v3/mmr/{region}/{platform}/{name}/{tag}`
- MMR History v2: `/valorant/v2/mmr-history/{region}/{platform}/{name}/{tag}`
- Matchlist v4: `/valorant/v4/matches/{region}/{platform}/{name}/{tag}`

The plugin uses `platform=pc`, requests Competitive matches, and limits match history to ten entries. Account v2 is used to resolve the player's actual region before region-scoped requests. The configured region remains a fallback.

The current v4 match normalizer supports the documented nested combat data shape, including `stats.damage.dealt`, while retaining compatibility with the older v3 response shape used by the fallback endpoint.

## Error and rate behavior

HenrikDev documents 400, 403, 404, 408, 429, 501 and 503 style failures across the relevant endpoints. Valorant Tracker keeps the last known good snapshot when a refresh fails, surfaces setup/key/rate/network states on the Stream Deck, and uses a shared five minute refresh cadence instead of one request loop per key.

The public HenrikDev README currently documents 30 requests per minute for Basic keys and 90 requests per minute for Advanced keys. Valorant Tracker's normal five minute cadence is well below those limits for one configured account.

## Consent requirement

HenrikDev's public README explicitly asks applications to use player data only with the user's consent and says unsupported analytic services without consent may be banned.

Valorant Tracker is designed around a user supplying the Riot ID they want to track and now tells users to track only an account they own or have permission to use. Marketplace copy should not encourage tracking arbitrary third-party players without permission.

## Paid product dependency to resolve before Marketplace release

HenrikDev's current public README also states that projects with a paid tier, or projects requiring higher request limits, are expected to subscribe to HenrikDev Patreon level 4/5 for project support.

Valorant Tracker is intended to be a paid Marketplace product. Before public paid release, PackRat should confirm the applicable HenrikDev project-support arrangement directly with HenrikDev and satisfy it if required.

This is an external release dependency, not a code failure. Do not mark the paid Marketplace release fully cleared until this dependency is confirmed.
