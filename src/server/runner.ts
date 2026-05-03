import type { ActivityEvent, CommandResult } from "../shared/types";

interface RunOptions {
  timeoutMs: number;
  dryRun?: boolean;
  env?: Record<string, string>;
}

const maxActivityEvents = 80;
const activityEvents: ActivityEvent[] = [];

export function getActivity(): ActivityEvent[] {
  return [...activityEvents];
}

export function addActivity(event: Omit<ActivityEvent, "id" | "at">): ActivityEvent {
  const nextEvent: ActivityEvent = {
    ...event,
    id: crypto.randomUUID(),
    at: new Date().toISOString()
  };

  activityEvents.unshift(nextEvent);
  if (activityEvents.length > maxActivityEvents) {
    activityEvents.length = maxActivityEvents;
  }

  return nextEvent;
}

export async function runCommand(
  binary: string,
  args: string[],
  options: RunOptions
): Promise<CommandResult> {
  const command = formatCommand(binary, args);
  const startedAt = performance.now();

  if (options.dryRun) {
    return {
      ok: true,
      code: 0,
      stdout: "dry-run",
      stderr: "",
      command,
      durationMs: Math.round(performance.now() - startedAt),
      timedOut: false
    };
  }

  try {
    const proc = Bun.spawn([binary, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, ...options.env }
    });

    let timedOut = false;
    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => {
        timedOut = true;
        proc.kill();
        resolve(null);
      }, options.timeoutMs);
    });

    const [code, stdout, stderr] = await Promise.all([
      Promise.race([proc.exited, timeout]),
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text()
    ]);

    return {
      ok: code === 0,
      code,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      command,
      durationMs: Math.round(performance.now() - startedAt),
      timedOut
    };
  } catch (error) {
    return {
      ok: false,
      code: null,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      command,
      durationMs: Math.round(performance.now() - startedAt),
      timedOut: false
    };
  }
}

function formatCommand(binary: string, args: string[]): string {
  return [binary, ...args].map((part) => (/\s/.test(part) ? JSON.stringify(part) : part)).join(" ");
}
