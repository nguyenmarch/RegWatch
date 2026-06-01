interface IconProps {
  size?: number
  className?: string
  strokeWidth?: number
}

function Icon({ size = 20, className, strokeWidth = 1.75, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

export function RegWatchLogoIcon({ size = 28, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
      <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#logo-grad)" />
      <circle cx="16" cy="16" r="5" stroke="white" strokeWidth="2" />
      <path d="M16 7v2M16 23v2M7 16h2M23 16h2" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 10l1.4 1.4M20.6 20.6L22 22M10 22l1.4-1.4M20.6 11.4L22 10" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function SearchIcon(p: IconProps) {
  return <Icon {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></Icon>
}

export function VectorIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="5" cy="12" r="2" />
      <circle cx="19" cy="5" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="M7 12h4l2-4 2 8 2-4h0" />
    </Icon>
  )
}

export function GraphNetworkIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
      <line x1="12" y1="7" x2="5" y2="17" />
      <line x1="12" y1="7" x2="19" y2="17" />
      <line x1="7" y1="19" x2="17" y2="19" />
      <circle cx="12" cy="13" r="1.5" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function SparklesIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
      <path d="M19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75z" />
      <path d="M5 17l.5 1.5L7 19l-1.5.5L5 21l-.5-1.5L3 19l1.5-.5z" />
    </Icon>
  )
}

export function WorkflowIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3" y="3" width="6" height="4" rx="1" />
      <rect x="15" y="8" width="6" height="4" rx="1" />
      <rect x="3" y="17" width="6" height="4" rx="1" />
      <path d="M9 5h3a3 3 0 0 1 3 3v1" />
      <path d="M21 12v2a3 3 0 0 1-3 3H9" />
      <path d="M9 19H6" strokeWidth="0" />
      <polyline points="7 17 5 19 7 21" />
    </Icon>
  )
}

export function SunIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </Icon>
  )
}

export function MoonIcon(p: IconProps) {
  return <Icon {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></Icon>
}

export function ArrowRightIcon(p: IconProps) {
  return <Icon {...p}><path d="M5 12h14M12 5l7 7-7 7" /></Icon>
}

export function ArrowLeftIcon(p: IconProps) {
  return <Icon {...p}><path d="M19 12H5M12 19l-7-7 7-7" /></Icon>
}

export function ExternalLinkIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </Icon>
  )
}

export function CheckCircleIcon(p: IconProps) {
  return <Icon {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></Icon>
}

export function XCircleIcon(p: IconProps) {
  return <Icon {...p}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></Icon>
}

export function LoaderIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`icon-spin ${className ?? ''}`}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

export function ActivityIcon(p: IconProps) {
  return <Icon {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></Icon>
}

export function ServerIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </Icon>
  )
}

export function TerminalIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </Icon>
  )
}

export function InfoIcon(p: IconProps) {
  return <Icon {...p}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></Icon>
}

export function RefreshIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </Icon>
  )
}

export function GithubIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </Icon>
  )
}

export function HomeIcon(p: IconProps) {
  return <Icon {...p}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></Icon>
}

export function PlayIcon(p: IconProps) {
  return <Icon {...p}><polygon points="5 3 19 12 5 21 5 3" /></Icon>
}

export function DatabaseIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </Icon>
  )
}

export function ChevronRightIcon(p: IconProps) {
  return <Icon {...p}><polyline points="9 18 15 12 9 6" /></Icon>
}

export function LayersIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </Icon>
  )
}

export function GlobeIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Icon>
  )
}

export function MenuIcon(p: IconProps) {
  return <Icon {...p}><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></Icon>
}

export function XIcon(p: IconProps) {
  return <Icon {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Icon>
}
