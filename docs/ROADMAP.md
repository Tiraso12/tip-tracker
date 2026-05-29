# Tip Tracker Roadmap

This file is the shared project memory for Tip Tracker improvements. It keeps version goals, decisions, and future plans outside of chat so each work session can pick up cleanly.

## Current Version

- Version: `v1.0.0`
- Branch: `main`
- Status: Released — deployed to Firebase Hosting (2026-05-16)
- Live: `https://tip-tracker-44de1.web.app`

## Version History

| Version | Name | Status | Summary |
| --- | --- | --- | --- |
| `v0.1.0` | Foundation | Complete | Clean baseline, protected payout math, safer auth/data flow, first engine tests |
| `v0.2.0` | Admin Workflow | Complete | Smaller admin modules, shift validation, safer saves, temp staff linking |
| `v0.3.0` | Employee Dashboard | Complete | Richer payout details, pay-period summaries, empty states, mobile layout |
| `v0.4.0` | User Management | Complete | Inactive account blocking, deactivate/reactivate flow, merge rules |
| `v0.5.0` | Admin Daily Workflow | Complete | One-screen shift workspace, live pool totals, two-step calculate/save |
| `v0.6.0` | Reports | Complete | Weekly/monthly/pay-period reports, aligned PDF exports, revenue accuracy |
| `v0.7.0` | UI Polish | Complete | Full Tailwind v4 migration, minimalist light theme, 9 UI primitives, 12 CSS modules deleted |
| `v0.8.0` | Engine & Polish | Complete | Contract shift engine fixes, DnD migration, accessibility audit, runner card redesign |
| `v1.0.0` | Stable Release | Released | Production-ready; all workflows tested, zero legacy CSS modules, deployed |
| `v1.1.0` | Security Hardening | Complete | Firestore rules tightened, self-elevation blocked, username race condition fixed |

## Guiding Principles

- Protect the working app while improving it.
- Keep payout math trustworthy before changing workflows.
- Prefer small, verifiable updates over broad rewrites.
- Keep user data and employee payout records private by default.
- Document decisions that affect restaurant rules or money calculations.

## Architecture Decisions

- **Username login:** kept alongside email login. Uses a public `usernames/{normalizedUsername}` mapping collection so Firestore user profiles stay private.
- **Inactive accounts:** denied and deactivated employees keep their username mapping reserved. Historical payout records stay tied to the same profile. Admins should reactivate rather than create new accounts.
- **Tip records:** read-only for employees; only admins write via shift saves.
- **Report permissions:** no extra guards beyond admin-role gating — PDF generation is client-side from already-loaded data.
- **Tailwind v4:** design tokens in `src/styles/tailwind.css` under `@theme`. No CSS Modules. No external UI library (no shadcn/ui, no Radix).
- **Bar allocations:** `barCTPAllocation` and `barGRTAllocation` only apply when `barTeam.members.length > 0`. Bartenders working as captains in a regular team are not in `barTeam` and must not trigger bar pool carve-outs.
- **Runner pay:** always deducts from Dining Room CTP. Negative CTP on pure contract shifts is expected and informational only.

## Known Limitations

- `captainOverrideCTP` (1% of regular sales) is carved out even when no captain is assigned, leaving a small stranded balance. Low priority — only affects shifts with regular sales and no captain role.
- ShiftSetup drag-and-drop has no touch support — mobile team assignment relies on the click-to-assign flow.
- No dark theme toggle (deferred indefinitely — light theme is the intended aesthetic).

## Future Ideas

These are candidates for future versions, not commitments.

### Engine
- Fix `captainOverrideCTP` stranded balance when no captain is assigned.
- Add engine test coverage for: no-captain shift, negative pool edge cases, missing employee warnings.
- Consider whether runner pay should fall back to GRT when CTP = 0 on contract shifts (deferred from v0.8.0 — current behavior is intentional).

### Admin Experience
- Previous-period comparison in reports (e.g., this week vs last week per employee).
- Export employee earnings summary as CSV in addition to PDF.
- Shift templates — pre-fill team assignments for recurring lineups.
- Notes field on shifts for manager comments (e.g., "buyout — no bar service").

### Employee Experience
- Push or email notification when a shift payout is saved.
- Year-to-date earnings summary on the employee dashboard.
- Previous-period trend indicators (up/down vs last pay period).

### Infrastructure
- Firebase backend functions for admin actions (delete Auth users, bulk exports) — currently limited to client-side SDK.
- Automated deployment via GitHub Actions on merge to `main`.
- Firestore emulator setup for local integration testing.
