import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import type { ApiMessage } from "../shared/types";
import { loadConfig } from "./config";
import { ControlService } from "./system";

const config = loadConfig();
const service = new ControlService(config);
const app = new Hono();

app.use("/api/*", cors());
app.use("/api/*", logger());

app.get("/api/status", async (c) => c.json(await service.status()));
app.get("/api/activity", (c) => c.json(service.activity()));

app.post("/api/desktop", async (c) => {
  const body = await c.req.json().catch(() => undefined);
  if (!body || typeof body.enabled !== "boolean") {
    return c.json<ApiMessage>({ ok: false, message: "Body must include enabled." }, 400);
  }

  const result = await service.setDesktop(body.enabled);
  return c.json<ApiMessage>(
    {
      ok: result.ok,
      message: result.ok ? "Desktop power updated." : result.stderr || "Command failed.",
      status: await service.status()
    },
    result.ok ? 200 : 500
  );
});

app.post("/api/control/:id", async (c) => {
  const body = await c.req.json().catch(() => undefined);
  if (!body || typeof body.enabled !== "boolean") {
    return c.json<ApiMessage>({ ok: false, message: "Body must include enabled." }, 400);
  }

  const result = await service.setBooleanControl(c.req.param("id"), body.enabled);
  return c.json<ApiMessage>(
    {
      ok: result.ok,
      message: result.ok ? "Control updated." : result.stderr || "Command failed.",
      status: await service.status()
    },
    result.ok ? 200 : 500
  );
});

app.post("/api/display", async (c) => {
  const body = await c.req.json().catch(() => undefined);
  if (!body || typeof body.profileId !== "string") {
    return c.json<ApiMessage>({ ok: false, message: "Body must include profileId." }, 400);
  }

  const result = await service.switchDisplay(body.profileId);
  return c.json<ApiMessage>(
    {
      ok: result.ok,
      message: result.ok ? "Display profile updated." : result.stderr || "Command failed.",
      status: await service.status()
    },
    result.ok ? 200 : 500
  );
});

app.post("/api/system", async (c) => {
  const body = await c.req.json().catch(() => undefined);
  if (!body || (body.action !== "reboot" && body.action !== "shutdown")) {
    return c.json<ApiMessage>({ ok: false, message: "Body must include action." }, 400);
  }

  const result = await service.systemAction(body.action);
  return c.json<ApiMessage>(
    {
      ok: result.ok,
      message: result.ok ? "System action started." : result.stderr || "Command failed."
    },
    result.ok ? 200 : 500
  );
});

app.post("/api/boot/next", async (c) => {
  const body = await c.req.json().catch(() => undefined);
  if (!body || typeof body.bootId !== "string") {
    return c.json<ApiMessage>({ ok: false, message: "Body must include bootId." }, 400);
  }

  const result = await service.setBootNext(body.bootId, body.reboot !== false);
  return c.json<ApiMessage>(
    {
      ok: result.ok,
      message: result.ok ? "BootNext updated." : result.stderr || "Command failed.",
      status: result.ok ? await service.status() : undefined
    },
    result.ok ? 200 : 500
  );
});

app.post("/api/boot/default", async (c) => {
  const body = await c.req.json().catch(() => undefined);
  if (!body || typeof body.bootId !== "string") {
    return c.json<ApiMessage>({ ok: false, message: "Body must include bootId." }, 400);
  }

  const result = await service.setDefaultBoot(body.bootId);
  return c.json<ApiMessage>(
    {
      ok: result.ok,
      message: result.ok ? "Default boot order updated." : result.stderr || "Command failed.",
      status: result.ok ? await service.status() : undefined
    },
    result.ok ? 200 : 500
  );
});

// Set the public URL base while the proxy strips it from incoming requests.
app.use("*", async (c, next) => {
  await next();
  if (c.res.headers.get("Content-Type")?.includes("text/html")) {
    const html = (await c.res.text()).replace(
      "<head>",
      `<head><base href="${config.basePath}">`
    );
    const headers = new Headers(c.res.headers);
    headers.delete("Content-Length");
    c.res = new Response(html, { status: c.res.status, headers });
  }
});

app.use("*", serveStatic({ root: "./dist" }));
app.get("*", async (c) => {
  const index = Bun.file("./dist/index.html");
  if (!(await index.exists())) {
    return c.text("Build the frontend with `bun run build` before starting the server.", 503);
  }

  return c.html(await index.text());
});

Bun.serve({
  port: config.port,
  hostname: config.host,
  fetch: app.fetch
});

console.log(`Remote control listening on http://${config.host}:${config.port}`);
