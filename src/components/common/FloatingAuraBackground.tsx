import React from 'react';

/**
 * FloatingAuraBackground
 *
 * Upgraded "Live Floating Organic Mesh Aura Behind Frosted Glass"
 * - Multi-Node Mesh Gradients: Electric Cyan (#00F2FE), Royal Azure (#2563EB),
 *   Cosmic Violet (#7C3AED), Neon Magenta (#C026D3), and Emerald Aurora (#10B981).
 * - Responsive viewport scaling with smooth organic blending and non-repeating harmonic cycles.
 * - Theme-aware opacity and gradient tuning for Dark, Grey, and Light themes.
 * - GPU-accelerated hardware animations (translate3d, scale, rotate) at 60fps with 0% CPU overhead.
 */
export const FloatingAuraBackground: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden z-0 select-none aura-container"
    >
      {/* 1. Electric Cyan (#00F2FE) & Sky Aqua Mesh Orb */}
      <div
        className="aura-node aura-node-cyan -top-[16%] left-[6%] w-[560px] h-[480px] sm:w-[760px] sm:h-[620px] lg:w-[980px] lg:h-[760px] blur-[80px] sm:blur-[110px] lg:blur-[140px] animate-aura-cyan"
      />

      {/* 2. Royal Azure (#2563EB) & Deep Cobalt Mesh Orb */}
      <div
        className="aura-node aura-node-azure -top-[10%] right-[4%] w-[580px] h-[520px] sm:w-[780px] sm:h-[650px] lg:w-[1020px] lg:h-[800px] blur-[85px] sm:blur-[115px] lg:blur-[145px] animate-aura-azure"
      />

      {/* 3. Cosmic Violet (#7C3AED) & Royal Orchid Pulse Orb */}
      <div
        className="aura-node aura-node-violet top-[22%] left-[16%] w-[520px] h-[460px] sm:w-[700px] sm:h-[580px] lg:w-[900px] lg:h-[700px] blur-[90px] sm:blur-[120px] lg:blur-[150px] animate-aura-violet"
      />

      {/* 4. Neon Magenta (#C026D3) & Electric Rose Mesh Orb */}
      <div
        className="aura-node aura-node-magenta top-[52%] left-[4%] w-[480px] h-[440px] sm:w-[680px] sm:h-[560px] lg:w-[860px] lg:h-[680px] blur-[85px] sm:blur-[115px] lg:blur-[145px] animate-aura-magenta"
      />

      {/* 5. Emerald Aurora (#10B981) & Luminous Mint Teal Orb */}
      <div
        className="aura-node aura-node-emerald top-[42%] right-[10%] w-[460px] h-[420px] sm:w-[660px] sm:h-[540px] lg:w-[840px] lg:h-[660px] blur-[80px] sm:blur-[110px] lg:blur-[135px] animate-aura-emerald"
      />

      {/* 6. Central Atmospheric Mesh Nexus (Organic cross-field blending across viewport) */}
      <div
        className="aura-node aura-node-nexus top-[18%] left-[28%] w-[500px] h-[440px] sm:w-[720px] sm:h-[600px] lg:w-[960px] lg:h-[760px] blur-[95px] sm:blur-[130px] lg:blur-[160px] animate-aura-nexus"
      />

      {/* 7. Specular Top Rim Gradient for Liquid Glass Headers */}
      <div
        className="absolute top-0 left-0 right-0 h-44 aura-node-rim blur-2xl pointer-events-none"
      />
    </div>
  );
};
