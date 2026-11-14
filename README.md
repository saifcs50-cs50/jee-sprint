# JEE Sprint

A 12-week JEE Main 2027 study planner and tracker. One web page does the work. A small Mac wrapper and an Android (Capacitor) wrapper put it on a laptop and a phone, and the two sync with each other over your home Wi-Fi. There is no account and no cloud service.

The plan is written for the October 2026 to January 2027 cycle (syllabus finish on 20 December 2026, Session 1 from 22 January 2027). The dates are constants in `src/plan-data.mjs`; they are tentative and should be checked against NTA's official calendar. Using it for another year means editing that file.

## What it does

- **Plan:** 59 chapters scheduled week by week over 17 weeks (12 for the syllabus, then a second pass and sharpening), each tagged by how often it is asked. Tap a chapter to move it through not started, learning, done and revised, or skip it.
- **Pace line and catch-up:** counts chapters carried over from weeks that have ended, says how far behind you are, and suggests what to do (finish them on Sunday, do them the short way, or skip the least-asked one).
- **Timetables:** a college day, a Sunday or day off, a mock Sunday and a revision-phase college day, with a live "now / next" line.
- **Days off:** mark days with no college. They run the Sunday timetable and the Android reminders follow.
- **Google Calendar link (optional):** paste the calendar's private iCal address on the Mac. The Mac server reads it every 10 minutes and uses it to build today's and tomorrow's study blocks around the real class hours, and to mark days off (events named like "Holiday", and a weekday with no classes). You can filter out other students' classes by batch or keyword. The address is kept only in the Mac's `config.json` (file mode 600) and is never sent back to a client.
- **Test log:** log part tests, chapter tests and full mocks with a custom marking scheme, compare them in percent on one chart, and see which kind of lost marks ("leaks") costs the most.
- **Sync:** progress merges per chapter, test and day by last-changed time; deletes win over older copies. The Mac keeps `state.json` plus a daily backup for 21 days.
- **Reminders (Android):** a notification when each study block starts, scheduled 14 days ahead.

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

Needs Node.js. It was developed and tested on Node 25; the server and the tests have no npm dependencies.

```bash
npm test
```

Build the pages and run the sync server on your own machine (a throwaway data folder keeps your real data out of it):

```bash
export JEE_SPRINT_HOME=/tmp/jee-sprint-data
node build.mjs
node server.mjs --public dist/mac --port 5199
```

Then open <http://127.0.0.1:5199/>. The first run creates `config.json` in the data folder with a random sync key. Only requests from the machine itself get the key inside the page; other devices on the network get a page that cannot sync until you pair them. `node server.mjs` also accepts `--home`, `--ics-file <path>` (read the calendar from a local file, for example `tests/fixtures/college-week.ics`) and `--today YYYY-MM-DD`.

### Mac app (macOS 13+, Xcode command line tools)

```bash
npm run install:mac
```

`scripts/install-mac.sh` builds the pages, copies the server into `~/Library/Application Support/JEE Sprint/app`, starts it as a LaunchAgent, and builds and installs `JEE Sprint.app` into `~/Applications`. Progress in `state.json` is never touched by a re-install.

### Android app (Android SDK and JDK 21 needed)

```bash
npm install
npm run apk
```

The `apk` script builds the page, runs `cap sync android` and `./gradlew assembleDebug`. It sets `JAVA_HOME` to Android Studio's bundled JDK on macOS; change it in `package.json` if yours lives elsewhere. In the app's Sync section, enter the Mac's address and, for the shareable build, the pairing code.

The personal Android build bakes the build machine's network addresses, Bonjour name and sync key into the page. Do not hand that APK to anyone else. For a build you can share, use the shareable variant below.

### Shareable build

```bash
scripts/build-friend.sh
```

Builds a universal Mac app (Intel and Apple Silicon) and an APK with no baked-in key. The Mac app generates an 8-character pairing code on first run; the phone pairs by typing the Mac's address and that code (`mac/FRIEND-README.txt` is the install guide that goes with it).

## Security notes

- Sync is **plain HTTP** on your local network, protected only by the shared key. The server listens on all interfaces. Do not expose it to the internet.
- The Android app allows cleartext traffic for that reason.
- The Google Calendar fetch only goes to `calendar.google.com`; redirects are refused and the URL shape is checked.
- Anyone who has the private iCal address can read that calendar, so treat it like a password.

## What was and was not tested

`npm test` runs 102 tests: the state merge, iCal parsing (repeats, exceptions, time zones), day-plan building, reminders, catch-up and both servers' API. 101 pass and 1 is skipped: the Swift server contract test only runs after `scripts/build-friend.sh` has produced the Mac app. The page bundle was built and syntax-checked, and the Node server was started and its page opened in a browser with no console errors. The Android app, the Mac apps, the LaunchAgent install and phone-to-Mac sync were **not** built or run for this release.

## Credits and licence

MIT, see `LICENSE`. Third-party fonts and software are listed in `CREDITS.md`. Syllabus topics follow the public NTA JEE Main syllabus.
