# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. You don't need to show me code edits visually in the terminal. 

## Project Overview

**Rota Manager** is a single-page web application for managing medical staff rotas (schedules) at RFH Plastic Surgery. It handles consultant, registrar, and SHO scheduling across theatre sessions, clinics, and on-call shifts.

## Running the App

```bash
python3 -m http.server 8000
# Then open http://localhost:8000
```

Or use the provided helper scripts:
- `./.serve` — bash script wrapper
- `./Start Rota.command` — macOS launcher

There is no build step, no package manager, no test suite, and no linter. The entire application is a single `index.html` with embedded CSS and JavaScript.

## Data Files

All master data lives in `Data/`:

| File | Purpose |
|---|---|
| `Data/roster.json` | Consultants, registrars (with `pairedConsultantIds`), SHOs |
| `Data/schedule.json` | `week1`/`week2` templates — `listsByDay` and `clinicsByDay` |
| `Data/oncall.json` | Date-keyed oncall assignments (`wardReg`, `wardSho`, `oncallRegId`, `oncallConsultant`, `daySho`, `nightSho`) |
| `Data/leave.json` | Date-keyed leave (`regs`, `shos`, `notes`) |
| `Data/Weeks/WC_26.[M].[D].json` | One file per week — stores `manualEdits` overlay; written via GitHub API, not git |
| `Data/data.csv` | Legacy master roster — kept as fallback during transition; can be deleted once JSON path is confirmed stable |

`Data/Weeks/` is in `.gitignore`. Weekly files are written by the app via GitHub API and never appear in local git state.

## Architecture

The app is entirely self-contained in `index.html`. Key architectural layers:

### Data Flow

```
Data/roster.json + schedule.json + oncall.json + leave.json
    ↓ loadDataFromJSON (parallel fetch, builds inverse pairingsMap)
In-memory globals: people, pairings, scheduleFromMd, oncallCalendar, leaveCalendar
    ↓ buildDayAssignments
Auto-generated weekly schedule
    ↓ apply manualEdits overlay
    ↓ renderWeek
HTML table
    ↓ user drag-drop / edit
manualEdits object → localStorage + GitHub API (Data/Weeks/WC_26.M.D.json)

Sidebar edits (leave, oncall, roster, schedule)
    ↓ saveLeaveToGitHub / saveOncallToGitHub / saveRosterToGitHub / saveScheduleToGitHub
    → Data/*.json updated in GitHub via API
```

### Key Functions (all in `index.html`)

| Function | Line | Purpose |
|---|---|---|
| `loadDataFromJSON` | ~541 | Fetches all 4 JSON files in parallel; builds inverse `pairingsMap` from `pairedConsultantIds`; strips `pairedConsultantIds` before returning |
| `loadDataFromCSV` | ~421 | Legacy CSV loader — fallback if `roster.json` doesn't exist |
| `buildDayAssignments` | ~703 | Core scheduling algorithm — allocates registrars/SHOs to sessions based on pairings and leave |
| `renderWeek` | ~1199 | Renders the 7-day table; drag-drop wiring lives here |
| `saveToGitHub` | ~1011 | Debounced (1500ms) GitHub API push for weekly `WC_*.json` files |
| `saveFileToGitHub` | ~1043 | Shared helper — SHA-fetch + 409-retry — used by all 4 data-file save functions |
| `saveRosterToGitHub` | ~1072 | Debounced (1500ms) save of `roster.json`; reconstructs `pairedConsultantIds` from in-memory `pairings` |
| `saveScheduleToGitHub` | ~1089 | Debounced save of `schedule.json` |
| `saveOncallToGitHub` | ~1096 | Debounced save of `oncall.json` |
| `saveLeaveToGitHub` | ~1103 | Debounced save of `leave.json` |
| `dateKey` | ~631 | Returns `YYYY-MM-DD` using **local** date (not UTC) — important for BST correctness |
| `getDayContext` | ~676 | Returns week pattern, theatre type, and on-call info for a given date |
| `getLeaveSetForDate` | ~688 | Returns leave set for a date; rebuilds `ids` from `regs`+`shos` if absent |

### Pairings Model

Pairings are stored on the **registrar** in `roster.json` as `pairedConsultantIds: ["MA", ...]`. At load time, `loadDataFromJSON` inverts this into `pairingsMap[consultantId] → [regIds]` which is what `buildDayAssignments` uses. The `pairedConsultantIds` field is stripped from the registrar objects exposed to the rest of the app.

When `saveRosterToGitHub` writes back to `roster.json`, it reconstructs `pairedConsultantIds` from the in-memory `pairings` map.

### Manual Edits System

`manualEdits` is an overlay on top of auto-generated schedules stored in the weekly JSON file:
- `addedSessions` — user-created sessions
- `removedIndices` — base sessions to hide
- `regOverrides` — drag-drop swaps (keyed by date+field)

### Persistence

- **Static data JSON files**: `Data/roster.json`, `schedule.json`, `oncall.json`, `leave.json` — committed to GitHub, updated via API when editors save
- **Weekly JSON files**: `Data/Weeks/WC_26.[M].[D].json` — one per week, written via GitHub API with `[skip ci]`; in `.gitignore`
- **localStorage**: keyed as `rota-week-YYYY-MM-DD`, fast local cache for weekly files
- **GitHub API**: `GITHUB_CONFIG` at the top of `index.html` contains the PAT token, repo, and branch

### Load Sequence

`load()` HEAD-probes for `roster.json`. If it exists, `loadDataFromJSON()` is used; otherwise it falls back to `loadDataFromCSV()`. This allows safe CSV → JSON transition.

### Schedule Logic

- Weeks alternate between two patterns (`week1`/`week2`) relative to `REF_MONDAY` (2026-02-23)
- `DSU1_DAYS` (Mon/Wed/Fri) have different theatre configurations than `DSU2_DAYS`
- Consultant–registrar pairings drive auto-assignment in `buildDayAssignments`
- Leave entries block that person from auto-assignment for the relevant dates

### Migration Artifacts (pending cleanup)

The following can be removed once JSON loading is confirmed stable in production:
- `migrateCSVtoJSON()` function and the hidden `#migrateBtn` button (shown via `?migrate` URL param)
- CSV fallback branch in `load()`
- `parseCSV()`, `loadDataFromCSV()`
- `Data/data.csv`
- `migrate.py` (one-time local migration script)
