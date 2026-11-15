# Qoder Daily Claim

**Automates Qoder's daily free-credit claim on Windows.**

Qoder gives individual users **100 Credits every day**, but you have to click a button in the app to
claim them. Miss the window and the credits are gone. This project does that click for you, once a
day, on a schedule.

[English](README.md) · [中文](docs/README.zh-CN.md) · [فارسی](docs/README.fa.md)

---

## What this is (and is not)

Qoder's own documentation says the daily reward **must be claimed manually** in the desktop app.
There is no public API for it. This project automates the same single manual claim you would
perform yourself — it does not farm extra credits, create accounts, or bypass any limit.

> Read the [official rules](https://docs.qoder.com/events/100credits) before using this.
> You are responsible for how you use it.

## How it works

Qoder is an Electron app, which gives us two legitimate handles:

1. **Its own IPC bridge.** The renderer exposes `window.qoderDesktop`, including
   `getCampaignStatus()`, which returns whether a claim is currently available.
2. **The campaign page.** The claim UI is a web page
   (`https://openapi.qoder.sh/growth-page/activity-iframe`) rendered as a `WebContentsView`.
   It appears as a CDP `iframe` target.

The script connects to Qoder's DevTools endpoint, asks the app whether anything is claimable,
opens the campaign surface, clicks the **"Claim 100 Credits Daily"** card's own button, and then
verifies the result. It runs inside the app's real logged-in session, so no tokens or cookies are
ever read, stored, or transmitted.

```
getCampaignStatus()  ──►  claimable?  ──no──►  exit 0 (nothing to do)
                              │yes
                              ▼
                     openCampaignSurface()
                              ▼
                     find daily card → click Claim
                              ▼
                     verify (status + page) → log
```

## Requirements

- **Windows 10/11** (the scheduler uses Windows Task Scheduler and PowerShell)
- **Node.js 18+** — [nodejs.org](https://nodejs.org) (`node --version` to check)
- **Qoder desktop app**, installed and signed in

## Install

```powershell
git clone https://github.com/<your-username>/qoder-daily-claim.git
cd qoder-daily-claim

# Register the daily scheduled task
powershell -ExecutionPolicy Bypass -File scripts/install-task.ps1
```

The installer computes the correct local time for you. Qoder's claim window opens at **10:00
Singapore time (UTC+8)**; the task is scheduled 15 minutes after that, in your own timezone.

Example output:

```
Computed local claim time: 06:45 (10:15 UTC+8 in your timezone)

Registered scheduled task: Qoder Daily Credit Claim
  Runs daily at 06:45 (local), retrying hourly for 4 hours.
```

## Usage

### Run it now

```powershell
# Claim now, then close Qoder
powershell -ExecutionPolicy Bypass -File scripts/run-claim.ps1

# Claim now, leave Qoder open
powershell -ExecutionPolicy Bypass -File scripts/run-claim.ps1 -KeepOpen
```

### Check the result

```powershell
Get-Content claim-log.txt -Tail 20
```

A successful run looks like:

```
[2026-11-16T02:45:12.331Z] --- run start ---
[2026-11-16T02:45:13.104Z] status: claimable=true url=https://openapi.qoder.sh/growth-page/activity-iframe
[2026-11-16T02:45:13.882Z] open surface: {"ok":true}
[2026-11-16T02:45:16.220Z] campaign frame: https://openapi.qoder.sh/growth-page/activity-iframe
[2026-11-16T02:45:18.004Z] click: {"clicked":true,"via":"daily-card","label":"claim"}
[2026-11-16T02:45:25.117Z] post-status: claimable=false
[2026-11-16T02:45:25.118Z] RESULT: claim succeeded
```

### Manage the task

```powershell
# Status and last result
Get-ScheduledTask -TaskName "Qoder Daily Credit Claim" | Get-ScheduledTaskInfo

# Run immediately
Start-ScheduledTask -TaskName "Qoder Daily Credit Claim"

# Change the time
powershell -ExecutionPolicy Bypass -File scripts/install-task.ps1 -Time "07:30"

# Remove it
powershell -ExecutionPolicy Bypass -File scripts/install-task.ps1 -Uninstall
```

## Configuration

| Flag | Default | Meaning |
|---|---|---|
| `-Port` | `9222` | Local DevTools port used to talk to Qoder |
| `-QoderPath` | auto-detected | Explicit path to `Qoder.exe` if auto-detection fails |
| `-KeepOpen` | off | Leave Qoder running after the claim |
| `-StartupWaitSec` | `40` | How long to wait for Qoder's DevTools endpoint |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Claimed successfully, **or** nothing was claimable (already claimed / no campaign) |
| `1` | Error, or the claim could not be confirmed |

## Important caveats

- **Qoder gets restarted.** The script needs Qoder started with `--remote-debugging-port=9222`.
  If Qoder is already running without it, the script restarts it. Qoder restores its session, but
  unsaved in-flight work is at risk — which is why the task runs early morning.
- **The debug port is local-only.** It binds to `127.0.0.1:9222`, not the network. While Qoder
  runs with it, any local process could drive the app. The script closes Qoder afterwards unless
  you pass `-KeepOpen`.
- **UI changes can break it.** The daily card is located by the text `Claim 100 Credits Daily`.
  If Qoder redesigns the page, update `FRAME_CLICK` in `src/qoder-claim.js`. The log will say
  `claim control not found` when that happens.
- **Verification is honest.** Success is only reported when the app's own status flips to
  `hasClaimableCampaign: false` or the page shows "Claimed". Otherwise the script exits `1` and
  says so.
- **No credentials are handled.** The script never reads, stores, or sends your tokens or cookies.
  It drives the already-signed-in app.

## Troubleshooting

**`Qoder renderer page not found`**
Qoder is not running with the debug port. Run through `scripts/run-claim.ps1` rather than calling
`node src/qoder-claim.js` directly.

**`campaign surface never rendered`**
The campaign page failed to load. Open Qoder, go to the Usage panel, and try the gift icon
manually once to confirm the page loads on your network.

**`claim control not found`**
Qoder changed its UI. Open an issue with the output of `claim-log.txt`.

**Task runs but nothing happens**
Check that the task's last result is `0` and read `run-log.txt`. If Qoder was mid-update, the
next hourly retry will pick it up.

## Project layout

```
qoder-daily-claim/
├── src/
│   ├── cdp.js           # Minimal Chrome DevTools Protocol client (zero dependencies)
│   └── qoder-claim.js   # Claim logic: status → open → click → verify
├── scripts/
│   ├── run-claim.ps1    # Launches Qoder with the debug port and runs the claim
│   └── install-task.ps1 # Registers/removes the daily scheduled task
├── docs/
│   ├── README.zh-CN.md  # 中文说明
│   └── README.fa.md     # راهنمای فارسی
├── package.json
├── LICENSE
└── README.md
```

## Contributing

Issues and pull requests are welcome, especially:
- selector updates when Qoder changes its UI,
- macOS/Linux support (the claim logic is cross-platform; only the scheduler is Windows-specific),
- better verification of the claim result.

Please keep the project's spirit: one honest claim per window, no automation of anything that
Qoder's rules prohibit.

## License

[MIT](LICENSE)

## Disclaimer

This is an unofficial community project. It is not affiliated with, endorsed by, or supported by
Qoder. Qoder's terms and campaign rules may change at any time; it is your responsibility to
ensure your use complies with them.
