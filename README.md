# LARP Tools

Unofficial, player-made tools for LARP players, at
[larptools.scrollplaygames.com](https://larptools.scrollplaygames.com/).

| Address       | What                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| `/`           | The hub page (`hub/`)                                                       |
| `/rustwater/` | Rustwater: a test builder and the Soak and Damage Calculator (`rustwater/`) |
| `/calendar/`  | LARP and convention event calendar (`hub/calendar/`; dates in `events.js`)  |

No accounts, no tracking, no analytics. Everything a visitor enters stays in their own browser.
These are fan projects, not made or endorsed by the games they are for (see NOTICE).

## Build

Node 24.

```
npm run build
```

This runs `npm ci` and `npm run build` in each game folder, then puts the hub and every game's
build into `site/`, writes one `_headers` file for the whole site, and runs the privacy scan on
the result. Open `site/` with any static file server to check it.

Each game folder is its own project with its own tests: see `rustwater/README.md`.

## Hosting

Cloudflare Pages (free plan), connected to this repo:

- Build command: `npm run build`
- Build output folder: `site`
- Environment variable: `NODE_VERSION` = `24`

## Privacy scan

`npm run privacy-scan` fails if any file holds a personal email address, a home folder path, a
private network address, or a name from the local `.privacy-names.local` list (never committed).
CI and every build run it.

## License

Code: MIT (LICENSE). Game names, rules, and setting belong to their owners (NOTICE).
