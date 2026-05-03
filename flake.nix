{
  description = "Mobile-first Linux remote control for desktop, display, and EFI boot actions";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          simple-remote-control = pkgs.callPackage ./nix/package.nix { };
          default = self.packages.${system}.simple-remote-control;
        }
      );

      apps = forAllSystems (system: {
        simple-remote-control = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/simple-remote-control";
        };
        default = self.apps.${system}.simple-remote-control;
      });

      nixosModules.simple-remote-control = import ./nix/module.nix { inherit self; };
      nixosModules.default = self.nixosModules.simple-remote-control;
    };
}
