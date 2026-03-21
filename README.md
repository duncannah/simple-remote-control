# simple-remote-control

Small Go web service that renders one button per configured command. Each button sends a plain `POST` request that executes the matching command on the host.

## Configuration

Use a JSON file (see `config.example.json`) with:

- `bind`: interface to listen on (default: `0.0.0.0`)
- `port`: TCP port for the web server (required)
- `command_timeout_seconds`: max runtime per command (default: `30`)
- `categories`: list of groups
  - `name`: heading shown in the UI
  - `commands`: list of commands under that heading
    - `id`: unique command ID
    - `label`: button text
    - `command`: shell command executed with `/bin/sh -c`

Only command IDs from the config are accepted by `POST /run`.

## Run

```bash
go run . -config ./config.example.json
```

Then open `http://localhost:8080`.

## Build

```bash
go build -o simple-remote-control .
```

## Run as root in background (systemd)

### NixOS (from flake module)

The flake now exports `nixosModules.default`, which defines `services.simple-remote-control`.

Example NixOS configuration:

```nix
{
  imports = [
    inputs.simple-remote-control.nixosModules.default
  ];

  services.simple-remote-control = {
    enable = true;
    config = {
      bind = "0.0.0.0";
      port = 8080;
      command_timeout_seconds = 30;
      categories = [
        {
          name = "System";
          commands = [
            {
              id = "uptime";
              label = "Show Uptime";
              command = "uptime";
            }
          ];
        }
      ];
    };
    user = "root";
    group = "root";
    openFirewall = true;
  };
}
```

Set exactly one of:
- `services.simple-remote-control.config` (inline Nix attrset rendered to JSON)
- `services.simple-remote-control.configPath` (path to existing JSON file)

The Go application is the single source of truth for config validation/schema.
The Nix module forwards inline JSON config as-is.

When `openFirewall = true`:
- if `config` is used, the module opens `config.port`
- if `configPath` is used, set `services.simple-remote-control.port`

### Non-NixOS / manual unit file

Example unit:

```ini
[Unit]
Description=Simple Remote Control
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/simple-remote-control
ExecStart=/opt/simple-remote-control/simple-remote-control -config /etc/simple-remote-control/config.json
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

Install + start:

```bash
sudo cp simple-remote-control /opt/simple-remote-control/
sudo cp config.example.json /etc/simple-remote-control/config.json
sudo cp simple-remote-control.service /etc/systemd/system/simple-remote-control.service
sudo systemctl daemon-reload
sudo systemctl enable --now simple-remote-control
```

Adjust paths and commands for your machine before enabling.
