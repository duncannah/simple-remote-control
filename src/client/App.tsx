import {
  Activity,
  CircleDot,
  Cloud,
  HardDrive,
  Home,
  Info,
  Laptop,
  Monitor,
  Power,
  RefreshCw,
  Settings,
  ShieldAlert,
  Tv,
  Zap
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ActivityEvent,
  ApiMessage,
  BootEntry,
  ControlStatus,
  DisplayProfile
} from "../shared/types";
import { api } from "./api";

type Tab = "dashboard" | "activity" | "settings";

type PendingAction =
  | { kind: "reboot"; title: string; body: string }
  | { kind: "shutdown"; title: string; body: string }
  | { kind: "boot"; title: string; body: string; bootId: string }
  | { kind: "defaultBoot"; title: string; body: string; bootId: string };

const initialStatus: ControlStatus = {
  deviceName: "Gaming PC",
  online: false,
  platform: "unknown",
  isRoot: false,
  desktop: {
    target: "graphical-session.target",
    state: "unknown",
    raw: ""
  },
  display: {
    profiles: [],
    raw: ""
  },
  boot: {
    entries: [],
    order: [],
    raw: ""
  },
  generatedAt: new Date().toISOString(),
  warnings: []
};

export function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [status, setStatus] = useState<ControlStatus>(initialStatus);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const refresh = useCallback(async () => {
    const [nextStatus, nextActivity] = await Promise.all([api.status(), api.activity()]);
    setStatus(nextStatus);
    setActivity(nextActivity);
    setError(null);
  }, []);

  useEffect(() => {
    refresh().catch((refreshError: unknown) => {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    });

    const interval = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 10000);

    return () => window.clearInterval(interval);
  }, [refresh]);

  const selectedBoot = useMemo(
    () =>
      status.boot.entries.find((entry) => entry.isNext) ??
      status.boot.entries.find((entry) => entry.isDefault) ??
      status.boot.entries[0],
    [status.boot.entries]
  );

  async function runMutation(label: string, mutation: () => Promise<ApiMessage>) {
    setBusy(label);
    setError(null);
    try {
      const response = await mutation();
      if (response.status) {
        setStatus(response.status);
      }
      await refresh();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : String(mutationError));
    } finally {
      setBusy(null);
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction) {
      return;
    }

    const action = pendingAction;
    setPendingAction(null);

    if (action.kind === "reboot") {
      await runMutation("reboot", () => api.system("reboot"));
    }
    if (action.kind === "shutdown") {
      await runMutation("shutdown", () => api.system("shutdown"));
    }
    if (action.kind === "boot") {
      await runMutation("boot", () => api.bootNext(action.bootId, true));
    }
    if (action.kind === "defaultBoot") {
      await runMutation("defaultBoot", () => api.setDefaultBoot(action.bootId));
    }
  }

  const isDesktopOn = status.desktop.state === "on";

  return (
    <div className="app-shell">
      <main className="phone-frame">
        <AppHeader status={status} onSettings={() => setTab("settings")} />

        {error ? (
          <div className="toast" role="alert">
            <ShieldAlert size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        {tab === "dashboard" ? (
          <div className="content-stack">
            <section className="control-panel accent-green">
              <PanelTitle
                icon={<Monitor />}
                title="Desktop Power"
                subtitle="Turn the desktop on or off"
              >
                <button
                  className={`switch ${isDesktopOn ? "enabled" : ""}`}
                  type="button"
                  aria-pressed={isDesktopOn}
                  aria-label="Toggle desktop power"
                  disabled={busy !== null}
                  onClick={() =>
                    runMutation("desktop", () => api.setDesktop(status.desktop.state !== "on"))
                  }
                >
                  <span />
                </button>
              </PanelTitle>

              <div className={`state-strip ${isDesktopOn ? "online" : "offline"}`}>
                <Power size={25} />
                <strong>{isDesktopOn ? "ON" : status.desktop.state === "off" ? "OFF" : "UNKNOWN"}</strong>
                <span>
                  {isDesktopOn
                    ? "The desktop is running"
                    : status.desktop.state === "off"
                      ? "The desktop is stopped"
                      : "Desktop state unavailable"}
                </span>
              </div>
            </section>

            <section className="control-panel accent-blue">
              <PanelTitle
                icon={<Monitor />}
                title="Display Output"
                subtitle="Select where to display"
              />

              <div className="option-grid display-grid">
                {status.display.profiles.map((profile) => (
                  <DisplayButton
                    key={profile.id}
                    profile={profile}
                    selected={status.display.activeProfileId === profile.id}
                    busy={busy === `display:${profile.id}`}
                    onClick={() =>
                      runMutation(`display:${profile.id}`, () => api.setDisplay(profile.id))
                    }
                  />
                ))}
              </div>

              <p className="hint-line">
                <Info size={16} />
                <span>Changes apply when the desktop is active.</span>
              </p>
            </section>

            <section className="control-panel accent-purple">
              <PanelTitle
                icon={<Power />}
                title="System Actions"
                subtitle="Reboot, shutdown, or more"
              />

              <div className="action-row">
                <ActionButton
                  icon={<RefreshCw />}
                  label="Reboot"
                  tone="blue"
                  disabled={busy !== null}
                  onClick={() =>
                    setPendingAction({
                      kind: "reboot",
                      title: "Reboot PC",
                      body: "The target machine will restart immediately."
                    })
                  }
                />
                <ActionButton
                  icon={<Power />}
                  label="Shutdown"
                  tone="red"
                  disabled={busy !== null}
                  onClick={() =>
                    setPendingAction({
                      kind: "shutdown",
                      title: "Shutdown PC",
                      body: "The target machine will power off immediately."
                    })
                  }
                />
                <ActionButton
                  icon={<HardDrive />}
                  label="Boot to OS"
                  tone="purple"
                  disabled={!selectedBoot || busy !== null}
                  onClick={() =>
                    selectedBoot
                      ? setPendingAction({
                          kind: "boot",
                          bootId: selectedBoot.id,
                          title: `Boot ${selectedBoot.label}`,
                          body: "BootNext will be set and the target machine will restart."
                        })
                      : undefined
                  }
                />
              </div>
            </section>

            <section className="control-panel accent-purple boot-panel">
              <PanelTitle
                icon={<HardDrive />}
                title="Boot to Operating System"
                subtitle="Choose an operating system to boot into"
              />

              {status.boot.entries.length > 0 ? (
                <div className="boot-scroller">
                  {status.boot.entries.map((entry) => (
                    <BootButton
                      key={entry.id}
                      entry={entry}
                      disabled={busy !== null}
                      onBoot={() =>
                        setPendingAction({
                          kind: "boot",
                          bootId: entry.id,
                          title: `Boot ${entry.label}`,
                          body: "BootNext will be set and the target machine will restart."
                        })
                      }
                      onDefault={() =>
                        setPendingAction({
                          kind: "defaultBoot",
                          bootId: entry.id,
                          title: `Default to ${entry.label}`,
                          body: "The EFI boot order will be updated."
                        })
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <HardDrive size={36} />
                  <span>No EFI boot entries detected</span>
                </div>
              )}
            </section>
          </div>
        ) : null}

        {tab === "activity" ? <ActivityView activity={activity} /> : null}
        {tab === "settings" ? <SettingsView status={status} refresh={refresh} /> : null}

        <BottomNav active={tab} onChange={setTab} />
      </main>

      {pendingAction ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setPendingAction(null)}>
          <div className="confirm-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>{pendingAction.title}</h2>
            <p>{pendingAction.body}</p>
            <div className="confirm-actions">
              <button type="button" className="secondary-button" onClick={() => setPendingAction(null)}>
                Cancel
              </button>
              <button type="button" className="danger-button" onClick={confirmPendingAction}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AppHeader({ status, onSettings }: { status: ControlStatus; onSettings: () => void }) {
  return (
    <header className="app-header">
      <div className="top-bar">
        <div className="header-title">
          <h1>{status.deviceName}</h1>
          <div className={`online-pill ${status.online ? "online" : ""}`}>
            <span />
            {status.online ? "Online" : "Offline"}
          </div>
        </div>
        <button className="icon-button" type="button" aria-label="Open settings" onClick={onSettings}>
          <Settings />
        </button>
      </div>
    </header>
  );
}

function PanelTitle({
  icon,
  title,
  subtitle,
  children
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="panel-title">
      <div className="panel-icon">{icon}</div>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {children ? <div className="panel-title-action">{children}</div> : null}
    </div>
  );
}

function DisplayButton({
  profile,
  selected,
  busy,
  onClick
}: {
  profile: DisplayProfile;
  selected: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const Icon = profile.icon === "tv" ? Tv : profile.icon === "cloud" ? Cloud : Monitor;

  return (
    <button
      className={`option-card accent-${profile.accent} ${selected ? "selected" : ""}`}
      type="button"
      aria-pressed={selected}
      disabled={busy}
      onClick={onClick}
    >
      <Icon size={42} />
      <span>{profile.label}</span>
      <CircleDot className="choice-dot" size={19} />
    </button>
  );
}

function ActionButton({
  icon,
  label,
  tone,
  disabled,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  tone: "blue" | "red" | "purple";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`action-button tone-${tone}`} type="button" disabled={disabled} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function BootButton({
  entry,
  disabled,
  onBoot,
  onDefault
}: {
  entry: BootEntry;
  disabled?: boolean;
  onBoot: () => void;
  onDefault: () => void;
}) {
  const Icon = entry.icon === "linux" ? Laptop : entry.icon === "windows" ? Monitor : HardDrive;

  return (
    <div className={`boot-card ${entry.isNext || entry.isDefault ? "selected" : ""}`}>
      <button className="boot-main" type="button" disabled={disabled} onClick={onBoot}>
        <Icon size={40} />
        <span>{entry.label}</span>
        {entry.isDefault ? <em>Default</em> : null}
        {entry.isNext ? <em>Next</em> : null}
      </button>
      <button className="default-dot" type="button" aria-label={`Set ${entry.label} as default`} onClick={onDefault}>
        <CircleDot size={20} />
      </button>
    </div>
  );
}

function ActivityView({ activity }: { activity: ActivityEvent[] }) {
  return (
    <section className="tab-page">
      <div className="page-heading">
        <Activity />
        <div>
          <h2>Activity</h2>
          <p>Recent commands</p>
        </div>
      </div>
      <div className="activity-list">
        {activity.length > 0 ? (
          activity.map((event) => (
            <article className="activity-item" key={event.id}>
              <div className={`activity-state ${event.ok ? "ok" : "bad"}`} />
              <div>
                <strong>{event.label}</strong>
                <span>{new Date(event.at).toLocaleString()}</span>
                <code>{event.command}</code>
                <p>{event.detail}</p>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state">
            <Zap size={34} />
            <span>No activity yet</span>
          </div>
        )}
      </div>
    </section>
  );
}

function SettingsView({ status, refresh }: { status: ControlStatus; refresh: () => Promise<void> }) {
  return (
    <section className="tab-page">
      <div className="page-heading">
        <Settings />
        <div>
          <h2>Settings</h2>
          <p>Target configuration</p>
        </div>
      </div>

      <div className="settings-list">
        <SettingRow label="Device" value={status.deviceName} />
        <SettingRow label="Platform" value={`${status.platform}${status.isRoot ? " / root" : " / non-root"}`} />
        <SettingRow label="Desktop target" value={status.desktop.target} />
        <SettingRow label="Boot order" value={status.boot.order.join(", ") || "Unavailable"} />
      </div>

      <div className="settings-list">
        {status.display.profiles.map((profile) => (
          <SettingRow
            key={profile.id}
            label={profile.label}
            value={profile.commandArgs.join(" ")}
          />
        ))}
      </div>

      {status.warnings.length > 0 ? (
        <div className="warning-box">
          {status.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      <button className="primary-wide-button" type="button" onClick={() => refresh()}>
        Refresh Status
      </button>
    </section>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

function BottomNav({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <button
        className={active === "dashboard" ? "active" : ""}
        type="button"
        onClick={() => onChange("dashboard")}
      >
        <Home />
        <span>Dashboard</span>
      </button>
      <button
        className={active === "activity" ? "active" : ""}
        type="button"
        onClick={() => onChange("activity")}
      >
        <Activity />
        <span>Activity</span>
      </button>
      <button
        className={active === "settings" ? "active" : ""}
        type="button"
        onClick={() => onChange("settings")}
      >
        <Settings />
        <span>Settings</span>
      </button>
    </nav>
  );
}
