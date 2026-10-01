import type { ActivityEvent, ApiMessage, ControlStatus } from "../shared/types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path.replace(/^\//, "./"), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const payload = (await response.json().catch(() => undefined)) as T | undefined;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: unknown }).message)
        : `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export const api = {
  status: () => request<ControlStatus>("/api/status"),
  activity: () => request<ActivityEvent[]>("/api/activity"),
  setDesktop: (enabled: boolean) =>
    request<ApiMessage>("/api/desktop", {
      method: "POST",
      body: JSON.stringify({ enabled })
    }),
  setBooleanControl: (controlId: string, enabled: boolean) =>
    request<ApiMessage>(`/api/control/${encodeURIComponent(controlId)}`, {
      method: "POST",
      body: JSON.stringify({ enabled })
    }),
  setDisplay: (profileId: string) =>
    request<ApiMessage>("/api/display", {
      method: "POST",
      body: JSON.stringify({ profileId })
    }),
  system: (action: "reboot" | "shutdown") =>
    request<ApiMessage>("/api/system", {
      method: "POST",
      body: JSON.stringify({ action })
    }),
  bootNext: (bootId: string, reboot = true) =>
    request<ApiMessage>("/api/boot/next", {
      method: "POST",
      body: JSON.stringify({ bootId, reboot })
    }),
  setDefaultBoot: (bootId: string) =>
    request<ApiMessage>("/api/boot/default", {
      method: "POST",
      body: JSON.stringify({ bootId })
    })
};
