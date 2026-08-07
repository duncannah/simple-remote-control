# Simple Remote Control

Mobile-first Linux remote control for a gaming PC. The production process is a Bun webserver using Hono for the API/static server and a React frontend built with Vite.

## Run Locally

```bash
bun install
bun run build
bun run start
```

The server listens on `0.0.0.0:3000` by default. Override with `PORT=8080`.

## NixOS Flake

The flake only depends on `nixpkgs`; it does not use `flake-utils` or similar helper flakes.

```nix
{
  inputs.simple-remote-control.url = "github:yourname/simple-remote-control";

  outputs = { nixpkgs, simple-remote-control, ... }: {
    nixosConfigurations.gaming-pc = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        simple-remote-control.nixosModules.default
        { pkgs, ... }:
        {
          services.simple-remote-control = {
            enable = true;
            openFirewall = true;
            port = 3000;
            deviceName = "Gaming PC";
            kscreenUser = "duncan";
            kscreenEnv = {
              DISPLAY = ":0";
              XDG_RUNTIME_DIR = "/run/user/1000";
              DBUS_SESSION_BUS_ADDRESS = "unix:path=/run/user/1000/bus";
            };
            booleanControls = [
              {
                id = "example-service";
                label = "Example Service";
                description = "Enable or disable the example service";
                binary = "${pkgs.systemd}/bin/systemctl";
                statusArgs = [ "is-active" "--quiet" "example.service" ];
                enableArgs = [ "start" "example.service" ];
                disableArgs = [ "stop" "example.service" ];
              }
            ];
            displayProfiles = [
              {
                id = "monitor";
                label = "Monitor";
                icon = "monitor";
                accent = "blue";
                primaryOutput = "DP-1";
                commandArgs = [
                  "output.DP-1.enable"
                  "output.DP-1.primary"
                  "output.HDMI-A-1.disable"
                  "output.Virtual-1.disable"
                ];
              }
              {
                id = "tv";
                label = "TV";
                icon = "tv";
                accent = "gray";
                primaryOutput = "HDMI-A-1";
                commandArgs = [
                  "output.HDMI-A-1.enable"
                  "output.HDMI-A-1.primary"
                  "output.DP-1.disable"
                  "output.Virtual-1.disable"
                ];
              }
            ];
          };
        }
      ];
    };
  };
}
```

For local testing:

```bash
nix build .#
SRC_DRY_RUN=1 ./result/bin/simple-remote-control
```

## Target Machine Setup

The server is intended to run as root on Linux. It calls:

- `systemctl start graphical-session.target` / `systemctl stop graphical-session.target`
- `kscreen-doctor ...`
- `efibootmgr --bootnext <id>` and `efibootmgr --bootorder ...`
- `systemctl reboot` / `systemctl poweroff`

Create `remote-control.config.json` next to `package.json` to match the target host. Start from `remote-control.config.example.json`, especially the `displayProfiles`, `kscreenUser`, and `kscreenEnv` fields. `kscreen-doctor` normally needs the active desktop user's `DISPLAY`, `XDG_RUNTIME_DIR`, and DBus session address even when the webserver itself runs as root.

An example systemd unit is available at `deploy/simple-remote-control.service`. Adjust `WorkingDirectory` and the Bun path for the target machine before installing it.

## API

- `GET /api/status`
- `GET /api/activity`
- `POST /api/desktop` with `{ "enabled": true }`
- `POST /api/control/<id>` with `{ "enabled": true }`
- `POST /api/display` with `{ "profileId": "monitor" }`
- `POST /api/system` with `{ "action": "reboot" }` or `{ "action": "shutdown" }`
- `POST /api/boot/next` with `{ "bootId": "0001", "reboot": true }`
- `POST /api/boot/default` with `{ "bootId": "0001" }`

Set `SRC_DRY_RUN=1` to verify UI flows without executing system commands.
