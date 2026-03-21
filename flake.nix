{
  description = "simple-remote-control: Go app, dev shell, and NixOS service module";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    (flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };
      in {
        packages.default = pkgs.buildGoModule {
          pname = "simple-remote-control";
          version = "0.1.0";
          src = ./.;
          vendorHash = null;
        };

        apps.default = flake-utils.lib.mkApp {
          drv = self.packages.${system}.default;
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            go
            gopls
            gotools
            delve
            golangci-lint
          ];

          shellHook = ''
            echo "Go dev shell ready."
            echo "Run: gofmt -w . && go build ./..."
          '';
        };
      }))
    // {
      nixosModules.default = { config, lib, pkgs, ... }:
        let
          cfg = config.services.simple-remote-control;
          jsonFormat = pkgs.formats.json { };
          renderedConfigPath =
            if cfg.config != null
            then jsonFormat.generate "simple-remote-control-config.json" cfg.config
            else cfg.configPath;
          firewallPort =
            if cfg.config != null
            then lib.attrByPath [ "port" ] cfg.port cfg.config
            else cfg.port;
        in {
          options.services.simple-remote-control = with lib; {
            enable = mkEnableOption "simple-remote-control web command runner";

            package = mkOption {
              type = types.package;
              default = self.packages.${pkgs.system}.default;
              description = "The simple-remote-control package to run.";
            };

            configPath = mkOption {
              type = types.nullOr types.str;
              default = null;
              example = "/etc/simple-remote-control/config.json";
              description = "Path to an existing JSON config file passed to -config.";
            };

            config = mkOption {
              type = types.nullOr (types.submodule {
                freeformType = jsonFormat.type;
              });
              default = null;
              description = "Inline JSON config rendered and passed to the service. Schema is validated by the Go app.";
            };

            user = mkOption {
              type = types.str;
              default = "root";
              description = "User account for the service.";
            };

            group = mkOption {
              type = types.str;
              default = "root";
              description = "Group for the service.";
            };

            openFirewall = mkOption {
              type = types.bool;
              default = false;
              description = "Open firewall for the configured port.";
            };

            port = mkOption {
              type = types.port;
              default = 8080;
              description = "Firewall port opened when openFirewall is true and configPath is used.";
            };
          };

          config = lib.mkIf cfg.enable {
            assertions = [
              {
                assertion = (cfg.config != null) != (cfg.configPath != null);
                message = "Set exactly one of services.simple-remote-control.config or services.simple-remote-control.configPath.";
              }
            ];

            systemd.services.simple-remote-control = {
              description = "Simple Remote Control";
              after = [ "network-online.target" ];
              wants = [ "network-online.target" ];
              wantedBy = [ "multi-user.target" ];

              serviceConfig = {
                Type = "simple";
                User = cfg.user;
                Group = cfg.group;
                ExecStart = "${cfg.package}/bin/simple-remote-control -config ${renderedConfigPath}";
                Restart = "always";
                RestartSec = 2;
              };
            };

            networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [ firewallPort ];
          };
        };
    };
}
