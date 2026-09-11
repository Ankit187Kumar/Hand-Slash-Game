# 🔴🔵 Hand Slash Quiz

A futuristic, interactive **Beat Saber-style hand-gesture quiz game** where players use their hands as virtual LED batons to slash the correct answer bubble before it reaches them.

🎮 **Live Demo:** https://hand-slash-quiz.vercel.app/

## 🚀 Overview

**Hand Slash Quiz** combines real-time hand tracking, gesture-based interaction, and quiz gameplay into an immersive browser experience.

Players use:

* 🔴 **Right hand** → Red virtual LED baton
* 🔵 **Left hand** → Blue virtual LED baton

Slash the correct glowing answer bubble using your index fingertip before the timer runs out.

## ✨ Features

* **Start → Authentication → Main Menu → Gameplay → Game Complete** flow
* Automatic user registration/login
* Username persistence using `localStorage`
* Best score and games-played tracking
* Real-time webcam hand tracking using **MediaPipe Hands**
* Simultaneous tracking of both hands
* Right-hand red baton and left-hand blue baton
* **3-2-1-GO** countdown before each match
* 10 unique random questions per game
* Questions loaded from `data/questions.json`
* No repeated questions within the same game
* Flying answer bubbles inspired by **Beat Saber**
* Glowing answer bubbles that grow and move toward the player
* Per-question countdown timer
* Real-time collision detection between the virtual baton and answer bubbles
* Slash flash and particle explosion effects
* Synthesized hit, correct, and wrong sound effects using **Web Audio API**
* No external audio files required
* Correct answer: **+1 point**
* Wrong answer: **−1 point**
* Question locks immediately after being answered to prevent double scoring
* Game Complete screen showing:

  * Final score
  * Correct answers
  * Wrong answers
  * Total game time
  * Best score
  * Games played
* **Play Again** and **Main Menu** options
* Fully responsive futuristic neon/cyberpunk interface
* Live camera feed displayed during gameplay

## 🛠️ Technology Stack

* **Next.js 14**
* **App Router**
* **React**
* **TypeScript**
* **Tailwind CSS**
* **MediaPipe Hands**
* **Web Audio API**
* **Browser localStorage**
* **Vercel**

## 🎮 How to Play

1. Open the game in a modern web browser.
2. Allow webcam access.
3. Complete the login/authentication step.
4. Start the game.
5. Watch the question and the two flying answer bubbles.
6. Use your hands as virtual LED batons.
7. Slash the correct answer before it reaches you.
8. Try to achieve the highest possible score.

For the best experience, play in a **well-lit environment** with both hands clearly visible to the webcam.

## 💻 Getting Started

Clone the project and install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

Allow camera access when prompted.

## ☁️ Deployment

The project is deployed using **Vercel**.

### Live Application

https://hand-slash-quiz.vercel.app/

To deploy your own version, push the project to GitHub and import the repository into Vercel with the **Next.js** framework preset.

You can also deploy using the Vercel CLI:

```bash
npm i -g vercel
vercel
```

No environment variables or backend services are required.

MediaPipe is loaded client-side from a CDN, while user and game statistics are stored locally in the browser.

## ❓ Editing Questions

Questions can be added or modified in:

```text
data/questions.json
```

Each question should contain exactly **two options** and an `answer` that exactly matches one of those options.

Example structure:

```json
{
  "question": "Which planet is known as the Red Planet?",
  "options": ["Mars", "Venus"],
  "answer": "Mars"
}
```

Keep at least **10 questions** in the question bank so that a complete game can be generated without repeating questions.

## 📁 Project Structure

```text
app/
  Next.js App Router pages and global styles

components/
  Game.tsx
    Main screen orchestrator
    Start / Auth / Menu / How To Play / High Scores / Complete

  PlayScreen.tsx
    Webcam
    Hand tracking
    Answer bubbles
    Collision detection
    Gameplay HUD

lib/
  useHandTracking.ts
    MediaPipe Hands loader and tracking hook

  storage.ts
    localStorage user and score management

  sound.ts
    Web Audio synthesized sound effects

data/
  questions.json
    Quiz question bank
```

## 🧠 Hand Tracking

MediaPipe Hands is loaded dynamically from a CDN at runtime.

The game detects both hands and maps them to different virtual batons:

| Hand       | Baton   |
| ---------- | ------- |
| Right Hand | 🔴 Red  |
| Left Hand  | 🔵 Blue |

The **index fingertip** is used as the primary collision point for interacting with answer bubbles.

## 🔊 Audio

The game uses the browser's **Web Audio API** to generate sound effects dynamically.

This means the project does not require external audio assets for:

* Hit effects
* Correct-answer sounds
* Wrong-answer sounds

## ⚠️ Known Limitations

* Requires webcam access.
* Requires WebAudio support.
* MediaPipe scripts are fetched from `cdn.jsdelivr.net` at runtime.
* Network/firewall restrictions may prevent MediaPipe from loading.
* Hand-tracking accuracy depends on lighting and camera quality.
* Both hands should remain visible to the webcam for the best experience.
* The current configuration uses `modelComplexity: 0` to prioritize performance.

If more accurate tracking is required and the device has sufficient performance, `modelComplexity` can be increased in:

```text
lib/useHandTracking.ts
```

## 🌐 Live Demo

### 🎮 Play Hand Slash Quiz

**https://hand-slash-quiz.vercel.app/**

A browser-based futuristic quiz experience powered by real-time hand tracking.
