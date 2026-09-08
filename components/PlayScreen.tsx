'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { sfx } from '@/lib/sound';
import { HandPoint } from '@/lib/useHandTracking';

export interface Question {
  id: number;
  question: string;
  options: string[];
  answer: string;
}

export interface GameResult {
  score: number;
  correct: number;
  wrong: number;
  totalTimeMs: number;
}

interface BubbleState {
  key: string;
  text: string;
  isCorrect: boolean;
  startX: number; // 0..1
  sliced: boolean;
  sliceCorrectFx: boolean | null;
  sliceAngle?: number; // Dynamic hand slash angle in degrees
}

const QUESTION_DURATION_MS = 5200;
// Bubble radius in normalised coords (relative to screen width)
const BUBBLE_RADIUS = 0.08;

/**
 * Minimum distance from point (px, py) to line segment (ax,ay)→(bx,by).
 * All in the same coordinate space (normalised 0..1).
 */
function segDistSq(
  ax: number, ay: number,
  bx: number, by: number,
  px: number, py: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = px - ax; const ey = py - ay;
    return ex * ex + ey * ey;
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

export default function PlayScreen({
  questions,
  onComplete,
  left,
  right,
}: {
  questions: Question[];
  onComplete: (result: GameResult) => void;
  left: React.MutableRefObject<HandPoint>;
  right: React.MutableRefObject<HandPoint>;
}) {
  const [phase, setPhase] = useState<'countdown' | 'playing'>('countdown');
  const [countdown, setCountdown] = useState<number | 'GO' | null>(null);

  const [qPhase, setQPhase] = useState<'reading' | 'options'>('reading');
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [bubbles, setBubbles] = useState<BubbleState[]>([]);
  const [flash, setFlash] = useState<{ x: number; y: number; color: string; key: number } | null>(null);

  const areaRef = useRef<HTMLDivElement | null>(null);
  const bubbleElsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const answeredRef = useRef(false);
  const startTimeRef = useRef<number>(0);
  const questionStartRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const readingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scoreRef = useRef(0);
  const correctRef = useRef(0);
  const wrongRef = useRef(0);

  // Kick off countdown immediately since camera is ready
  useEffect(() => {
    if (phase === 'countdown') {
      let n = 3;
      setCountdown(n);
      sfx.countdown();
      const iv = setInterval(() => {
        n -= 1;
        if (n > 0) {
          setCountdown(n);
          sfx.countdown();
        } else if (n === 0) {
          setCountdown('GO');
          sfx.go();
        } else {
          clearInterval(iv);
          setCountdown(null);
          setPhase('playing');
          startTimeRef.current = performance.now();
        }
      }, 800);
      return () => clearInterval(iv);
    }
  }, [phase]);

  const spawnQuestion = useCallback((index: number) => {
    const q = questions[index];
    if (!q) return;
    answeredRef.current = false;
    setQPhase('reading');

    const correctFirst = Math.random() < 0.5;
    const opts = correctFirst ? q.options : [...q.options].reverse();
    const bubbleList: BubbleState[] = [
      {
        key: `${q.id}-a`,
        text: opts[0],
        isCorrect: opts[0] === q.answer,
        startX: 0.26,
        sliced: false,
        sliceCorrectFx: null,
      },
      {
        key: `${q.id}-b`,
        text: opts[1],
        isCorrect: opts[1] === q.answer,
        startX: 0.74,
        sliced: false,
        sliceCorrectFx: null,
      },
    ];
    setBubbles(bubbleList);

    // 1.8 second question reading timer before option bubbles float in
    if (readingTimerRef.current) clearTimeout(readingTimerRef.current);
    readingTimerRef.current = setTimeout(() => {
      setQPhase('options');
      questionStartRef.current = performance.now();
    }, 1800);
  }, [questions]);

  useEffect(() => {
    if (phase === 'playing') {
      spawnQuestion(qIndex);
    }
    return () => {
      if (readingTimerRef.current) clearTimeout(readingTimerRef.current);
    };
  }, [phase, qIndex, spawnQuestion]);

  const advance = useCallback(() => {
    if (qIndex + 1 >= questions.length) {
      const totalTimeMs = performance.now() - startTimeRef.current;
      onComplete({
        score: scoreRef.current,
        correct: correctRef.current,
        wrong: wrongRef.current,
        totalTimeMs,
      });
    } else {
      setQIndex((i) => i + 1);
    }
  }, [qIndex, questions.length, onComplete]);

  const handleSlice = useCallback(
    (bubble: BubbleState, screenX: number, screenY: number, angleDeg: number = -35) => {
      if (answeredRef.current || bubble.sliced) return;
      answeredRef.current = true;
      const isCorrect = bubble.isCorrect;
      setFlash({ x: screenX, y: screenY, color: isCorrect ? '#39ff88' : '#ff1744', key: Date.now() });
      setBubbles((prev) =>
        prev.map((b) =>
          b.key === bubble.key ? { ...b, sliced: true, sliceCorrectFx: isCorrect, sliceAngle: angleDeg } : b
        )
      );
      if (isCorrect) {
        sfx.correct();
        setScore((s) => {
          scoreRef.current = s + 1;
          return s + 1;
        });
        setCorrectCount((c) => {
          correctRef.current = c + 1;
          return c + 1;
        });
      } else {
        sfx.wrong();
        setScore((s) => {
          scoreRef.current = s - 1;
          return s - 1;
        });
        setWrongCount((c) => {
          wrongRef.current = c + 1;
          return c + 1;
        });
      }
      sfx.slash();
      setTimeout(() => {
        setFlash(null);
      }, 400);
      setTimeout(() => {
        advance();
      }, 700);
    },
    [advance]
  );

  // Main render/collision loop
  useEffect(() => {
    if (phase !== 'playing' || qPhase !== 'options') return;

    function loop() {
      rafRef.current = requestAnimationFrame(loop);
      const area = areaRef.current;
      if (!area) return;
      const rect = area.getBoundingClientRect();

      const lp = left.current;
      const rp = right.current;

      const elapsed = performance.now() - questionStartRef.current;
      const t = Math.min(1, elapsed / QUESTION_DURATION_MS);

      bubbles.forEach((b) => {
        const el = bubbleElsRef.current[b.key];
        if (!el || b.sliced) return;
        const y = 0.12 + t * 0.62; // move down
        const scale = 0.55 + t * 1.1; // grow (coming toward player)
        const x = b.startX;
        el.style.transform = `translate(${x * rect.width}px, ${y * rect.height}px) translate(-50%, -50%) scale(${scale})`;

        // Baton line-segment vs bubble collision
        [lp, rp].forEach((hp) => {
          if (!hp.visible || answeredRef.current) return;
          const distSq = segDistSq(hp.x, hp.y, hp.tipX, hp.tipY, x, y);
          if (distSq < BUBBLE_RADIUS * BUBBLE_RADIUS) {
            // Real-time hand slash angle calculation
            const dx = hp.tipX - hp.x;
            const dy = hp.tipY - hp.y;
            const angleRad = Math.atan2(dy, dx);
            const angleDeg = angleRad * (180 / Math.PI);
            handleSlice(b, x * rect.width, y * rect.height, angleDeg);
          }
        });
      });

      // Timeout -> auto wrong, move on
      if (t >= 1 && !answeredRef.current) {
        answeredRef.current = true;
        sfx.wrong();
        setScore((s) => {
          scoreRef.current = s - 1;
          return s - 1;
        });
        setWrongCount((c) => {
          wrongRef.current = c + 1;
          return c + 1;
        });
        setTimeout(() => advance(), 300);
      }
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, qPhase, bubbles, left, right, handleSlice, advance]);

  const secondsLeft = Math.max(0, Math.ceil((QUESTION_DURATION_MS - Math.min(QUESTION_DURATION_MS, performance.now() - questionStartRef.current)) / 1000));
  const timeFormatted = `00:${secondsLeft < 10 ? '0' : ''}${secondsLeft}`;
  const timeLeftPct = qPhase === 'reading' ? 100 : 100 - Math.min(100, ((performance.now() - questionStartRef.current) / QUESTION_DURATION_MS) * 100);

  return (
    <div className="relative w-full h-full overflow-hidden bg-transparent select-none">
      {/* Cyber Screen Edge Frame Overlay (Corner Brackets) */}
      <div className="absolute left-2 top-16 bottom-16 w-3 border-l-2 border-t-2 border-b-2 border-cyan-500/30 pointer-events-none rounded-l-lg" />
      <div className="absolute right-2 top-16 bottom-16 w-3 border-r-2 border-t-2 border-b-2 border-cyan-500/30 pointer-events-none rounded-r-lg" />

      {/* Main HUD Overlay */}
      {phase === 'playing' && (
        <div className="absolute inset-x-0 top-0 z-20 p-3 md:p-5 flex flex-col items-center gap-3">
          {/* Top 4 Header Cards Row */}
          <div className="w-full max-w-6xl flex items-center justify-between gap-2 md:gap-4">
            
            {/* Card 1: Question Number (Top-Left) */}
            <div className="glossy-card rounded-2xl px-4 py-2 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-cyan-500/20 border border-cyan-400 text-cyan-300 flex items-center justify-center font-black text-lg shadow-[0_0_12px_#00e5ff]">
                📖
              </div>
              <div>
                <div className="text-cyan-200/80 text-[10px] md:text-xs uppercase tracking-wider font-bold leading-none mb-0.5">
                  Question
                </div>
                <div className="leading-none">
                  <span className="text-xl md:text-2xl font-black text-cyan-300">{qIndex + 1}</span>
                  <span className="text-xs md:text-sm font-bold text-white/50">/{questions.length}</span>
                </div>
              </div>
            </div>

            {/* Card 2: Trophy Score (Center-Left) */}
            <div className="glossy-card border-purple-500/80 shadow-[0_0_25px_rgba(168,85,247,0.5)] rounded-2xl px-5 py-2 flex items-center gap-3">
              <div className="absolute -left-1 top-2 bottom-2 w-1 bg-purple-500 rounded-full" />
              <div className="absolute -right-1 top-2 bottom-2 w-1 bg-pink-500 rounded-full" />
              
              <div className="text-2xl drop-shadow-[0_0_10px_rgba(234,179,8,0.8)]">🏆</div>
              <div>
                <div className="text-purple-200/80 text-[10px] md:text-xs uppercase tracking-wider font-bold leading-none mb-0.5">
                  SCORE
                </div>
                <div className="text-xl md:text-3xl font-black text-cyan-300 leading-none">
                  {score}
                </div>
              </div>
            </div>

            {/* Card 3: Time Left Countdown (Center-Right) */}
            <div className="glossy-card rounded-2xl px-4 py-2 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-cyan-500/20 border border-cyan-400 text-cyan-300 flex items-center justify-center font-black text-base shadow-[0_0_12px_#00e5ff]">
                🕒
              </div>
              <div>
                <div className="text-cyan-200/80 text-[10px] md:text-xs uppercase tracking-wider font-bold leading-none mb-0.5">
                  TIME LEFT
                </div>
                <div className="text-lg md:text-2xl font-black text-white tracking-wider leading-none">
                  {timeFormatted}
                </div>
              </div>
            </div>

            {/* Card 4: Live View & Stats (Top-Right) */}
            <div className="glossy-card border-cyan-400/80 rounded-2xl px-4 py-1.5 flex flex-col justify-center items-end">
              <div className="flex items-center gap-1.5 text-emerald-400 font-extrabold text-xs tracking-wider mb-0.5">
                <span>📹</span>
                <span>LIVE VIEW</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping inline-block" />
              </div>
              <div className="flex items-center gap-2 text-xs md:text-sm font-black leading-none">
                <span className="text-emerald-400">✓ {correctCount}</span>
                <span className="text-white/40">|</span>
                <span className="text-rose-500">✗ {wrongCount}</span>
              </div>
            </div>

          </div>

          {/* Full-Width Gradient Timer Progress Bar */}
          <div className="w-full max-w-6xl h-2.5 bg-slate-900/40 backdrop-blur-md border border-cyan-400/60 rounded-full overflow-hidden shadow-[0_0_18px_rgba(0,229,255,0.4)]">
            <div
              className={`h-full transition-all duration-100 ${
                qPhase === 'reading'
                  ? 'bg-gradient-to-r from-amber-400 to-yellow-300 animate-pulse'
                  : 'bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500'
              }`}
              style={{ width: `${timeLeftPct}%` }}
            />
          </div>

          {/* Question Banner Card with Category Badge */}
          <div className="w-full flex justify-center mt-1">
            <div className="hud-card max-w-3xl w-full px-8 py-5 rounded-3xl text-center shadow-[0_0_45px_rgba(0,229,255,0.45)] relative">
              {/* Corner Bracket Flourishes */}
              <div className="hud-corner hud-corner-tl" />
              <div className="hud-corner hud-corner-tr" />
              <div className="hud-corner hud-corner-bl" />
              <div className="hud-corner hud-corner-br" />
              
              {/* Category Badge Pill on Top Border */}
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-slate-900/70 backdrop-blur-md border-2 border-cyan-400 text-cyan-300 text-[11px] md:text-xs font-black px-4 py-0.5 rounded-full uppercase tracking-widest flex items-center gap-1.5 shadow-[0_0_15px_rgba(0,229,255,0.5)] z-10">
                <span>🌿</span>
                <span>SCIENCE</span>
              </div>

              {/* Background Decorative Watermarks */}
              <div className="absolute left-6 top-1/2 -translate-y-1/2 text-cyan-400/25 text-5xl pointer-events-none">
                🌿
              </div>
              <div className="absolute right-6 top-1/2 -translate-y-1/2 text-purple-400/25 text-5xl pointer-events-none">
                ⚛️
              </div>

              {qPhase === 'reading' && (
                <div className="mb-1 text-xs font-bold text-amber-300 tracking-widest uppercase flex items-center justify-center gap-2 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  📖 READ QUESTION... OPTIONS COMING!
                </div>
              )}

              <h2 className="text-xl md:text-3xl font-extrabold text-white text-glow-blue tracking-wide leading-snug px-6">
                {questions[qIndex]?.question}
              </h2>
            </div>
          </div>

        </div>
      )}

      {/* Play Area: 3D Glossy Sphere Option Bubbles */}
      <div ref={areaRef} className="absolute inset-0 z-10">
        {phase === 'playing' && qPhase === 'options' &&
          bubbles.map((b) => (
            <div
              key={b.key}
              ref={(el) => {
                bubbleElsRef.current[b.key] = el;
              }}
              className="absolute w-52 h-52 md:w-64 md:h-64 pointer-events-none"
              style={{ left: 0, top: 0 }}
            >
              {!b.sliced ? (
                // Unsliced 3D Glossy Glass Sphere Bubble
                <div className="glossy-orb w-full h-full rounded-full flex flex-col items-center justify-center p-6 text-center animate-floatIn">
                  {/* Left speech notch tip */}
                  <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-cyan-400 rotate-45 rounded-sm shadow-[0_0_10px_#00e5ff]" />
                  
                  <div className="text-2xl md:text-3xl mb-1 opacity-90 drop-shadow-[0_0_8px_#00e5ff]">🌿</div>
                  <div className="text-xl md:text-3xl font-black text-white text-glow-blue leading-tight tracking-wide">
                    {b.text}
                  </div>
                </div>
              ) : (
                // Dynamic Sliced Bubble along Hand Slash Direction
                (() => {
                  const angle = b.sliceAngle ?? -35;
                  const rad = (angle * Math.PI) / 180;
                  // Vector perpendicular to the cut line
                  const moveX = Math.sin(rad) * 90;
                  const moveY = -Math.cos(rad) * 90;
                  return (
                    <div className="relative w-full h-full">
                      {/* Dynamic Slash Blade Line */}
                      <div
                        className="slash-blade-line"
                        style={{ transform: `translateY(-50%) rotate(${angle}deg)` }}
                      />

                      {/* Piece 1 (Top / Half cut along angle) */}
                      <div
                        className="absolute inset-0 slice-piece-dynamic rounded-full flex flex-col items-center justify-center p-6 text-center shadow-2xl border-4"
                        style={{
                          background: b.sliceCorrectFx ? 'rgba(57, 255, 136, 0.45)' : 'rgba(255, 23, 68, 0.45)',
                          borderColor: b.sliceCorrectFx ? '#39ff88' : '#ff1744',
                          boxShadow: b.sliceCorrectFx ? '0 0 45px #39ff88' : '0 0 45px #ff1744',
                          clipPath: 'polygon(0 0, 100% 0, 100% 50%, 0 50%)',
                          ['--slice-angle' as any]: `${angle}deg`,
                          ['--slice-off-x' as any]: `${moveX}px`,
                          ['--slice-off-y' as any]: `${moveY}px`,
                        }}
                      >
                        <div className="text-xl md:text-3xl font-black text-white leading-tight">{b.text}</div>
                      </div>

                      {/* Piece 2 (Bottom / Reverse half cut along angle) */}
                      <div
                        className="absolute inset-0 slice-piece-dynamic rounded-full flex flex-col items-center justify-center p-6 text-center shadow-2xl border-4"
                        style={{
                          background: b.sliceCorrectFx ? 'rgba(57, 255, 136, 0.45)' : 'rgba(255, 23, 68, 0.45)',
                          borderColor: b.sliceCorrectFx ? '#39ff88' : '#ff1744',
                          boxShadow: b.sliceCorrectFx ? '0 0 45px #39ff88' : '0 0 45px #ff1744',
                          clipPath: 'polygon(0 50%, 100% 50%, 100% 100%, 0 100%)',
                          ['--slice-angle' as any]: `${angle}deg`,
                          ['--slice-off-x' as any]: `${-moveX}px`,
                          ['--slice-off-y' as any]: `${-moveY}px`,
                        }}
                      >
                        <div className="text-xl md:text-3xl font-black text-white leading-tight">{b.text}</div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          ))}

        {flash && (
          <div
            key={flash.key}
            className="slash-fx explode"
            style={{
              left: flash.x - 60,
              top: flash.y - 60,
              width: 120,
              height: 120,
              borderRadius: '9999px',
              background: `radial-gradient(circle, ${flash.color}cc, transparent 70%)`,
            }}
          />
        )}
      </div>

      {/* Countdown overlay */}
      {(phase === 'countdown' || countdown !== null) && countdown !== null && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70">
          <div className="text-8xl md:text-9xl font-black text-glow-blue animate-floatIn">
            {countdown === 'GO' ? 'GO!' : countdown}
          </div>
        </div>
      )}

      {/* Bottom Bar Controls: HELP button (Bottom-Left) & EXIT button (Bottom-Right) */}
      <div className="fixed bottom-4 left-4 right-4 z-20 flex justify-between items-center pointer-events-auto">
        
        {/* HELP Button (Bottom-Left) */}
        <button
          onClick={() => {
            sfx.click();
            window.dispatchEvent(new CustomEvent('open-howto'));
          }}
          className="glossy-card border-2 border-cyan-500/60 hover:border-cyan-300 rounded-2xl px-4 py-2 flex items-center gap-3 shadow-[0_0_20px_rgba(0,229,255,0.3)] transition-all active:scale-95 cursor-pointer text-left"
        >
          <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-400 text-cyan-300 flex items-center justify-center font-black text-base">
            ❓
          </div>
          <div>
            <div className="text-white font-extrabold text-xs md:text-sm leading-none mb-0.5">HELP</div>
            <div className="text-white/60 text-[10px] md:text-xs leading-none">Show how to play</div>
          </div>
        </button>

        {/* Legend (Center-Bottom) */}
        <div className="hidden md:flex gap-6 text-xs font-bold glossy-card px-5 py-2 rounded-full border border-white/20 backdrop-blur-md shadow-lg">
          <span className="text-neonred flex items-center gap-1.5">🔴 Right Hand</span>
          <span className="text-neonblue flex items-center gap-1.5">🔵 Left Hand</span>
          <span className="text-rose-300 flex items-center gap-1.5">👎 Thumbs Down = Back</span>
        </div>

        {/* EXIT Button (Bottom-Right) */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              sfx.click();
              window.dispatchEvent(new CustomEvent('open-howto'));
            }}
            className="glossy-card border-2 border-slate-700 hover:border-cyan-400 p-2.5 rounded-2xl text-white font-bold shadow-md transition-all active:scale-95 cursor-pointer"
            title="Settings / Help"
          >
            ⚙️
          </button>

          <button
            onClick={() => {
              sfx.click();
              window.dispatchEvent(new CustomEvent('exit-game'));
            }}
            className="glossy-card border-2 border-rose-500/80 hover:bg-rose-900/40 px-4 py-2.5 rounded-2xl text-rose-300 font-extrabold text-xs md:text-sm shadow-[0_0_15px_rgba(255,23,68,0.3)] transition-all active:scale-95 cursor-pointer flex items-center gap-2"
          >
            <span>🚪</span>
            <span>EXIT</span>
          </button>
        </div>

      </div>
    </div>
  );
}
