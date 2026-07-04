/* Tiny dependency-free confetti burst, used when a balance hits zero (#8).
   Draws to a throwaway full-screen canvas and cleans itself up. Respects
   prefers-reduced-motion (does nothing). Brand colours only. */

const COLORS = ["#a754ff", "#d48cff", "#00e676", "#79c2ff", "#ffd166", "#ec489a"];

import { haptic } from "./haptics.js";

export function confettiBurst(x, y) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  haptic("success");

  const originX = x ?? window.innerWidth / 2;
  const originY = y ?? window.innerHeight / 2.4;

  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;";
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  document.body.appendChild(canvas);

  const N = 90;
  const parts = Array.from({ length: N }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 7;
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      size: 4 + Math.random() * 5,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 0,
    };
  });

  const GRAVITY = 0.18;
  const MAX_LIFE = 90;
  let raf;

  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of parts) {
      p.life += 1;
      if (p.life > MAX_LIFE) continue;
      alive = true;
      p.vy += GRAVITY;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      const alpha = Math.max(0, 1 - p.life / MAX_LIFE);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    if (alive) raf = requestAnimationFrame(frame);
    else {
      cancelAnimationFrame(raf);
      canvas.remove();
    }
  }
  raf = requestAnimationFrame(frame);
}
