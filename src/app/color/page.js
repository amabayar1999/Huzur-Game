"use client";

import { useEffect, useRef } from "react";

export default function Color() {
  const containerRef = useRef(null);
  const boxRefs = useRef([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const BOX_WIDTH = 96; // w-24
    const BOX_HEIGHT = 64; // h-16

    // Initialize positions and velocities
    const boxes = boxRefs.current.filter(Boolean);
    const positions = boxes.map(() => ({ x: 0, y: 0 }));
    const velocities = boxes.map(() => ({
      vx: (Math.random() > 0.5 ? 1 : -1) * (120 + Math.random() * 120), // px/s
      vy: (Math.random() > 0.5 ? 1 : -1) * (120 + Math.random() * 120),
    }));

    const getBounds = () => container.getBoundingClientRect();
    let { width: boundW, height: boundH } = getBounds();

    // Place boxes at random starting positions inside bounds
    positions.forEach((p) => {
      p.x = Math.random() * Math.max(1, boundW - BOX_WIDTH);
      p.y = Math.random() * Math.max(1, boundH - BOX_HEIGHT);
    });

    let rafId = 0;
    let lastTs = performance.now();

    const tick = (ts) => {
      const dt = Math.min(0.032, (ts - lastTs) / 1000); // clamp dt to avoid jumps
      lastTs = ts;

      // Update bounds in case layout changed
      const b = getBounds();
      boundW = b.width;
      boundH = b.height;

      // Integrate positions and bounce on edges
      for (let i = 0; i < boxes.length; i++) {
        const p = positions[i];
        const v = velocities[i];

        p.x += v.vx * dt;
        p.y += v.vy * dt;

        if (p.x <= 0) {
          p.x = 0;
          v.vx = Math.abs(v.vx);
        } else if (p.x + BOX_WIDTH >= boundW) {
          p.x = Math.max(0, boundW - BOX_WIDTH);
          v.vx = -Math.abs(v.vx);
        }

        if (p.y <= 0) {
          p.y = 0;
          v.vy = Math.abs(v.vy);
        } else if (p.y + BOX_HEIGHT >= boundH) {
          p.y = Math.max(0, boundH - BOX_HEIGHT);
          v.vy = -Math.abs(v.vy);
        }

        boxes[i].style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    const onResize = () => {
      const b = getBounds();
      boundW = b.width;
      boundH = b.height;
    };

    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const colors = [
    "bg-red-500",
    "bg-green-500",
    "bg-blue-500",
    "bg-yellow-400",
  ];

  return (
    <div className="font-sans min-h-screen p-8 pb-20 sm:p-20">
      <main className="flex flex-col gap-[32px] items-center sm:items-start">
        <h1 className="text-2xl font-bold">Color Page</h1>
        <p className="text-sm/6 text-center sm:text-left max-w-prose">
          Boxes bounce around the entire screen.
        </p>

        <div
          ref={containerRef}
          className="relative w-full min-h-[60vh] sm:min-h-[70vh] md:min-h-[75vh] lg:min-h-[80vh] xl:min-h-[85vh] 2xl:min-h-[90vh] overflow-hidden rounded-lg border border-black/[.08] dark:border-white/[.145] bg-background/40"
        >
          {colors.map((color, i) => (
            <div
              key={color}
              ref={(el) => {
                boxRefs.current[i] = el;
              }}
              className={`absolute h-16 w-24 rounded-md shadow-md ${color}`}
              style={{ transform: "translate3d(0,0,0)" }}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

