import autopilotGeoIcon from "@/assets/autopilotgeo-icon.svg";

interface AnimatedLogoProps {
  size?: "sm" | "md" | "lg";
  variant?: "full" | "icon";
  theme?: "auto" | "light" | "dark";
  className?: string;
}

const sizeMap = {
  sm: { width: 220, height: 78 },
  md: { width: 280, height: 99 },
  lg: { width: 340, height: 120 },
};

const iconSizeClasses = {
  sm: "h-10 w-10",
  md: "h-12 w-12",
  lg: "h-14 w-14",
};

export function AnimatedLogo({ size = "md", variant = "full", theme = "auto", className = "" }: AnimatedLogoProps) {
  if (variant === "icon") {
    return (
      <img
        src={autopilotGeoIcon as unknown as string}
        alt="AutoPilot Geo"
        width={size === "sm" ? 40 : size === "md" ? 48 : 56}
        height={size === "sm" ? 40 : size === "md" ? 48 : 56}
        loading="eager"
        className={`${iconSizeClasses[size]} ${className}`}
      />
    );
  }

  const { width, height } = sizeMap[size];
  const isDark = theme === "dark";
  const textGradStops = isDark
    ? { s0: "#ffffff", s60: "#c0d0ff", s100: "#0099cc" }
    : { s0: "#1a1a3a", s60: "#1a2a6a", s100: "#0099cc" };
  const subtitleFill = isDark ? "#a0b0d0" : "#7080a0";
  const uid = theme; // unique suffix per theme variant

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 120" width={width} height={height} className={className} role="img" aria-label="AutoPilot Geo">
      <title>AutoPilot Geo</title>
      <defs>
        <linearGradient id={`orbitGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "#0099cc" }} />
          <stop offset="100%" style={{ stopColor: "#5b10d6" }} />
        </linearGradient>
        <linearGradient id={`textGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style={{ stopColor: textGradStops.s0 }} />
          <stop offset="60%" style={{ stopColor: textGradStops.s60 }} />
          <stop offset="100%" style={{ stopColor: textGradStops.s100 }} />
        </linearGradient>
        <filter id={`glow-${uid}`}>
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={`softglow-${uid}`}>
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <ellipse cx="60" cy="60" rx="42" ry="42" fill="none" stroke={`url(#orbitGrad-${uid})`} strokeWidth="1.5" strokeOpacity="0.2" />
      <ellipse cx="60" cy="60" rx="42" ry="16" fill="none" stroke={`url(#orbitGrad-${uid})`} strokeWidth="1.2" strokeOpacity="0.4" transform="rotate(-20 60 60)" />
      <ellipse cx="60" cy="60" rx="42" ry="16" fill="none" stroke={`url(#orbitGrad-${uid})`} strokeWidth="1.2" strokeOpacity="0.35" transform="rotate(20 60 60)" />
      <path d="M 25 48 A 42 42 0 0 1 95 48" fill="none" stroke={`url(#orbitGrad-${uid})`} strokeWidth="2.5" strokeLinecap="round" filter={`url(#glow-${uid})`} />
      <circle cx="60" cy="60" r="9" fill={`url(#orbitGrad-${uid})`} filter={`url(#softglow-${uid})`} opacity="0.85" />
      <circle cx="60" cy="60" r="4.5" fill="#ffffff" />
      <circle cx="95" cy="43" r="3.5" fill="#0099cc" filter={`url(#glow-${uid})`} />
      <circle cx="25" cy="76" r="2.5" fill="#5b10d6" filter={`url(#glow-${uid})`} opacity="0.7" />
      <circle cx="102" cy="60" r="2" fill="#0099cc" opacity="0.5" />
      <circle cx="60" cy="60" r="14" fill="none" stroke="#0099cc" strokeWidth="0.8" strokeOpacity="0.2" />
      <circle cx="60" cy="60" r="22" fill="none" stroke="#5b10d6" strokeWidth="0.6" strokeOpacity="0.12" />
      <text x="132" y="52" fontFamily="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" fontSize="15" fontWeight="400" letterSpacing="3.5" fill={subtitleFill} textAnchor="start">AUTOPILOT</text>
      <line x1="132" y1="59" x2="310" y2="59" stroke={`url(#orbitGrad-${uid})`} strokeWidth="0.5" strokeOpacity="0.25" />
      <text x="128" y="98" fontFamily="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" fontSize="46" fontWeight="800" letterSpacing="-1" fill={`url(#textGrad-${uid})`} textAnchor="start">GEO</text>
    </svg>
  );
}
