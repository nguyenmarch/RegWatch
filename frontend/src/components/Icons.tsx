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
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" className={className}>
      <path
        d="M18 2.6 31 7.7v9.6c0 7.5-5.1 13.9-13 16.1C10.1 31.2 5 24.8 5 17.3V7.7L18 2.6Z"
        fill="url(#regwatch-logo-shield)"
      />
      <path
        d="M18 5.4 28.2 9.4v7.8c0 5.9-3.9 11.1-10.2 13.1-6.3-2-10.2-7.2-10.2-13.1V9.4L18 5.4Z"
        fill="url(#regwatch-logo-inner)"
        opacity="0.94"
      />
      <path
        d="M12.3 22.7V12.4h4.1c2.4 0 3.9 1.1 3.9 3 0 1.2-.6 2.1-1.8 2.6l3.2 4.7h-2.9l-2.7-4.1h-1.3v4.1h-2.5Z"
        fill="white"
      />
      <path
        d="M14.8 16.8h1.4c1 0 1.6-.5 1.6-1.3s-.6-1.3-1.6-1.3h-1.4v2.6Z"
        fill="#F37021"
      />
      <path
        d="M21.6 12.4h2.1l1.2 6.1 1.4-4h1.6l-2.4 8.2h-2l-1.2-5.9-1.3 2.1-.8-1.7 1.4-4.8Z"
        fill="#FFB16A"
      />
      <circle cx="10.6" cy="10.7" r="1.35" fill="#FFB16A" />
      <circle cx="25.6" cy="24.1" r="1.35" fill="#FFB16A" />
      <circle cx="26.1" cy="10.9" r="1.1" fill="white" opacity="0.9" />
      <path d="M11.7 11.6 17 17.1l8.1-5.6M19.3 18.5l5.4 4.7" stroke="white" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      <defs>
        <linearGradient id="regwatch-logo-shield" x1="5" y1="2.6" x2="31" y2="33.4" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F37021" />
          <stop offset="46%" stopColor="#FF9A3D" />
          <stop offset="100%" stopColor="#003B71" />
        </linearGradient>
        <linearGradient id="regwatch-logo-inner" x1="7.8" y1="5.4" x2="28.2" y2="30.3" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0D4F86" />
          <stop offset="100%" stopColor="#002B52" />
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

export function PaperPlaneIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M21.5 2.5 10.8 13.2" />
      <path d="m21.5 2.5-6.8 19-3.9-8.3-8.3-3.9 19-6.8Z" />
    </Icon>
  )
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

export function CheckIcon(p: IconProps) {
  return <Icon {...p}><polyline points="20 6 9 17 4 12" /></Icon>
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

export function ChartIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <line x1="3" y1="3" x2="3" y2="21" />
      <line x1="3" y1="21" x2="21" y2="21" />
      <rect x="7" y="11" width="3" height="7" rx="1" />
      <rect x="12" y="7" width="3" height="11" rx="1" />
      <rect x="17" y="13" width="3" height="5" rx="1" />
    </Icon>
  )
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

export function UploadCloudIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </Icon>
  )
}

export function DownloadIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </Icon>
  )
}

export function ChevronDownIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <polyline points="6 9 12 15 18 9" />
    </Icon>
  )
}

export function TrashIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </Icon>
  )
}

export function FileTextIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </Icon>
  )
}

export function ClockIcon(p: IconProps) {
  return <Icon {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Icon>
}

export function AlertTriangleIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </Icon>
  )
}

export function FolderOpenIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </Icon>
  )
}

export function PlusIcon(p: IconProps) {
  return <Icon {...p}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Icon>
}

export function UserIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Icon>
  )
}

export function LogInIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </Icon>
  )
}

export function EyeIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  )
}

export function EyeOffIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </Icon>
  )
}

export function ChevronLeftIcon(p: IconProps) {
  return <Icon {...p}><polyline points="15 18 9 12 15 6" /></Icon>
}

export function LogOutIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
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

export function ScrollTextIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4" />
      <path d="M19 3H4.5a2.5 2.5 0 0 0 0 5H19" />
      <line x1="12" y1="10" x2="19" y2="10" />
      <line x1="12" y1="14" x2="19" y2="14" />
      <line x1="12" y1="18" x2="19" y2="18" />
    </Icon>
  )
}

export function MenuIcon(p: IconProps) {
  return <Icon {...p}><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></Icon>
}

export function XIcon(p: IconProps) {
  return <Icon {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Icon>
}

export function SaveIcon(p: IconProps) {
  return <Icon {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></Icon>
}

export function BookOpenIcon(p: IconProps) {
  return <Icon {...p}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></Icon>
}

export function SendIcon(p: IconProps) {
  return <Icon {...p}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></Icon>
}

export function BuildingIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 22V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16z" />
      <line x1="9" y1="22" x2="9" y2="12" />
      <line x1="15" y1="22" x2="15" y2="12" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="6" y1="8" x2="8" y2="8" />
      <line x1="10" y1="8" x2="12" y2="8" />
      <line x1="14" y1="8" x2="16" y2="8" />
      <line x1="6" y1="14" x2="8" y2="14" />
      <line x1="10" y1="14" x2="12" y2="14" />
      <line x1="14" y1="14" x2="16" y2="14" />
    </Icon>
  )
}

export function ScaleIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="M7 21h10" />
      <path d="M12 3v18" />
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </Icon>
  )
}

export function ClipboardListIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <line x1="8" y1="14" x2="16" y2="14" />
      <line x1="8" y1="18" x2="16" y2="18" />
    </Icon>
  )
}

export function EditIcon(p: IconProps) {
  return <Icon {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></Icon>
}

export function PenLineIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Icon>
  )
}

export function GraduationCapIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </Icon>
  )
}

export function FileBadgeIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <circle cx="12" cy="13" r="2" />
      <path d="m14.5 15.5-1 3-1.5-1.5-1.5 1.5-1-3" />
    </Icon>
  )
}