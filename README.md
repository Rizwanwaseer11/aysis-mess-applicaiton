# Aysis Mess Scanner

Expo SDK 57 / React Native application in TypeScript. **Scanner only**: connect the
registered device, scan an employee QR, show their thumbnail, confirm or reject serving.
There are no employee, shift, site or administrator management screens here. Those
belong to the separate React/Vite web panel.

## Setup

Use Node.js 24:

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd start
```

Set `EXPO_PUBLIC_API_URL` to the backend origin reachable from the tablet. On a physical
device, localhost refers to that device; use the development computer's LAN IP.
Production requires HTTPS. The value is public configuration, never a password.
The web admin registers a device and issues its eight-digit, 15-minute activation code.
Enter that code in Expo; employees do not log in and the scanner cannot choose its site.

## Serving flow

1. Activate with a persistent installation UUID; store the credential in SecureStore.
2. Scan by camera or a USB/Bluetooth HID reader that submits Enter.
3. Request `/scanner/previews`; the backend checks site, card, allowed meal and site time.
4. Fetch the private thumbnail. Confirmation remains disabled until the photo loads.
5. Compare the person and photo. Confirm records the meal; rejection/cancel does not.
6. Persist and retry the exact operation after uncertain responses; never approve offline.

`App.tsx` contains scanner presentation/lifecycle; `src/lib/api.ts` handles requests and
secure persisted operations; `src/theme.ts` shares prototype slate/indigo styles.
The database owns eligibility, official time and one-serving uniqueness.

## Checks and limitations

```powershell
npm.cmd run typecheck
npm.cmd run build:android
```

Type checking and Android JavaScript/Hermes export pass. Export produces `dist`, not
a signed APK. Real tablet camera/HID, secure storage, device revocation, restart/network
recovery, operator readability and sound/display settings still require acceptance.
There is no native hardware test result or production deployment yet.

An explicit `xcode → uuid@11.1.1` override addresses the transitive UUID advisory while
preserving the tooling's CommonJS v4 usage. Identifier generation was checked and npm
audit reports zero known vulnerabilities with the current lockfile. Revisit the override
when Expo/xcode updates. It is build tooling; runtime UUIDs use expo-crypto.

Independent manifest, lockfile, configuration and CI; no sibling source imports.
No Git initialization, remote, commit or push has been performed.

## Folder checkpoint � 2026-09-13

Active source belongs in this folder's root and `src/`. Older backend staging
copies and client-only helpers now live in `.work/legacy-backend-staging.zip` (17 files verified before archiving).
They are historical archives; do not edit from them or execute their old scripts.
The original prototype remains in its reference folder. Both clients ignore `.work/`.
Admin screenshots/PDF now live in `aysis-mess-admin/.work/acceptance/`.
The latest admin build, lint, four tests and real-API browser acceptance pass.
Delivery order remains admin first, then scanner. Scanner hardware acceptance is open.
See backend `docs/FOLDER-STRUCTURE.md` and `docs/CURRENT-STATUS.md` for the resume record.

## Scanner update � September 13, 2026

USB and Bluetooth keyboard/HID QR readers use one manufacturer-independent adapter.
Configure unchanged QR output plus Enter; proprietary/serial modes need an adapter.
Use **Enter employee ID manually** for a printed ID such as EMP-000001. Manual input
requires the same eligibility checks, loaded private thumbnail and keeper confirmation.

Redux Toolkit keeps one bootstrap and ten unique recent items; credentials and QR
payloads stay out of Redux. Expo Image uses cachePolicy=none; photos are fetched on
request and are not accumulated on disk. One secure pending action is retained for
uncertain requests. Daily records shows site/tablet totals by meal and date with one
50-row page in memory. Share meal summary opens the native share sheet without
including employee identities or automatically sending to anyone.

Run npm.cmd test, npm.cmd run typecheck and npm.cmd run build:android. Nine tests,
typecheck, Android/iOS JavaScript exports and Expo compatibility checks pass. Backend
migration 004 has been applied locally and the backend suite has 33 passing tests.
The source uses Expo SDK 57.0.22 and its compatible dependencies, including TypeScript 6.

Set EXPO_PUBLIC_API_URL in .env to the backend address reachable from the tablet
(e.g. http://192.168.1.10:4000 for development; HTTPS required in release). Run
npm.cmd start, register this tablet under its site in Admin Devices, and enter the
eight-digit activation code. A physical tablet must not use localhost for the server.

All native HID/Bluetooth, pairing/recovery, camera, memory, latency and release security
acceptance still need a physical pilot. JavaScript exports are not signed APK/IPA files.
Read backend docs/SCANNER-ACCEPTANCE.md for the pilot checklist and
backend docs/SCANNER-STRATEGY.md for the cited research and cache decision.
