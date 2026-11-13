// Inline stroke icons (no icon font or external request). Decorative unless a label is given.
const P: Record<string, string> = {
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 16v-4M12 8h.01',
  lock: 'M6 11h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM8 11V7a4 4 0 0 1 8 0v4',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  x: 'M18 6 6 18M6 6l12 12',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  aa: 'M3 19 8 5l5 14M4.8 14h6.4M15 19l3.5-9 3.5 9M16.2 16h4.6',
  speaker: 'M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
  stop: 'M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  back: 'M15 18l-6-6 6-6',
  check: 'M20 6 9 17l-5-5',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  folder: 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z',
  lifebuoy: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4.9 4.9l4.3 4.3M14.8 14.8l4.3 4.3M14.8 9.2l4.3-4.3M4.9 19.1l4.3-4.3',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  key: 'M7.5 10a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM21 2l-9.6 9.6M15.5 7.5l3 3L22 7l-3-3',
  copy: 'M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  hand: 'M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15',
  userx: 'M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM2 21v-1a6 6 0 0 1 12 0v1M17 8l4 4M21 8l-4 4',
  grad: 'M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 2 9 2 12 0v-5',
  coins: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM18.1 10.4A6 6 0 1 1 10.3 18',
  shieldAlert: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM12 8v4M12 16h.01',
  more: 'M5 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM19 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  mic: 'M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM5 10a7 7 0 0 0 14 0M12 17v5',
  keyboard: 'M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10',
  wave: 'M3 12h1M7 8v8M11 5v14M15 8v8M19 10v4',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM21 15l-5-5L5 21',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  play: 'M7 4v16l13-8z',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2',
  map: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0zM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6',
  chart: 'M3 3v18h18M7 16V9M12 16V5M17 16v-4',
  users: 'M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM2 21v-1a6 6 0 0 1 12 0v1M16 4a4 4 0 0 1 0 8M22 21v-1a6 6 0 0 0-4-5.6',
};

export function Icon({ name, size = 22, label, stroke = 2 }: { name: keyof typeof P | string; size?: number; label?: string; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      <path d={P[name] ?? ''} />
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M16 2 4 7v8c0 7.5 5.1 13.4 12 15 6.9-1.6 12-7.5 12-15V7L16 2z" fill="var(--primary)" />
      <path d="M10.5 16.5l3.8 3.8 7.4-7.6" fill="none" stroke="var(--primary-text)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HeroArt() {
  return (
    <svg width="150" height="120" viewBox="0 0 150 120" aria-hidden="true" focusable="false" className="pointer-events-none absolute -top-1.5 end-[-14px] rtl:scale-x-[-1]">
      <circle cx="98" cy="58" r="46" fill="var(--ill-1)" />
      <circle cx="58" cy="84" r="30" fill="var(--ill-2)" opacity=".9" />
      <circle cx="128" cy="22" r="14" fill="var(--ill-3)" />
      <path d="M96 30c14 10 18 30 6 46-10-12-14-30-6-46z" fill="var(--primary)" opacity=".75" />
      <path d="M96 76c-2-14 0-30 0-46" stroke="var(--surface)" strokeWidth="2" fill="none" />
      <circle cx="40" cy="30" r="3" fill="var(--accent)" opacity=".7" />
      <circle cx="56" cy="16" r="2" fill="var(--primary)" />
      <circle cx="20" cy="56" r="2.5" fill="var(--primary)" opacity=".6" />
    </svg>
  );
}
