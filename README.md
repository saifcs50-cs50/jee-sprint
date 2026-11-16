# JEE Sprint

JEE Sprint is the 12-week planner and tracker I built for my own JEE Main 2027 preparation. It is one web page
with a Mac wrapper and an Android (Capacitor) wrapper, and the laptop and phone sync over your home Wi-Fi with no
account and no cloud service.

The plan covers October 2026 to January 2027: syllabus done by 20 December 2026, Session 1 from 22 January 2027.
These dates are tentative constants in `src/plan-data.mjs`, so check them against NTA's official calendar, or edit
that file for another year.

## The plan

It schedules 59 chapters week by week over 17 weeks (12 for the syllabus, then a second pass and sharpening), each
tagged by how often it is asked. Tapping a chapter moves it through not started, learning, done and revised, or you
can skip it. A pace line counts chapters carried over from weeks that have ended, says how far behind you are, and
suggests finishing them on Sunday, doing them the short way, or skipping the least-asked one.

Timetables cover a college day, a Sunday or day off, a mock Sunday and a revision-phase college day, with a live
"now / next" line. Days you mark as no college run the Sunday timetable. On Android, reminders fire as each study
block starts, are scheduled 14 days ahead, and follow the days off.

The test log takes part tests, chapter tests and full mocks with a custom marking scheme, charts them together in
percent, and shows which kind of lost marks ("leaks") costs the most.

## Google Calendar link (optional)

On the Mac you can paste a calendar's private iCal address. Every 10 minutes the server reads it, builds today's and
tomorrow's study blocks around the real class hours, and marks days off (events named like "Holiday", and today if
it is a weekday with no classes). A batch or keyword filter drops other students' classes. The address is kept only
in the Mac's `config.json` (file mode 600) and is never sent back to a client.

An empty day only counts when it is today. Colleges often publish the timetable just a day or two ahead, so an
empty date later in the week usually means it isn't out yet.

## Sync

Progress merges per chapter, test and day by last-changed time, and deletes win over older copies. The Mac keeps
`state.json` plus a daily backup for 21 days.

## How the parts fit

| Path | What it is |
|---|---|
| `src/` | The page: `page.html`, `styles.css`, scripts, and pure modules (`core.mjs` state and merge, `plan-data.mjs` plan, `calendar.mjs` iCal parser, `day-plan.mjs`, `reminders.mjs`, `catch-up.mjs`). |
| `build.mjs` | Bundles `src/` into single-file pages in `dist/` (`mac`, `android`, `artifact`, or `friend/*` with `--friend`). |
| `server.mjs`, `calendar-sync.mjs` | The Node sync server (no npm dependencies). Serves the page and a small JSON API on port 5199. |
| `mac/JEESprint.swift` | A window around the local server's page. |
| `mac/JEESprintPortable.swift` | A self-contained Mac app that runs its own server (same API) and merges with `core.mjs` through JavaScriptCore, so nothing else has to be installed. |
| `android/` | Capacitor Android project (local notifications plugin). |
| `scripts/` | `install-mac.sh`, `build-friend.sh`, `make-icon.swift`, and a dev tool for evaluating JavaScript in the Android WebView. |
| `tests/` | Node test suite, including an API contract that both servers must pass. |

## Run it

You need Node.js. I developed and tested it on Node 25; the server and tests have no npm dependencies.

```bash
npm test
```

Build the pages and run the sync server with a throwaway data folder, so your real data stays out of it:

```bash
export JEE_SPRINT_HOME=/tmp/jee-sprint-data
node build.mjs
node server.mjs --public dist/mac --port 5199
```

Then open <http://127.0.0.1:5199/>. The first run creates `config.json` in the data folder with a random sync key.
Only the machine itself gets the key inside the page; other devices on the network can't sync until you pair them.
`node server.mjs` also accepts `--home`, `--ics-file <path>` (reads the calendar from a local file such as
`tests/fixtures/college-week.ics`) and `--today YYYY-MM-DD`.

### Mac app (macOS 13+, Xcode command line tools)

```bash
npm run install:mac
```

`scripts/install-mac.sh` builds the pages, copies the server into `~/Library/Application Support/JEE Sprint/app`,
starts it as a LaunchAgent, and builds and installs `JEE Sprint.app` into `~/Applications`. A re-install never
touches your progress in `state.json`.

### Android app (Android SDK and JDK 21 needed)

```bash
npm install
npm run apk
```

The `apk` script builds the page and runs `cap sync android` and `./gradlew assembleDebug`. It sets `JAVA_HOME` to
Android Studio's bundled JDK on macOS; change that in `package.json` if yours lives elsewhere. In the app's Sync
section, enter the Mac's address and, for the shareable build, the pairing code.

The personal Android build bakes the build machine's network addresses, Bonjour name and sync key into the page, so
don't give that APK to anyone else. Use the shareable build instead.

### Shareable build

```bash
scripts/build-friend.sh
```

This builds a universal Mac app (Intel and Apple Silicon) and an APK with no baked-in key. The Mac app generates an
8-character pairing code on first run, and the phone pairs by typing the Mac's address and that code.
`mac/FRIEND-README.txt` is the install guide that goes with it.

## Security

- Sync is plain HTTP on your local network, protected only by the shared key, and the server listens on all
  interfaces. Don't expose it to the internet.
- The Android app allows cleartext traffic for that reason.
- The Google Calendar fetch only goes to `calendar.google.com`. It refuses redirects and checks the URL shape.
- Anyone with the private iCal address can read that calendar, so treat it like a password.

## What was and wasn't tested

`npm test` runs 102 tests: the state merge, iCal parsing (repeats, exceptions, time zones), day-plan building,
reminders, catch-up and both servers' API. 101 pass. The Swift server contract test is skipped until
`scripts/build-friend.sh` has produced the Mac app. For this release the page bundle was built and syntax-checked,
and the Node server's page opened in a browser with no console errors. The Android app, the Mac apps, the
LaunchAgent install and phone-to-Mac sync were not built or run.

## Credits and licence

MIT, see `LICENSE`. Third-party fonts and software are listed in `CREDITS.md`. Syllabus topics follow the public
NTA JEE Main syllabus.
