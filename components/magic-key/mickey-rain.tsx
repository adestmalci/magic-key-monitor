import type { CSSProperties } from "react";

type MickeyParticle = {
  left: string;
  size: number;
  delay: string;
  duration: string;
  opacity: number;
  rotateStart: string;
  rotateEnd: string;
  driftStart: string;
  driftEnd: string;
};

function createSeededRandom(seed: number) {
  let value = seed;

  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function buildParticles(count: number, seed: number, mobile = false): MickeyParticle[] {
  const random = createSeededRandom(seed);

  return Array.from({ length: count }, () => {
    const size = mobile ? 14 + random() * 12 : 18 + random() * 18;
    const opacity = mobile ? 0.08 + random() * 0.08 : 0.1 + random() * 0.11;
    const driftStart = `${(random() * 3 - 1.5).toFixed(2)}vw`;
    const driftEnd = `${(random() * 10 - 5).toFixed(2)}vw`;
    const rotateStart = `${Math.round(random() * 32 - 16)}deg`;
    const rotateEnd = `${Math.round(random() * 120 - 60)}deg`;

    return {
      left: `${(-4 + random() * 108).toFixed(2)}%`,
      size: Number(size.toFixed(1)),
      delay: `-${(random() * (mobile ? 14 : 20)).toFixed(1)}s`,
      duration: `${(mobile ? 18 : 16) + random() * (mobile ? 10 : 12)}s`,
      opacity: Number(opacity.toFixed(3)),
      rotateStart,
      rotateEnd,
      driftStart,
      driftEnd,
    };
  }).sort((a, b) => {
    const leftA = Number.parseFloat(a.left);
    const leftB = Number.parseFloat(b.left);
    if (Math.abs(leftA - leftB) < 4) {
      return indexBias(a, b);
    }
    return leftA - leftB;
  });
}

function indexBias(a: MickeyParticle, b: MickeyParticle) {
  return a.opacity - b.opacity;
}

const DESKTOP_PARTICLES = buildParticles(56, 314159, false);
const MOBILE_PARTICLES = buildParticles(28, 271828, true);

function particleStyle(particle: MickeyParticle): CSSProperties {
  return {
    left: particle.left,
    width: particle.size,
    height: particle.size,
    animationDelay: particle.delay,
    animationDuration: particle.duration,
    opacity: particle.opacity,
    backgroundImage: "url('/branding/mickey-icon.png')",
    ["--mickey-rotate-start" as string]: particle.rotateStart,
    ["--mickey-rotate-end" as string]: particle.rotateEnd,
    ["--mickey-drift-start" as string]: particle.driftStart,
    ["--mickey-drift-end" as string]: particle.driftEnd,
  };
}

export function MickeyRain() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {DESKTOP_PARTICLES.map((particle, index) => (
        <div
          key={`desktop-${index}`}
          className="mickey-fall hidden md:block"
          style={particleStyle(particle)}
        />
      ))}

      {MOBILE_PARTICLES.map((particle, index) => (
        <div
          key={`mobile-${index}`}
          className="mickey-fall md:hidden"
          style={particleStyle(particle)}
        />
      ))}
    </div>
  );
}
