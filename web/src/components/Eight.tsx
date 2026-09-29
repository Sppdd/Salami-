// Eight, the 811 receptionist. The glasses are an 8 on its side; the antennae are 1 and 1.
// Moods map to call states; the ID badge on the chest shows the same state as an icon.

export type EightMood = 'greet' | 'listen' | 'think' | 'confirmed' | 'handoff';

const INK = '#0B1F3A';
const BODY = '#1F5FD6';
const TEAL = '#14B8A6';
const BADGE = '#0E7490';

const labels: Record<EightMood, string> = {
  greet: 'waving hello',
  listen: 'listening',
  think: 'thinking',
  confirmed: 'showing a confirmed check',
  handoff: 'handing the call to a person',
};

/** An outlined limb: thick ink stroke with the body color on top. */
function Limb({ d }: { d: string }) {
  return (
    <>
      <path d={d} fill="none" stroke={INK} strokeWidth={18} strokeLinecap="round" />
      <path d={d} fill="none" stroke={BODY} strokeWidth={7} strokeLinecap="round" />
    </>
  );
}

export function Eight({
  mood = 'greet',
  size = 96,
  crop = 'full',
  className,
}: {
  mood?: EightMood;
  size?: number;
  crop?: 'full' | 'head';
  className?: string;
}) {
  const is = (...m: EightMood[]) => m.includes(mood);
  return (
    <svg
      viewBox={crop === 'head' ? '24 8 156 156' : '0 0 200 200'}
      width={size}
      height={size}
      role="img"
      aria-label={`Eight, the 811 receptionist, ${labels[mood]}`}
      className={className}
      style={{ overflow: 'visible' }}
    >
      <ellipse cx="86" cy="178" rx="14" ry="6.5" fill={INK} />
      <ellipse cx="122" cy="178" rx="14" ry="6.5" fill={INK} />
      {['M78 28 L88 20 L88 50', 'M110 28 L120 20 L120 50'].map((d) => (
        <g key={d}>
          <path d={d} fill="none" stroke={INK} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
          <path d={d} fill="none" stroke={TEAL} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
      <Limb d="M46 132 C32 140 28 156 34 166" />
      {is('listen', 'confirmed') && <Limb d="M158 132 C172 140 176 156 170 166" />}
      {is('greet') && (
        <>
          <Limb d="M158 126 C174 116 182 98 180 80" />
          <path d="M190 70 L198 62 M194 88 L202 86" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />
        </>
      )}
      {is('handoff') && <Limb d="M158 136 C170 134 180 130 188 124" />}

      <g fill={INK} stroke={INK} strokeWidth={16} strokeLinejoin="round">
        <path d="M58 150 L36 182 L84 164 Z" />
        <rect x="42" y="46" width="120" height="124" rx="46" />
      </g>
      <path d="M58 150 L36 182 L84 164 Z" fill={BODY} />
      <rect x="42" y="46" width="120" height="124" rx="46" fill={BODY} />
      <path d="M58 60 Q102 44 146 60" fill="none" stroke="#5B8DEF" strokeWidth={6} strokeLinecap="round" opacity={0.8} />

      <rect x="30" y="80" width="20" height="32" rx="10" fill={INK} />
      <rect x="36" y="87" width="8" height="18" rx="4" fill={TEAL} />
      <path d="M40 112 C40 128 50 134 64 132" fill="none" stroke={INK} strokeWidth={7} strokeLinecap="round" />
      <circle cx="69" cy="131" r="7" fill={TEAL} stroke={INK} strokeWidth={5} />

      <circle cx="83" cy="94" r="19" fill="#FFFFFF" stroke={INK} strokeWidth={7} />
      <circle cx="121" cy="94" r="19" fill="#FFFFFF" stroke={INK} strokeWidth={7} />
      <ellipse cx="72" cy="120" rx="6" ry="3.5" fill="#F9A8B8" opacity={0.8} />
      <ellipse cx="132" cy="120" rx="6" ry="3.5" fill="#F9A8B8" opacity={0.8} />

      {is('greet', 'listen', 'handoff') && (
        <>
          <ellipse cx="83" cy="95" rx="5" ry="7" fill={INK} />
          <ellipse cx="121" cy="95" rx="5" ry="7" fill={INK} />
          <circle cx="85" cy="92" r="2" fill="#FFFFFF" />
          <circle cx="123" cy="92" r="2" fill="#FFFFFF" />
        </>
      )}
      {is('confirmed') && (
        <path d="M76 97 Q83 88 90 97 M114 97 Q121 88 128 97" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
      )}
      {is('think') && (
        <>
          <ellipse cx="86" cy="90" rx="5" ry="6.5" fill={INK} />
          <ellipse cx="124" cy="90" rx="5" ry="6.5" fill={INK} />
          <circle cx="88" cy="87" r="2" fill="#FFFFFF" />
          <circle cx="126" cy="87" r="2" fill="#FFFFFF" />
        </>
      )}

      {is('greet', 'confirmed') && <path d="M92 118 Q102 131 112 118 Z" fill={INK} stroke={INK} strokeWidth={3} strokeLinejoin="round" />}
      {is('listen', 'handoff') && <path d="M93 120 Q102 127 111 120" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />}
      {is('think') && (
        <path d="M93 123 Q97.5 119 102 123 Q106.5 127 111 123" fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" />
      )}

      <rect x="95" y="134" width="14" height="9" rx="3" fill={TEAL} stroke={INK} strokeWidth={4} />
      <rect x="80" y="140" width="44" height="26" rx="7" fill="#FFFFFF" stroke={INK} strokeWidth={6} />
      {is('greet') && (
        <path d="M90 149 L90 157 M96 146 L96 160 M102 148 L102 158 M108 145 L108 161 M114 150 L114 156" fill="none" stroke={BADGE} strokeWidth={3.5} strokeLinecap="round" />
      )}
      {is('listen') && (
        <>
          <rect x="98" y="145" width="8" height="11" rx="4" fill={BADGE} />
          <path d="M93 152 Q93 160 102 160 Q111 160 111 152" fill="none" stroke={BADGE} strokeWidth={3.2} strokeLinecap="round" />
        </>
      )}
      {is('think') && [92, 102, 112].map((cx) => <circle key={cx} cx={cx} cy="153" r="3.4" fill={BADGE} />)}
      {is('confirmed') && (
        <path d="M92 153 L99 160 L113 146" fill="none" stroke={BADGE} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {is('handoff') && (
        <path d="M90 153 L113 153 M106 146 L114 153 L106 160" fill="none" stroke={BADGE} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      )}

      {is('think') && (
        <>
          <Limb d="M158 134 C152 124 144 118 136 116" />
          <circle cx="156" cy="30" r="5" fill="#FFFFFF" stroke={INK} strokeWidth={4} />
          <circle cx="172" cy="18" r="7.5" fill="#FFFFFF" stroke={INK} strokeWidth={4} />
        </>
      )}
      {is('confirmed') && (
        <path d="M28 34 L33 20 L38 34 L52 39 L38 44 L33 58 L28 44 L14 39 Z" fill={TEAL} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      )}
      {is('handoff') && (
        <>
          <circle cx="190" cy="110" r="15" fill={TEAL} stroke={INK} strokeWidth={6} />
          <path
            transform="translate(182.5 102.5) scale(0.62)"
            d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"
            fill="none"
            stroke={INK}
            strokeWidth={3.2}
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}
