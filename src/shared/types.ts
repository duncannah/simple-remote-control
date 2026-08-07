export type PowerState = "on" | "off" | "unknown";

export type DisplayIcon = "monitor" | "tv" | "cloud";
export type DisplayAccent = "green" | "blue" | "purple" | "red" | "gray";

export interface DisplayProfile {
  id: string;
  label: string;
  description?: string;
  icon: DisplayIcon;
  accent: DisplayAccent;
  primaryOutput?: string;
  commandArgs: string[];
}

export type BootIcon = "windows" | "linux" | "drive";

export interface BootEntry {
  id: string;
  label: string;
  description?: string;
  icon: BootIcon;
  isCurrent: boolean;
  isDefault: boolean;
  isNext: boolean;
}

export interface DesktopStatus {
  target: string;
  state: PowerState;
  raw: string;
}

export interface DisplayStatus {
  profiles: DisplayProfile[];
  activeProfileId?: string;
  raw: string;
}

export interface BooleanControlStatus {
  id: string;
  label: string;
  description?: string;
  state: PowerState;
}

export interface BootStatus {
  entries: BootEntry[];
  currentId?: string;
  nextId?: string;
  order: string[];
  raw: string;
}

export interface ControlStatus {
  deviceName: string;
  online: boolean;
  platform: string;
  isRoot: boolean;
  desktop: DesktopStatus;
  booleanControls: BooleanControlStatus[];
  display: DisplayStatus;
  boot: BootStatus;
  generatedAt: string;
  warnings: string[];
}

export interface ActivityEvent {
  id: string;
  at: string;
  kind: "desktop" | "control" | "display" | "system" | "boot" | "status";
  label: string;
  ok: boolean;
  command: string;
  detail: string;
}

export interface CommandResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  command: string;
  durationMs: number;
  timedOut: boolean;
}

export interface ApiMessage {
  ok: boolean;
  message: string;
  status?: ControlStatus;
}
