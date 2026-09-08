# Hand Slash Quiz 🔴🔵

A playable, futuristic Beat-Saber-style hand-gesture quiz game. Slash the correct
glowing answer bubble with your virtual LED baton — right hand = red, left hand = blue —
before it reaches you.

Built with **Next.js 14 (App Router) + React + TypeScript + Tailwind CSS + MediaPipe Hands**.

## Features implemented

- Start → Auth (auto-register / login) → Main Menu → How To Play / High Scores → Play → Game Complete flow
- Username persistence, best score, and games-played tracking via `localStorage`
- Real webcam hand tracking (MediaPipe Hands, loaded from CDN at runtime) detecting both hands,
  with right hand mapped to a red baton and left hand to a blue baton
- 3-2-1-GO countdown before each match
- 10 unique random questions per game pulled from `data/questions.json` (no repeats in a game)
- Beat-Saber-style flying answer bubbles (grow + move toward the player) with a per-question timer bar
- Real-time collision detection between baton (index fingertip) and bubbles
- Slash flash / particle "explode" effect + synthesized hit/correct/wrong sound effects (Web Audio,
  no external audio files needed)
- Score handling: correct +1, wrong −1, locks the question once answered so it can't be double-counted
- Game Complete screen with final score, correct/wrong counts, total time, best score, games played,
  Play Again / Main Menu actions
- Fully responsive, dark neon cyberpunk visual design with live camera feed background

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000, allow camera access, and play. Best experienced in a well-lit
room with both hands visible to the webcam.

## Deploying to Vercel

Push this folder to a GitHub repo and import it in Vercel (framework preset: Next.js),
or run:

```bash
npm i -g vercel
vercel
```

No environment variables or backend are required — MediaPipe is loaded client-side from a
CDN and all game/user data lives in the browser's `localStorage`.

## Editing questions

Add/edit entries in `data/questions.json`. Each question needs exactly two `options` and an
`answer` that matches one of them exactly. Keep at least 10 questions in the bank so a full
game can always be assembled without repeats.

## Project structure

```
app/                 Next.js App Router pages & global styles
components/Game.tsx  Screen orchestrator (start/auth/menu/howto/highscores/complete)
components/PlayScreen.tsx  Camera, hand tracking, bubbles, collisions, HUD
lib/useHandTracking.ts    MediaPipe Hands loader + tracking hook
lib/storage.ts       localStorage-backed user/score persistence
lib/sound.ts          Web Audio synthesized sound effects
data/questions.json  Question bank
```

## Notes & known limitations

- Requires a browser with webcam + WebAudio support (modern Chrome/Edge/Firefox/Safari).
- MediaPipe scripts are fetched from `cdn.jsdelivr.net` at runtime — make sure that domain
  isn't blocked by your network/firewall.
- Hand tracking accuracy depends on lighting and camera quality; `modelComplexity: 0` is
  used for speed. Increase it in `lib/useHandTracking.ts` if you need more accuracy and have
  headroom on lower-end devices.
