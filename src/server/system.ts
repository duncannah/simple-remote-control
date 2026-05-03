import type {
  ActivityEvent,
  BootEntry,
  BootStatus,
  CommandResult,
  ControlStatus,
  DesktopStatus,
  DisplayStatus
} from "../shared/types";
import type { AppConfig } from "./config";
import { addActivity, getActivity, runCommand } from "./runner";

interface KscreenOutput {
  id: string;
  name: string;
  enabled: boolean;
  primary: boolean;
}

export class ControlService {
  constructor(private readonly config: AppConfig) {}

  activity(): ActivityEvent[] {
    return getActivity();
  }

  async status(): Promise<ControlStatus> {
    const warnings: string[] = [];
    const [desktop, display, boot] = await Promise.all([
      this.desktopStatus(warnings),
      this.displayStatus(warnings),
      this.bootStatus(warnings)
    ]);

    if (process.platform !== "linux") {
      warnings.push("System command execution is only supported on Linux.");
    }

    if (typeof process.getuid === "function" && process.getuid() !== 0) {
      warnings.push("The server is not running as root.");
    }

    return {
      deviceName: this.config.deviceName,
      online: true,
      platform: process.platform,
      isRoot: typeof process.getuid === "function" ? process.getuid() === 0 : false,
      desktop,
      display,
      boot,
      generatedAt: new Date().toISOString(),
      warnings
    };
  }

  async setDesktop(enabled: boolean): Promise<CommandResult> {
    const result = await this.systemctl(
      enabled ? "start" : "stop",
      this.config.desktopTarget
    );
    addActivity({
      kind: "desktop",
      label: enabled ? "Desktop on" : "Desktop off",
      ok: result.ok,
      command: result.command,
      detail: summarizeResult(result)
    });
    return result;
  }

  async switchDisplay(profileId: string): Promise<CommandResult> {
    const profile = this.config.displayProfiles.find((candidate) => candidate.id === profileId);
    if (!profile) {
      return virtualFailure(`Unknown display profile: ${profileId}`);
    }

    const result = await this.kscreen(profile.commandArgs);
    addActivity({
      kind: "display",
      label: `Display: ${profile.label}`,
      ok: result.ok,
      command: result.command,
      detail: summarizeResult(result)
    });
    return result;
  }

  async systemAction(action: "reboot" | "shutdown"): Promise<CommandResult> {
    const result =
      action === "reboot"
        ? await this.systemctl("reboot")
        : await this.systemctl("poweroff");

    addActivity({
      kind: "system",
      label: action === "reboot" ? "Reboot" : "Shutdown",
      ok: result.ok,
      command: result.command,
      detail: summarizeResult(result)
    });

    return result;
  }

  async setBootNext(bootId: string, reboot: boolean): Promise<CommandResult> {
    if (!isBootId(bootId)) {
      return virtualFailure("Boot id must be a four digit EFI id.");
    }

    const bootNext = await this.efibootmgr("--bootnext", bootId.toUpperCase());
    let result = bootNext;

    if (bootNext.ok && reboot) {
      result = await this.systemctl("reboot");
    }

    addActivity({
      kind: "boot",
      label: reboot ? `Boot next: ${bootId}` : `Set BootNext: ${bootId}`,
      ok: bootNext.ok && result.ok,
      command: reboot ? `${bootNext.command} && ${result.command}` : bootNext.command,
      detail: summarizeResult(result.ok ? bootNext : result)
    });

    return result.ok ? bootNext : result;
  }

  async setDefaultBoot(bootId: string): Promise<CommandResult> {
    if (!isBootId(bootId)) {
      return virtualFailure("Boot id must be a four digit EFI id.");
    }

    const current = await this.bootStatus([]);
    const upperId = bootId.toUpperCase();
    const nextOrder = [
      upperId,
      ...current.order.filter((candidate) => candidate.toUpperCase() !== upperId)
    ];

    if (nextOrder.length === 1) {
      current.entries
        .map((entry) => entry.id)
        .filter((candidate) => candidate.toUpperCase() !== upperId)
        .forEach((candidate) => nextOrder.push(candidate));
    }

    const result = await this.efibootmgr("--bootorder", nextOrder.join(","));
    addActivity({
      kind: "boot",
      label: `Default boot: ${upperId}`,
      ok: result.ok,
      command: result.command,
      detail: summarizeResult(result)
    });

    return result;
  }

  private async desktopStatus(warnings: string[]): Promise<DesktopStatus> {
    const result = await this.systemctl("is-active", this.config.desktopTarget);
    if (!result.ok && result.stderr) {
      warnings.push(`Desktop status: ${result.stderr}`);
    }

    const raw = [result.stdout, result.stderr].filter(Boolean).join("\n");
    return {
      target: this.config.desktopTarget,
      state: result.stdout === "active" ? "on" : result.stdout ? "off" : "unknown",
      raw
    };
  }

  private async displayStatus(warnings: string[]): Promise<DisplayStatus> {
    const result = await this.kscreen(["--outputs"]);
    if (!result.ok) {
      warnings.push(`Display status: ${summarizeResult(result)}`);
      return {
        profiles: this.config.displayProfiles,
        raw: [result.stdout, result.stderr].filter(Boolean).join("\n")
      };
    }

    const outputs = parseKscreenOutputs(result.stdout);
    const primaryOutput = outputs.find((output) => output.enabled && output.primary);
    const activeProfile = primaryOutput
      ? this.config.displayProfiles.find((profile) =>
          outputMatches(primaryOutput, profile.primaryOutput)
        )
      : undefined;

    return {
      profiles: this.config.displayProfiles,
      activeProfileId: activeProfile?.id,
      raw: result.stdout
    };
  }

  private async bootStatus(warnings: string[]): Promise<BootStatus> {
    const result = await this.efibootmgr();
    if (!result.ok) {
      warnings.push(`EFI status: ${summarizeResult(result)}`);
      return {
        entries: [],
        order: [],
        raw: [result.stdout, result.stderr].filter(Boolean).join("\n")
      };
    }

    return parseEfibootmgr(result.stdout);
  }

  private async systemctl(...args: string[]): Promise<CommandResult> {
    return runCommand("systemctl", args, {
      timeoutMs: this.config.commandTimeoutMs,
      dryRun: this.config.dryRun
    });
  }

  private async efibootmgr(...args: string[]): Promise<CommandResult> {
    return runCommand("efibootmgr", args, {
      timeoutMs: this.config.commandTimeoutMs,
      dryRun: this.config.dryRun
    });
  }

  private async kscreen(args: string[]): Promise<CommandResult> {
    if (this.config.kscreenUser) {
      return runCommand(
        "runuser",
        ["--preserve-environment", "-u", this.config.kscreenUser, "--", "kscreen-doctor", ...args],
        {
          timeoutMs: this.config.commandTimeoutMs,
          dryRun: this.config.dryRun,
          env: this.config.kscreenEnv
        }
      );
    }

    return runCommand("kscreen-doctor", args, {
      timeoutMs: this.config.commandTimeoutMs,
      dryRun: this.config.dryRun,
      env: this.config.kscreenEnv
    });
  }
}

export function parseEfibootmgr(stdout: string): BootStatus {
  const entries: BootEntry[] = [];
  const order: string[] = [];
  let currentId: string | undefined;
  let nextId: string | undefined;

  for (const line of stdout.split("\n")) {
    const currentMatch = line.match(/^BootCurrent:\s*([0-9A-Fa-f]{4})/);
    if (currentMatch) {
      currentId = currentMatch[1].toUpperCase();
      continue;
    }

    const nextMatch = line.match(/^BootNext:\s*([0-9A-Fa-f]{4})/);
    if (nextMatch) {
      nextId = nextMatch[1].toUpperCase();
      continue;
    }

    const orderMatch = line.match(/^BootOrder:\s*(.+)$/);
    if (orderMatch) {
      order.push(
        ...orderMatch[1]
          .split(",")
          .map((id) => id.trim().toUpperCase())
          .filter(isBootId)
      );
      continue;
    }

    const entryMatch = line.match(/^Boot([0-9A-Fa-f]{4})([*+\-\s])?\s+(.+)$/);
    if (entryMatch) {
      const id = entryMatch[1].toUpperCase();
      const label = normalizeBootLabel(entryMatch[3]);
      entries.push({
        id,
        label,
        icon: inferBootIcon(label),
        isCurrent: false,
        isDefault: false,
        isNext: false
      });
    }
  }

  const defaultId = order[0];
  entries.forEach((entry) => {
    entry.isCurrent = entry.id === currentId;
    entry.isNext = entry.id === nextId;
    entry.isDefault = entry.id === defaultId;
  });

  entries.sort((left, right) => {
    const leftIndex = order.indexOf(left.id);
    const rightIndex = order.indexOf(right.id);
    return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
      (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
  });

  return {
    entries,
    currentId,
    nextId,
    order,
    raw: stdout
  };
}

export function parseKscreenOutputs(stdout: string): KscreenOutput[] {
  const outputs: KscreenOutput[] = [];
  const blocks = stdout.split(/\n(?=Output:)/);

  for (const block of blocks) {
    const header = block.match(/Output:\s+(\S+)\s+(\S+)(.*)/);
    if (!header) {
      continue;
    }

    outputs.push({
      id: header[1],
      name: header[2],
      enabled: /\benabled\b/.test(header[3]) || /\bEnabled:\s*true\b/i.test(block),
      primary: /\bprimary\b/i.test(header[3]) || /\bPrimary:\s*true\b/i.test(block)
    });
  }

  return outputs;
}

function normalizeBootLabel(raw: string): string {
  const withoutDevicePath = raw
    .replace(/\s+(HD|PciRoot|VenHw|File|BBS|FvFile|MemoryMapped)\(.+$/i, "")
    .replace(/\s+VenMsg\(.+$/i, "")
    .trim();

  return withoutDevicePath || raw.trim();
}

function inferBootIcon(label: string): BootEntry["icon"] {
  const lower = label.toLowerCase();
  if (lower.includes("windows")) {
    return "windows";
  }
  if (
    lower.includes("ubuntu") ||
    lower.includes("linux") ||
    lower.includes("fedora") ||
    lower.includes("debian") ||
    lower.includes("arch")
  ) {
    return "linux";
  }
  return "drive";
}

function outputMatches(output: KscreenOutput, configuredOutput: string | undefined): boolean {
  if (!configuredOutput) {
    return false;
  }

  return output.id === configuredOutput || output.name === configuredOutput;
}

function isBootId(id: string): boolean {
  return /^[0-9A-Fa-f]{4}$/.test(id);
}

function summarizeResult(result: CommandResult): string {
  if (result.timedOut) {
    return `Timed out after ${result.durationMs}ms`;
  }

  if (result.ok) {
    return result.stdout || "Command completed";
  }

  return result.stderr || result.stdout || `Command exited with ${result.code ?? "no code"}`;
}

function virtualFailure(message: string): CommandResult {
  return {
    ok: false,
    code: null,
    stdout: "",
    stderr: message,
    command: "validation",
    durationMs: 0,
    timedOut: false
  };
}
