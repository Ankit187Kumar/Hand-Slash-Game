'use client';

import { useEffect, useRef, useState } from 'react';

export interface HandPoint {
  x: number;    // baton BASE x (wrist), 0..1 normalized, mirrored
  y: number;    // baton BASE y (wrist), 0..1 normalized
  tipX: number; // baton TIP x (beyond fingertip), 0..1 normalized, mirrored
  tipY: number; // baton TIP y (beyond fingertip), 0..1 normalized
  visible: boolean;
  pinch: boolean;
  thumbsDown: boolean;
  pinchX: number; // midpoint of thumb+index tip X (for pinch dot)
  pinchY: number; // midpoint of thumb+index tip Y
  landmarks: { x: number; y: number }[]; // raw 21 landmarks (mirrored)
}

const SCRIPT_URLS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',
  'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js',
];

// EMA alpha: higher = more responsive, lower = smoother
const EMA_ALPHA = 0.45;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

type TrackingStatus = 'idle' | 'loading' | 'permission-denied' | 'ready' | 'error';

const DEFAULT_HAND = (): HandPoint => ({
  x: 0.5, y: 0.8, tipX: 0.5, tipY: 0.5, visible: false, pinch: false, thumbsDown: false,
  pinchX: 0.5, pinchY: 0.5, landmarks: [],
});

const MAX_AUTO_RETRIES = 4;
const AUTO_RETRY_DELAY_MS = 2000;

export function useHandTracking(active: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<TrackingStatus>('idle');
  const [retryCount, setRetryCount] = useState(0);
  const autoRetryCountRef = useRef(0);
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Smoothed hand positions (what we expose)
  const left = useRef<HandPoint>(DEFAULT_HAND());
  const right = useRef<HandPoint>(DEFAULT_HAND());

  // Raw positions from MediaPipe (before EMA)
  const leftRaw = useRef<HandPoint>(DEFAULT_HAND());
  const rightRaw = useRef<HandPoint>(DEFAULT_HAND());

  const handsRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const stoppedRef = useRef(false);
  const smoothRafRef = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    stoppedRef.current = false;
    let cancelled = false;

    // EMA smoothing loop — runs independently of hand tracking callbacks
    function smoothLoop() {
      smoothRafRef.current = requestAnimationFrame(smoothLoop);

      const smoothHand = (
        smooth: React.MutableRefObject<HandPoint>,
        raw: React.MutableRefObject<HandPoint>
      ) => {
        if (!raw.current.visible) {
          smooth.current = { ...smooth.current, visible: false, pinch: false, thumbsDown: false };
          return;
        }
        smooth.current = {
          x:      lerp(smooth.current.x,    raw.current.x,    EMA_ALPHA),
          y:      lerp(smooth.current.y,    raw.current.y,    EMA_ALPHA),
          tipX:   lerp(smooth.current.tipX, raw.current.tipX, EMA_ALPHA),
          tipY:   lerp(smooth.current.tipY, raw.current.tipY, EMA_ALPHA),
          visible: true,
          pinch:  raw.current.pinch,
          thumbsDown: raw.current.thumbsDown,
          pinchX: lerp(smooth.current.pinchX, raw.current.pinchX, EMA_ALPHA),
          pinchY: lerp(smooth.current.pinchY, raw.current.pinchY, EMA_ALPHA),
          landmarks: raw.current.landmarks,
        };
      };

      smoothHand(left, leftRaw);
      smoothHand(right, rightRaw);
    }
    smoothRafRef.current = requestAnimationFrame(smoothLoop);

    async function setup() {
      setStatus('loading');
      try {
        await Promise.all(SCRIPT_URLS.map(loadScript));
        if (cancelled) return;

        const HandsCtor = (window as any).Hands;
        const CameraCtor = (window as any).Camera;
        if (!HandsCtor || !CameraCtor) throw new Error('MediaPipe failed to initialize');

        const hands = new HandsCtor({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });
        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.6,
        });

        hands.onResults((results: any) => {
          // Reset visibility
          leftRaw.current.visible = false;
          rightRaw.current.visible = false;

          if (results.multiHandLandmarks && results.multiHandedness) {
            results.multiHandLandmarks.forEach((landmarks: any, i: number) => {
              const label = results.multiHandedness[i].label; // Camera perspective
              // Flip: MediaPipe "Left" in un-mirrored = player's Right in mirrored view
              const playerHand = label === 'Left' ? 'right' : 'left';
              const target = playerHand === 'right' ? rightRaw : leftRaw;

              // Key landmarks (all in 0..1, un-mirrored)
              const wrist = landmarks[0];
              const thumbMcp = landmarks[2];
              const thumbTip = landmarks[4];
              const indexMcp = landmarks[5];
              const indexTip = landmarks[8];
              const middleTip = landmarks[12];
              const ringTip = landmarks[16];
              const pinkyTip = landmarks[20];

              // Base of LED Saber = index/middle knuckle area
              const baseRawX = (indexMcp.x + landmarks[9].x) / 2;
              const baseRawY = (indexMcp.y + landmarks[9].y) / 2;

              // Vector direction from wrist through index fingertip
              const dx = indexTip.x - wrist.x;
              const dy = indexTip.y - wrist.y;
              const len = Math.sqrt(dx * dx + dy * dy) || 1;
              const ux = dx / len;
              const uy = dy / len;

              // Saber blade extends 0.28 normalized screen distance forward from knuckle base
              const saberLength = 0.28;
              const tipRawX = baseRawX + ux * saberLength;
              const tipRawY = baseRawY + uy * saberLength;

              // Pinch: thumb-to-index distance
              const pdx = indexTip.x - thumbTip.x;
              const pdy = indexTip.y - thumbTip.y;
              const pinch = Math.sqrt(pdx * pdx + pdy * pdy) < 0.085;
              const pinchMidX = (indexTip.x + thumbTip.x) / 2;
              const pinchMidY = (indexTip.y + thumbTip.y) / 2;

              // Thumbs Down gesture: Thumb pointing downwards (larger Y in screen space) relative to wrist/MCP
              const thumbPointingDown = thumbTip.y > wrist.y + 0.06 && thumbTip.y > thumbMcp.y + 0.03;
              // Other fingers (index, middle, ring, pinky) are curled above the thumb tip (smaller Y in screen space)
              const fingersCurledAboveThumb = indexTip.y < thumbTip.y && middleTip.y < thumbTip.y && ringTip.y < thumbTip.y && pinkyTip.y < thumbTip.y;
              const thumbsDown = thumbPointingDown && fingersCurledAboveThumb;

              // Mirror X for selfie-view
              const mirroredLandmarks = landmarks.map((lm: any) => ({ x: 1 - lm.x, y: lm.y }));
              target.current = {
                x:    1 - baseRawX,
                y:    baseRawY,
                tipX: 1 - tipRawX,
                tipY: tipRawY,
                visible: true,
                pinch,
                thumbsDown,
                pinchX: 1 - pinchMidX,
                pinchY: pinchMidY,
                landmarks: mirroredLandmarks,
              };
            });
          }
        });

        handsRef.current = hands;

        if (!videoRef.current) throw new Error('Video element not ready');
        const camera = new CameraCtor(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current && handsRef.current && !stoppedRef.current) {
              await handsRef.current.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480,
        });
        cameraRef.current = camera;
        await camera.start();
        if (!cancelled) setStatus('ready');
      } catch (err: any) {
        if (cancelled) return;
        if (err && (err.name === 'NotAllowedError' || /Permission/i.test(String(err)))) {
          setStatus('permission-denied');
        } else {
          console.error('[useHandTracking]', err);
          if (autoRetryCountRef.current < MAX_AUTO_RETRIES) {
            autoRetryCountRef.current += 1;
            console.log(`[useHandTracking] Auto-retry ${autoRetryCountRef.current}/${MAX_AUTO_RETRIES} in ${AUTO_RETRY_DELAY_MS}ms`);
            autoRetryTimerRef.current = setTimeout(() => {
              if (!cancelled) setRetryCount(c => c + 1);
            }, AUTO_RETRY_DELAY_MS);
          } else {
            setStatus('error');
          }
        }
      }
    }

    setup();

    return () => {
      cancelled = true;
      stoppedRef.current = true;
      cancelAnimationFrame(smoothRafRef.current);
      if (autoRetryTimerRef.current) clearTimeout(autoRetryTimerRef.current);
      try { cameraRef.current?.stop?.(); } catch {}
      try { handsRef.current?.close?.(); } catch {}
    };
  }, [active, retryCount]);

  const retry = () => {
    left.current = DEFAULT_HAND();
    right.current = DEFAULT_HAND();
    leftRaw.current = DEFAULT_HAND();
    rightRaw.current = DEFAULT_HAND();
    autoRetryCountRef.current = 0;
    setStatus('idle');
    setRetryCount(c => c + 1);
  };

  return { videoRef, status, left, right, retry };
}
