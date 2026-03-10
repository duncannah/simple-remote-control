{
  description = "simple-remote-control";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      lib = nixpkgs.lib;
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = lib.genAttrs systems;
    in
    {
      packages = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.stdenv.mkDerivation {
            pname = "simple-remote-control";
            version = "0.1.0";

            src = lib.cleanSource ./.;

            nativeBuildInputs = [ pkgs.gnumake ];

            installPhase = ''
              runHook preInstall
              install -Dm755 simple-remote-control $out/bin/simple-remote-control
              runHook postInstall
            '';

            meta = with lib; {
              description = "Simple web remote control for shutdown/reboot and UEFI next boot";
              license = licenses.gpl2Only;
              mainProgram = "simple-remote-control";
              platforms = platforms.linux;
            };
          };
        }
      );

      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/simple-remote-control";
        };
      });

      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              gcc
              gnumake
              efibootmgr
            ];
          };
        }
      );

      nixosModules.default = { config, lib, pkgs, ... }:
        let
          cfg = config.services.simple-remote-control;
        in
        {
          options.services.simple-remote-control = {
            enable = lib.mkEnableOption "simple-remote-control service";

            port = lib.mkOption {
              type = lib.types.port;
              default = 3000;
              description = "Port used by simple-remote-control.";
            };

            openFirewall = lib.mkOption {
              type = lib.types.bool;
              default = true;
              description = "Whether to open the configured port in the firewall.";
            };
          };

          config = lib.mkIf cfg.enable {
            networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [ cfg.port ];

            systemd.services.simple-remote-control = {
              description = "Simple Remote Control Service";
              wantedBy = [ "multi-user.target" ];
              after = [ "network.target" ];
              wants = [ "network.target" ];
              path = with pkgs; [
                efibootmgr
                systemd
                util-linux
                coreutils
              ];
              serviceConfig = {
                Type = "simple";
                ExecStart = "${self.packages.${pkgs.system}.default}/bin/simple-remote-control ${toString cfg.port}";
                Restart = "on-failure";
                User = "root";
              };
            };
          };
        };
    };
}
