import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DisplayProfile } from "../shared/types";

export interface BooleanControlConfig {
  id: string;
  label: string;
  description?: string;
  binary: string;
  args: string[];
  statusArgs: string[];
  enableArgs: string[];
  disableArgs: string[];
}

export interface DisplayCommandConfig {
  binary: string;
  args: string[];
  user?: string;
  env: Record<string, string>;
  statusArgs: string[];
  statusFormat: "kscreen" | "profile-id" | "raw";
}

export interface AppConfig {
  port: number;
  host: string;
  basePath: string;
  deviceName: string;
  desktopTarget: string;
  commandTimeoutMs: number;
  dryRun: boolean;
  kscreenUser?: string;
  kscreenEnv: Record<string, string>;
  displayCommand?: DisplayCommandConfig;
  displayProfiles: DisplayProfile[];
  booleanControls: BooleanControlConfig[];
}

interface RawConfig {
  port?: number;
  host?: string;
  basePath?: string;
  deviceName?: string;
  desktopTarget?: string;
  commandTimeoutMs?: number;
  dryRun?: boolean;
  kscreenUser?: string;
  kscreenEnv?: Record<string, string>;
  displayCommand?: Partial<DisplayCommandConfig>;
  displayProfiles?: DisplayProfile[];
  booleanControls?: BooleanControlConfig[];
}

const defaultDisplayProfiles: DisplayProfile[] = [
  {
    id: "monitor",
    label: "Monitor",
    description: "Desk monitor",
    icon: "monitor",
    accent: "blue",
    primaryOutput: "1",
    commandArgs: [
      "output.1.enable",
      "output.1.primary",
      "output.2.disable",
      "output.3.disable"
    ]
  },
  {
    id: "tv",
    label: "TV",
    description: "Television",
    icon: "tv",
    accent: "gray",
    primaryOutput: "2",
    commandArgs: [
      "output.2.enable",
      "output.2.primary",
      "output.1.disable",
      "output.3.disable"
    ]
  },
  {
    id: "virtual",
    label: "Virtual Display",
    description: "Virtual output",
    icon: "cloud",
    accent: "gray",
    primaryOutput: "3",
    commandArgs: [
      "output.3.enable",
      "output.3.primary",
      "output.1.disable",
      "output.2.disable"
    ]
  }
];

export function loadConfig(): AppConfig {
  const configPath = resolve(process.env.SRC_CONFIG ?? "remote-control.config.json");
  const fileConfig = readJsonConfig(configPath);

  return {
    port: Number(process.env.PORT ?? fileConfig.port ?? 3000),
    host: process.env.HOST ?? fileConfig.host ?? "0.0.0.0",
    basePath: normalizeBasePath(process.env.SRC_BASE_PATH ?? fileConfig.basePath ?? "/"),
    deviceName: process.env.SRC_DEVICE_NAME ?? fileConfig.deviceName ?? "Gaming PC",
    desktopTarget:
      process.env.SRC_DESKTOP_TARGET ??
      fileConfig.desktopTarget ??
      "graphical-session.target",
    commandTimeoutMs: Number(
      process.env.SRC_COMMAND_TIMEOUT_MS ?? fileConfig.commandTimeoutMs ?? 12000
    ),
    dryRun:
      process.env.SRC_DRY_RUN === "1" ||
      process.env.SRC_DRY_RUN === "true" ||
      fileConfig.dryRun === true,
    kscreenUser: process.env.SRC_KSCREEN_USER ?? fileConfig.kscreenUser,
    kscreenEnv: parseEnvJson(process.env.SRC_KSCREEN_ENV) ?? fileConfig.kscreenEnv ?? {},
    displayCommand: normalizeDisplayCommand(fileConfig.displayCommand),
    displayProfiles: normalizeProfiles(fileConfig.displayProfiles ?? defaultDisplayProfiles),
    booleanControls: fileConfig.booleanControls ?? []
  };
}

function readJsonConfig(path: string): RawConfig {
  if (!existsSync(path)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as RawConfig;
  } catch (error) {
    console.warn(`Unable to parse ${path}:`, error);
    return {};
  }
}

function parseEnvJson(value: string | undefined): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([key, envValue]) => [key, String(envValue)])
    );
  } catch {
    return undefined;
  }
}

function normalizeProfiles(profiles: DisplayProfile[]): DisplayProfile[] {
  return profiles
    .filter((profile) => profile.id && profile.label && profile.commandArgs.length > 0)
    .map((profile) => ({
      ...profile,
      icon: profile.icon ?? "monitor",
      accent: profile.accent ?? "gray"
    }));
}

function normalizeDisplayCommand(
  command: Partial<DisplayCommandConfig> | undefined
): DisplayCommandConfig | undefined {
  if (!command?.binary) {
    return undefined;
  }

  return {
    binary: command.binary,
    args: command.args ?? [],
    user: command.user,
    env: command.env ?? {},
    statusArgs: command.statusArgs ?? ["--outputs"],
    statusFormat: command.statusFormat ?? "raw"
  };
}

function normalizeBasePath(value: string): string {
  if (!/^\/(?:[A-Za-z0-9_-]+\/?)*$/.test(value)) {
    throw new Error("basePath must be an absolute URL path with letters, digits, underscores, or hyphens.");
  }
  return value.endsWith("/") ? value : `${value}/`;
}
