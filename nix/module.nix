{ self }:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.simple-remote-control;
  inherit (lib)
    literalExpression
    mkEnableOption
    mkIf
    mkOption
    types
    ;

  cleanNulls =
    value:
    if builtins.isAttrs value then
      lib.filterAttrs (_: attrValue: attrValue != null) (
        lib.mapAttrs (_: attrValue: cleanNulls attrValue) value
      )
    else if builtins.isList value then
      map cleanNulls value
    else
      value;

  generatedConfig = cleanNulls {
    inherit (cfg)
      commandTimeoutMs
      desktopTarget
      deviceName
      displayProfiles
      dryRun
      host
      kscreenEnv
      kscreenUser
      port
      ;
  };

  configFile = pkgs.writeText "simple-remote-control-config.json" (
    builtins.toJSON generatedConfig
  );
in
{
  options.services.simple-remote-control = {
    enable = mkEnableOption "Simple Remote Control";

    package = mkOption {
      type = types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
      defaultText = literalExpression "simple-remote-control.packages.\${system}.default";
      description = "Package to run for the remote control service.";
    };

    host = mkOption {
      type = types.str;
      default = "0.0.0.0";
      description = "Address the webserver listens on.";
    };

    port = mkOption {
      type = types.port;
      default = 3000;
      description = "TCP port the webserver listens on.";
    };

    openFirewall = mkOption {
      type = types.bool;
      default = false;
      description = "Whether to open the configured TCP port in the NixOS firewall.";
    };

    deviceName = mkOption {
      type = types.str;
      default = "Gaming PC";
      description = "Display name shown in the frontend.";
    };

    desktopTarget = mkOption {
      type = types.str;
      default = "graphical-session.target";
      description = "Systemd target used to turn the desktop session on or off.";
    };

    commandTimeoutMs = mkOption {
      type = types.ints.positive;
      default = 12000;
      description = "Timeout for power, display, and EFI commands in milliseconds.";
    };

    dryRun = mkOption {
      type = types.bool;
      default = false;
      description = "Log commands without executing them.";
    };

    kscreenUser = mkOption {
      type = types.nullOr types.str;
      default = null;
      description = "Desktop user to run kscreen-doctor as. Leave null to run as root.";
    };

    kscreenEnv = mkOption {
      type = types.attrsOf types.str;
      default = { };
      example = {
        DISPLAY = ":0";
        XDG_RUNTIME_DIR = "/run/user/1000";
        DBUS_SESSION_BUS_ADDRESS = "unix:path=/run/user/1000/bus";
      };
      description = "Environment passed to kscreen-doctor.";
    };

    kscreenPackage = mkOption {
      type = types.package;
      default = pkgs.kdePackages.kscreen;
      defaultText = literalExpression "pkgs.kdePackages.kscreen";
      description = "Package providing kscreen-doctor.";
    };

    extraEnvironment = mkOption {
      type = types.attrsOf types.str;
      default = { };
      description = "Extra environment variables for the systemd service.";
    };

    displayProfiles = mkOption {
      type = types.listOf (
        types.submodule {
          options = {
            id = mkOption { type = types.str; };
            label = mkOption { type = types.str; };
            description = mkOption {
              type = types.nullOr types.str;
              default = null;
            };
            icon = mkOption {
              type = types.enum [
                "monitor"
                "tv"
                "cloud"
              ];
              default = "monitor";
            };
            accent = mkOption {
              type = types.enum [
                "green"
                "blue"
                "purple"
                "red"
                "gray"
              ];
              default = "gray";
            };
            primaryOutput = mkOption {
              type = types.nullOr types.str;
              default = null;
            };
            commandArgs = mkOption {
              type = types.listOf types.str;
              description = "Arguments passed after kscreen-doctor for this profile.";
            };
          };
        }
      );
      default = [
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
        {
          id = "virtual";
          label = "Virtual Display";
          icon = "cloud";
          accent = "gray";
          primaryOutput = "Virtual-1";
          commandArgs = [
            "output.Virtual-1.enable"
            "output.Virtual-1.primary"
            "output.DP-1.disable"
            "output.HDMI-A-1.disable"
          ];
        }
      ];
      description = "Display output profiles exposed in the frontend.";
    };
  };

  config = mkIf cfg.enable {
    systemd.services.simple-remote-control = {
      description = "Simple Remote Control";
      wantedBy = [ "multi-user.target" ];
      wants = [ "network-online.target" ];
      after = [ "network-online.target" ];

      path = [
        pkgs.systemd
        pkgs.efibootmgr
        pkgs.util-linux
        cfg.kscreenPackage
      ];

      environment = cfg.extraEnvironment // {
        NODE_ENV = "production";
        SRC_CONFIG = configFile;
      };

      serviceConfig = {
        Type = "simple";
        User = "root";
        ExecStart = lib.getExe cfg.package;
        Restart = "on-failure";
        RestartSec = "2s";
      };
    };

    networking.firewall.allowedTCPPorts = mkIf cfg.openFirewall [ cfg.port ];
  };
}
