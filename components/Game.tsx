'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import questionsData from '@/data/questions.json';
import {
  UserRecord,
  loginOrRegister,
  getCurrentUser,
  recordGameResult,
  getHighScores,
} from '@/lib/storage';
import { sfx } from '@/lib/sound';
import PlayScreen, { GameResult, Question } from './PlayScreen';
import { useHandTracking } from '@/lib/useHandTracking';

type Screen =
  | 'start'
  | 'auth'
  | 'menu'
  | 'howto'
  | 'highscores'
  | 'play'
  | 'complete';

function pickTenQuestions(): Question[] {
  const all = [...(questionsData as Question[])];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, 10);
}

// MediaPipe hand connections (pairs of landmark indices) — defined at module level for stable reference
const HAND_CONNECTIONS: readonly [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],        // thumb
  [0,5],[5,6],[6,7],[7,8],        // index
  [0,9],[9,10],[10,11],[11,12],   // middle
  [0,13],[13,14],[14,15],[15,16], // ring
  [0,17],[17,18],[18,19],[19,20], // pinky
  [5,9],[9,13],[13,17],           // palm knuckles
];

function CyberBg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-b from-[#050c1e]/60 via-[#030712]/70 to-[#000]/80" />
      <div className="absolute inset-0 cyber-grid opacity-25" />
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-cyan-500/20 rounded-full blur-[120px]" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-purple-500/20 rounded-full blur-[120px]" />
    </div>
  );
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative hud-frame-container rounded-3xl p-6 md:p-8 border-2 border-cyan-400/70 shadow-[0_0_50px_rgba(0,229,255,0.35)] backdrop-blur-xl ${className}`}
    >
      {/* Corner Bracket Flourishes */}
      <div className="hud-corner hud-corner-tl" />
      <div className="hud-corner hud-corner-tr" />
      <div className="hud-corner hud-corner-bl" />
      <div className="hud-corner hud-corner-br" />
      {children}
    </div>
  );
}

function NeonButton({
  children,
  onClick,
  variant = 'blue',
  className = '',
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'blue' | 'red' | 'ghost';
  className?: string;
  disabled?: boolean;
}) {
  const base =
    'w-full py-4 px-6 rounded-2xl font-black tracking-wider text-base md:text-lg transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 shadow-lg';
  const styles =
    variant === 'blue'
      ? 'hud-card border-2 border-cyan-400 text-cyan-300 hover:text-white hover:border-white shadow-[0_0_25px_rgba(0,229,255,0.5)] [&.hand-hover]:border-white [&.hand-hover]:shadow-[0_0_35px_#00e5ff] [&.hand-hover]:scale-105'
      : variant === 'red'
      ? 'hud-card border-2 border-rose-500 text-rose-300 hover:text-white hover:border-rose-300 shadow-[0_0_25px_rgba(255,23,68,0.5)] [&.hand-hover]:border-rose-200 [&.hand-hover]:shadow-[0_0_35px_#ff1744] [&.hand-hover]:scale-105'
      : 'hud-card border-2 border-cyan-500/40 text-white/90 hover:border-cyan-400 hover:text-white shadow-[0_0_15px_rgba(0,229,255,0.2)] [&.hand-hover]:border-cyan-300 [&.hand-hover]:scale-105';
  return (
    <button
      disabled={disabled}
      onClick={() => {
        sfx.click();
        onClick();
      }}
      className={`${base} ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export default function Game() {
  const [screen, setScreen] = useState<Screen>('start');
  const [user, setUser] = useState<UserRecord | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [currentQuestions, setCurrentQuestions] = useState<Question[]>([]);
  const [lastResult, setLastResult] = useState<GameResult | null>(null);

  const { videoRef, status, left, right, retry } = useHandTracking(true);

  const leftBatonSvgRef = useRef<SVGLineElement>(null);
  const rightBatonSvgRef = useRef<SVGLineElement>(null);
  const leftGlowRef = useRef<SVGLineElement>(null);
  const rightGlowRef = useRef<SVGLineElement>(null);
  const lastPinchedLeft = useRef(false);
  const lastPinchedRight = useRef(false);
  const lastThumbsDownLeft = useRef(false);
  const lastThumbsDownRight = useRef(false);
  const hoveredElementRef = useRef<HTMLElement | null>(null);
  const [gestureToast, setGestureToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Skeleton SVG refs
  const skeletonSvgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let raf: number;

    const updateBatonSvg = (
      lineRef: React.RefObject<SVGLineElement>,
      glowRef: React.RefObject<SVGLineElement>,
      hand: typeof left.current
    ) => {
      const line = lineRef.current;
      const glow = glowRef.current;
      if (!line || !glow) return;
      if (!hand.visible) {
        line.style.opacity = '0';
        glow.style.opacity = '0';
        return;
      }
      const w = window.innerWidth;
      const h = window.innerHeight;
      const x1 = hand.x * w;
      const y1 = hand.y * h;
      const x2 = hand.tipX * w;
      const y2 = hand.tipY * h;
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      glow.setAttribute('x1', String(x1));
      glow.setAttribute('y1', String(y1));
      glow.setAttribute('x2', String(x2));
      glow.setAttribute('y2', String(y2));
      line.style.opacity = hand.pinch ? '0.6' : '1';
      glow.style.opacity = hand.pinch ? '0.4' : '0.7';
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      updateBatonSvg(leftBatonSvgRef, leftGlowRef, left.current);
      updateBatonSvg(rightBatonSvgRef, rightGlowRef, right.current);

      // --- Draw hand skeleton ---
      const svg = skeletonSvgRef.current;
      if (svg) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        let html = '';

        const drawHand = (hand: typeof left.current, color: string) => {
          if (!hand.visible || hand.landmarks.length < 21) return;
          const lm = hand.landmarks;

          // Connection lines
          HAND_CONNECTIONS.forEach(([a, b]) => {
            const x1 = lm[a].x * w; const y1 = lm[a].y * h;
            const x2 = lm[b].x * w; const y2 = lm[b].y * h;
            html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="3" stroke-opacity="0.8" stroke-linecap="round"/>`;
          });

          // Joint dots
          lm.forEach((pt, i) => {
            const cx = pt.x * w; const cy = pt.y * h;
            const r = i === 0 ? 8 : (i === 4 || i === 8 ? 7 : 4.5);
            html += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" fill-opacity="0.9" stroke="#ffffff" stroke-width="1.5"/>`;
          });

          // Index Fingertip Pointer Target Ring (Index Tip Landmark 8)
          const indexTip = lm[8];
          if (indexTip) {
            const ix = indexTip.x * w; const iy = indexTip.y * h;
            html += `<circle cx="${ix}" cy="${iy}" r="14" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="4 2" />`;
            html += `<circle cx="${ix}" cy="${iy}" r="4" fill="#ffffff" />`;
          }

          // Pinch Action Dot & Pulse Ring
          if (hand.pinch) {
            const px = hand.pinchX * w; const py = hand.pinchY * h;
            html += `<circle cx="${px}" cy="${py}" r="22" fill="${color}" fill-opacity="0.5" filter="url(#glow-pinch)"/>`;
            html += `<circle cx="${px}" cy="${py}" r="10" fill="#ffffff" fill-opacity="1"/>`;
          }
        };

        drawHand(left.current, '#00e5ff');   // cyan = left hand
        drawHand(right.current, '#ff1744'); // red = right hand
        svg.innerHTML = `
          <defs>
            <filter id="glow-pinch" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="8" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          ${html}
        `;
      }

      // Clear previous hover state
      if (hoveredElementRef.current) {
        hoveredElementRef.current.classList.remove('hand-hover');
        hoveredElementRef.current = null;
      }

      const w = window.innerWidth;
      const h = window.innerHeight;

      // Detect Thumbs Down Gesture to GO BACK across all screens
      [
        { hand: left.current, lastThumbsDown: lastThumbsDownLeft },
        { hand: right.current, lastThumbsDown: lastThumbsDownRight },
      ].forEach(({ hand, lastThumbsDown }) => {
        if (hand.visible && hand.thumbsDown && !lastThumbsDown.current) {
          lastThumbsDown.current = true;
          sfx.click();
          setGestureToast('👎 Thumbs Down -> Going Back');
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          toastTimerRef.current = setTimeout(() => setGestureToast(null), 1800);
          window.dispatchEvent(new CustomEvent('exit-game'));
        } else if (!hand.visible || !hand.thumbsDown) {
          lastThumbsDown.current = false;
        }
      });

      // Touch-to-Click & Pinch-to-Click Button Interaction across ALL screens
      const allButtons = document.querySelectorAll('button:not([disabled])');
      [
        { hand: left.current, lastPinched: lastPinchedLeft },
        { hand: right.current, lastPinched: lastPinchedRight }
      ].forEach(({ hand, lastPinched }) => {
        if (!hand.visible) { lastPinched.current = false; return; }

        const points = [
          { px: hand.tipX * w, py: hand.tipY * h },
          { px: hand.pinchX * w, py: hand.pinchY * h },
        ];

        for (const pt of points) {
          allButtons.forEach((btnNode) => {
            const btn = btnNode as HTMLButtonElement;
            const rect = btn.getBoundingClientRect();
            if (
              pt.px >= rect.left - 8 &&
              pt.px <= rect.right + 8 &&
              pt.py >= rect.top - 8 &&
              pt.py <= rect.bottom + 8
            ) {
              btn.classList.add('hand-hover');
              hoveredElementRef.current = btn;
              // Click when hand pinches OR when fingertip touches the button
              if (hand.pinch && !lastPinched.current) {
                btn.click();
              }
            }
          });
        }

        lastPinched.current = hand.pinch;
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [left, right]);

  useEffect(() => {
    const existing = getCurrentUser();
    if (existing) setUser(existing);

    const handleHowto = () => setScreen('howto');
    const handleExit = () => setScreen(user ? 'menu' : 'start');
    window.addEventListener('open-howto', handleHowto);
    window.addEventListener('exit-game', handleExit);
    return () => {
      window.removeEventListener('open-howto', handleHowto);
      window.removeEventListener('exit-game', handleExit);
    };
  }, [user]);

  const handleAuth = useCallback(() => {
    const name = usernameInput.trim();
    if (name.length < 2) {
      setAuthError('Enter at least 2 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_ ]+$/.test(name)) {
      setAuthError('Letters, numbers, spaces, underscores only.');
      return;
    }
    const rec = loginOrRegister(name);
    setUser(rec);
    setAuthError('');
    setScreen('menu');
  }, [usernameInput]);

  const startGame = useCallback(() => {
    setCurrentQuestions(pickTenQuestions());
    setScreen('play');
  }, []);

  const onGameComplete = useCallback(
    (result: GameResult) => {
      setLastResult(result);
      if (user) {
        const updated = recordGameResult(user.username, result.score);
        setUser(updated);
      }
      sfx.complete();
      setScreen('complete');
    },
    [user]
  );

  const highScores = useMemo(() => (screen === 'highscores' ? getHighScores(10) : []), [screen]);

  return (
    <main className="relative w-full h-full">
      {/* Floating Gesture Toast Banner */}
      {gestureToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[300] glossy-card border-2 border-rose-400 text-rose-200 text-sm md:text-base font-extrabold px-6 py-2.5 rounded-full shadow-[0_0_30px_rgba(255,23,68,0.6)] animate-bounce flex items-center gap-2 pointer-events-none">
          <span>👎</span>
          <span>{gestureToast}</span>
        </div>
      )}

      {/* Global Camera Feed Background */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${screen === 'play' ? 'opacity-95' : 'opacity-70'}`}
        style={{ transform: 'scaleX(-1)' }}
      />
      {screen !== 'play' && <CyberBg />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/40 pointer-events-none" />

      {/* Global Status Overlays */}
      {status === 'permission-denied' && (
        <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/90">
          <div className="text-center px-6">
            <p className="text-2xl font-bold text-neonred mb-2">Camera Access Denied</p>
            <p className="text-white/70">Please allow camera permission in your browser settings and reload.</p>
          </div>
        </div>
      )}
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/80">
          <p className="text-xl text-neonblue animate-pulseGlow">Initializing hand tracking...</p>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/90">
          <div className="text-center px-6 max-w-sm">
            <p className="text-xl text-neonred mb-6 font-bold">Failed to load hand tracking. Check your connection.</p>
            <NeonButton onClick={retry}>RETRY</NeonButton>
          </div>
        </div>
      )}

      {/* Hand Skeleton SVG — always visible, updated imperatively in rAF loop */}
      <svg
        ref={skeletonSvgRef}
        className="fixed inset-0 w-full h-full z-[99] pointer-events-none"
        style={{ left: 0, top: 0 }}
      />

      {/* Global LED Baton SVG Overlay — only show during gameplay */}
      <svg
        className={`fixed inset-0 w-full h-full z-[100] pointer-events-none transition-opacity duration-500 ${screen === 'play' ? 'opacity-100' : 'opacity-0'}`}
        style={{ left: 0, top: 0 }}
      >
        <defs>
          <filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* Left hand = Blue baton */}
        <line ref={leftGlowRef} strokeWidth="32" stroke="#00e5ff" strokeLinecap="round"
          opacity="0" filter="url(#glow-blue)" x1="0" y1="0" x2="0" y2="0" />
        <line ref={leftBatonSvgRef} strokeWidth="10" stroke="#e0f8ff" strokeLinecap="round"
          opacity="0" x1="0" y1="0" x2="0" y2="0" />
        {/* Right hand = Red baton */}
        <line ref={rightGlowRef} strokeWidth="32" stroke="#ff1744" strokeLinecap="round"
          opacity="0" filter="url(#glow-red)" x1="0" y1="0" x2="0" y2="0" />
        <line ref={rightBatonSvgRef} strokeWidth="10" stroke="#ffcdd2" strokeLinecap="round"
          opacity="0" x1="0" y1="0" x2="0" y2="0" />
      </svg>

      {screen === 'start' && (
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-6">
          <h1 className="text-5xl md:text-7xl font-black text-center mb-2">
            <span className="text-glow-red">HAND</span>{' '}
            <span className="text-glow-blue">SLASH</span>
          </h1>
          <p className="text-2xl md:text-3xl font-bold text-white/80 tracking-[0.3em] mb-6">QUIZ</p>
          <Panel className="p-8 max-w-md w-full text-center flex flex-col gap-4">
            <p className="text-cyan-100/90 text-sm font-semibold mb-2">
              Slash correct answers with your LED baton before time runs out. Touch or pinch buttons to start!
            </p>
            <NeonButton
              variant="blue"
              disabled={status !== 'ready'}
              onClick={() => {
                if (!user) {
                  const rec = loginOrRegister('Player 1');
                  setUser(rec);
                }
                startGame();
              }}
            >
              <span>▶ START GAME</span>
            </NeonButton>
            <div className="grid grid-cols-2 gap-3">
              <NeonButton variant="ghost" onClick={() => setScreen('howto')}>
                🎮 HOW TO PLAY
              </NeonButton>
              <NeonButton variant="ghost" onClick={() => setScreen('highscores')}>
                🏆 SCORES
              </NeonButton>
            </div>
          </Panel>
          <p className="text-white/50 text-xs font-bold mt-6">Requires camera access &amp; hand tracking</p>
        </div>
      )}

      {screen === 'auth' && (
        <div className="relative z-10 w-full h-full flex items-center justify-center px-6">
          <Panel className="p-8 max-w-sm w-full">
            <h2 className="text-2xl font-black text-glow-blue text-center mb-6">PLAYER LOGIN</h2>
            <input
              autoFocus
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
              placeholder="Enter username"
              className="w-full mb-2 px-4 py-3 rounded-xl bg-white/5 border-2 border-white/20 focus:border-neonblue outline-none text-white placeholder-white/30"
              maxLength={20}
            />
            {authError && <p className="text-neonred text-xs mb-3">{authError}</p>}
            <p className="text-white/40 text-xs mb-6">New name? We'll auto-register you. Existing name loads your stats.</p>
            <NeonButton onClick={handleAuth}>ENTER</NeonButton>
          </Panel>
        </div>
      )}

      {screen === 'menu' && user && (
        <div className="relative z-10 w-full h-full flex items-center justify-center px-6">
          <Panel className="p-8 max-w-md w-full">
            <p className="text-center text-white/50 text-sm mb-1">Welcome back,</p>
            <h2 className="text-center text-2xl font-black text-glow-purple mb-4">{user.username}</h2>
            <div className="flex justify-between mb-6 text-sm">
              <div className="text-center flex-1">
                <p className="text-white/40">Best Score</p>
                <p className="text-neonblue font-bold text-xl">{user.bestScore}</p>
              </div>
              <div className="text-center flex-1">
                <p className="text-white/40">Games Played</p>
                <p className="text-neonred font-bold text-xl">{user.gamesPlayed}</p>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <NeonButton variant="blue" onClick={startGame}>
                ▶ START PLAYING
              </NeonButton>
              <div className="grid grid-cols-2 gap-3">
                <NeonButton variant="ghost" onClick={() => setScreen('howto')}>🎮 HOW TO PLAY</NeonButton>
                <NeonButton variant="ghost" onClick={() => setScreen('highscores')}>🏆 HIGH SCORES</NeonButton>
              </div>
              <NeonButton variant="red" onClick={() => setScreen('start')}>✕ QUIT</NeonButton>
            </div>
          </Panel>
        </div>
      )}

      {screen === 'howto' && (
        <div className="relative z-10 w-full h-full flex items-center justify-center p-3 md:p-6 overflow-y-auto">
          <div className="hud-frame-container max-w-4xl w-full p-6 md:p-8 my-auto relative overflow-hidden">
            
            {/* Glowing Corner Flourish Brackets */}
            <div className="hud-corner hud-corner-tl" />
            <div className="hud-corner hud-corner-tr" />
            <div className="hud-corner hud-corner-bl" />
            <div className="hud-corner hud-corner-br" />

            {/* Glowing Top Frame Nodes */}
            <div className="absolute top-3 left-10 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_#00e5ff]" />
            <div className="absolute top-3 right-10 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_#00e5ff]" />

            {/* Header Title with Gamepad Controller Icon matching reference image */}
            <div className="flex items-center justify-center gap-3 mb-2">
              {/* Gamepad Controller SVG Icon */}
              <div className="w-10 h-10 md:w-12 md:h-12 text-cyan-300 flex items-center justify-center filter drop-shadow-[0_0_12px_#00e5ff]">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
                  <path d="M7 6h10a5 5 0 0 1 4.9 6.01l-1.15 6A4 4 0 0 1 16.82 21h-.64a3 3 0 0 1-2.92-2.31l-.26-1.19a1 1 0 0 0-.98-.8h-2.04a1 1 0 0 0-.98.8l-.26 1.19A3 3 0 0 1 5.82 21h-.64a4 4 0 0 1-3.93-2.99l-1.15-6A5 5 0 0 1 5 6h2zm1 4H6v2H4v2h2v2h2v-2h2v-2H8v-2zm9.5 1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-3 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" />
                </svg>
              </div>
              <h2 className="text-3xl md:text-5xl font-black text-white tracking-wider uppercase drop-shadow-[0_0_15px_rgba(0,229,255,0.8)]">
                HOW TO PLAY
              </h2>
            </div>

            {/* Subheader with Accent Lines & Dots matching reference image */}
            <div className="flex items-center justify-center gap-3 mb-8 px-4">
              <div className="flex-1 max-w-[120px] md:max-w-[200px] h-[1.5px] bg-cyan-400/60 relative flex items-center justify-end">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#00e5ff]" />
              </div>
              <p className="text-cyan-100/90 text-xs md:text-sm font-semibold tracking-wide text-center">
                Master the hand controls and <span className="font-extrabold text-white">slash</span> your way to the highest score!
              </p>
              <div className="flex-1 max-w-[120px] md:max-w-[200px] h-[1.5px] bg-cyan-400/60 relative flex items-center justify-start">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#00e5ff]" />
              </div>
            </div>
            
            {/* 2x2 Step Cards Grid matching reference image */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 mb-8 text-left">
              
              {/* Card 1: Camera Setup */}
              <div className="hud-card p-5 flex items-start gap-4">
                <div className="w-9 h-9 rounded-full bg-cyan-500/20 border border-cyan-400 text-cyan-300 font-extrabold flex items-center justify-center text-lg shrink-0 shadow-[0_0_10px_#00e5ff]">
                  1
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    {/* Webcam Icon */}
                    <div className="w-7 h-7 text-cyan-400 filter drop-shadow-[0_0_6px_#00e5ff]">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
                        <circle cx="12" cy="10" r="8" />
                        <circle cx="12" cy="10" r="3" />
                        <path d="M12 18v4M8 22h8" />
                      </svg>
                    </div>
                    <h3 className="font-bold text-white text-base md:text-lg">Camera Setup</h3>
                  </div>
                  <p className="text-white/75 text-xs md:text-sm leading-relaxed">
                    Make sure your webcam is turned on and keep both hands fully visible in front of the camera.
                  </p>
                </div>
              </div>

              {/* Card 2: Dual LED Batons */}
              <div className="hud-card p-5 flex items-start gap-4">
                <div className="w-9 h-9 rounded-full bg-rose-500/20 border border-rose-400 text-rose-300 font-extrabold flex items-center justify-center text-lg shrink-0 shadow-[0_0_10px_#ff1744]">
                  2
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    {/* Dual Red & Blue LED Batons Graphic */}
                    <div className="flex items-center gap-1.5 h-7">
                      <span className="w-2 h-7 bg-rose-500 rounded-full shadow-[0_0_10px_#ff1744] transform -rotate-12 border border-white/60" />
                      <span className="w-2 h-7 bg-cyan-400 rounded-full shadow-[0_0_10px_#00e5ff] transform rotate-12 border border-white/60" />
                    </div>
                    <h3 className="font-bold text-white text-base md:text-lg">Dual LED Batons</h3>
                  </div>
                  <p className="text-white/75 text-xs md:text-sm leading-relaxed">
                    Your <span className="text-rose-400 font-bold">Right Hand</span> controls the Red Baton and <span className="text-white font-bold">Left Hand</span> controls the <span className="text-cyan-400 font-bold">Blue Baton</span>.
                  </p>
                </div>
              </div>

              {/* Card 3: Pinch to Click & Slide */}
              <div className="hud-card p-5 flex items-start gap-4">
                <div className="w-9 h-9 rounded-full bg-purple-500/20 border border-purple-400 text-purple-300 font-extrabold flex items-center justify-center text-lg shrink-0 shadow-[0_0_10px_#a855f7]">
                  3
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    {/* Hand Pinch Line Art Icon */}
                    <div className="w-7 h-7 text-cyan-300 filter drop-shadow-[0_0_6px_#00e5ff]">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
                        <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
                        <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6" />
                        <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
                        <path d="M18 8a2 2 0 0 1 2 2v4a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-1.5" />
                        <circle cx="10" cy="4" r="1.5" fill="currentColor" />
                      </svg>
                    </div>
                    <h3 className="font-bold text-white text-base md:text-lg">Pinch to Click &amp; Slide</h3>
                  </div>
                  <p className="text-white/75 text-xs md:text-sm leading-relaxed">
                    Bring your <span className="text-amber-300 font-bold">Thumb &amp; Index finger</span> together to pinch to click. Show <span className="text-rose-300 font-bold">Thumbs Down 👎</span> gesture anytime to go back!
                  </p>
                </div>
              </div>

              {/* Card 4: Read & Slash Options */}
              <div className="hud-card p-5 flex items-start gap-4">
                <div className="w-9 h-9 rounded-full bg-teal-500/20 border border-teal-400 text-teal-300 font-extrabold flex items-center justify-center text-lg shrink-0 shadow-[0_0_10px_#14b8a6]">
                  4
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    {/* Sliced Bubble Graphic Icon */}
                    <div className="w-7 h-7 text-cyan-300 filter drop-shadow-[0_0_6px_#00e5ff] relative">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
                        <circle cx="12" cy="12" r="9" />
                        <line x1="4" y1="20" x2="20" y2="4" strokeWidth="2.5" />
                      </svg>
                    </div>
                    <h3 className="font-bold text-white text-base md:text-lg">Read &amp; Slash Options</h3>
                  </div>
                  <p className="text-white/75 text-xs md:text-sm leading-relaxed">
                    Read the question first! Once options spawn, slash the correct bubble into two pieces before time runs out (+1 score).
                  </p>
                </div>
              </div>

            </div>

            {/* Bottom Pill CTA Action Button matching reference image */}
            <div className="flex justify-center">
              <button
                onClick={() => {
                  sfx.click();
                  if (!user) {
                    const rec = loginOrRegister('Player 1');
                    setUser(rec);
                  }
                  startGame();
                }}
                className="bg-slate-950/80 hover:bg-cyan-950/80 border-2 border-cyan-400 text-white rounded-full px-8 py-3.5 shadow-[0_0_25px_rgba(0,229,255,0.5)] font-bold text-base md:text-lg tracking-wider flex items-center gap-3 transition-all active:scale-95 cursor-pointer group"
              >
                {/* White Play Circle */}
                <div className="w-7 h-7 rounded-full bg-white text-slate-950 flex items-center justify-center text-xs font-black group-hover:scale-110 transition-transform shadow-md">
                  ▶
                </div>
                <span className="font-extrabold uppercase">GOT IT! START GAME</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {screen === 'highscores' && (
        <div className="relative z-10 w-full h-full flex items-center justify-center px-6">
          <Panel className="p-8 max-w-md w-full">
            <h2 className="text-2xl font-black text-glow-red mb-4 text-center">🏆 HIGH SCORES</h2>
            <div className="max-h-72 overflow-y-auto mb-6 space-y-2 pointer-events-auto">
              {highScores.length === 0 && <p className="text-white/40 text-center">No scores yet. Be the first!</p>}
              {highScores.map((u, i) => (
                <div
                  key={u.username}
                  className="flex justify-between items-center px-4 py-2 rounded-lg bg-white/5 border border-white/10"
                >
                  <span className="font-bold text-white/80">
                    {i + 1}. {u.username}
                  </span>
                  <span className="text-neonblue font-black">{u.bestScore}</span>
                </div>
              ))}
            </div>
            <NeonButton onClick={() => setScreen(user ? 'menu' : 'start')}>BACK</NeonButton>
          </Panel>
        </div>
      )}

      {screen === 'play' && (
        <PlayScreen questions={currentQuestions} onComplete={onGameComplete} left={left} right={right} />
      )}

      {screen === 'complete' && lastResult && (
        <div className="relative z-10 w-full h-full flex items-center justify-center px-6">
          <Panel className="p-8 max-w-md w-full text-center">
            <h2 className="text-3xl font-black text-glow-purple mb-6">GAME COMPLETE</h2>
            <p className="text-5xl font-black text-neonblue mb-6">{lastResult.score}</p>
            <div className="grid grid-cols-2 gap-3 mb-6 text-sm">
              <div className="bg-white/5 rounded-xl py-3">
                <p className="text-white/40">Correct</p>
                <p className="text-green-400 font-bold text-lg">{lastResult.correct}</p>
              </div>
              <div className="bg-white/5 rounded-xl py-3">
                <p className="text-white/40">Wrong</p>
                <p className="text-neonred font-bold text-lg">{lastResult.wrong}</p>
              </div>
              <div className="bg-white/5 rounded-xl py-3">
                <p className="text-white/40">Total Time</p>
                <p className="font-bold text-lg">{(lastResult.totalTimeMs / 1000).toFixed(1)}s</p>
              </div>
              <div className="bg-white/5 rounded-xl py-3">
                <p className="text-white/40">Best Score</p>
                <p className="text-neonblue font-bold text-lg">{user?.bestScore ?? 0}</p>
              </div>
            </div>
            <p className="text-white/40 text-xs mb-6">Games Played: {user?.gamesPlayed ?? 0}</p>
            <div className="flex flex-col gap-3">
              <NeonButton onClick={startGame}>🔁 PLAY AGAIN</NeonButton>
              <NeonButton variant="ghost" onClick={() => setScreen('menu')}>🏠 MAIN MENU</NeonButton>
            </div>
          </Panel>
        </div>
      )}
    </main>
  );
}
