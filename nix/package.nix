{
  lib,
  buildNpmPackage,
  bun,
  makeWrapper,
}:

buildNpmPackage rec {
  pname = "simple-remote-control";
  version = "0.1.0";

  src = lib.cleanSourceWith {
    src = ../.;
    filter =
      path: type:
      let
        name = baseNameOf path;
      in
      !(
        name == ".git"
        || name == "node_modules"
        || name == "dist"
        || name == "remote-control.config.json"
        || name == ".DS_Store"
        || lib.hasSuffix ".log" name
      );
  };

  npmDepsHash = "sha256-B6pscTKY73yfJSdJS8JcQy8EqKrXcZy/YTdD6zgPdg0=";

  npmFlags = [ "--ignore-scripts" ];

  nativeBuildInputs = [
    bun
    makeWrapper
  ];

  buildPhase = ''
    runHook preBuild

    npm run build
    bun build src/server/index.ts --target=bun --outfile=server.js

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    install -Dm644 server.js $out/lib/simple-remote-control/server.js
    cp -R dist $out/lib/simple-remote-control/dist

    makeWrapper ${lib.getExe bun} $out/bin/simple-remote-control \
      --run "cd $out/lib/simple-remote-control" \
      --add-flags "$out/lib/simple-remote-control/server.js"

    runHook postInstall
  '';

  meta = {
    description = "Mobile-first web remote control for a Linux gaming PC";
    homepage = "https://github.com/local/simple-remote-control";
    license = lib.licenses.mit;
    mainProgram = "simple-remote-control";
    platforms = lib.platforms.unix;
  };
}
