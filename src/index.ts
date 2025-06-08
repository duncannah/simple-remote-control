import { $ } from "bun";
import os from "node:os";

import template from "./template.html" with { type: "text" };
import indexPage from "./index.html" with { type: "text" };

const PORT = process.env.PORT || 3000;

const globalVars = {
	hostname: os.hostname(),
};

const applyTemplate = (content: string): string => {
	return template
		.replace("{{content}}", content)
		.replace(/{{(\w+)}}/g, (_: any, key: keyof typeof globalVars) => {
			return globalVars[key] || `{{${key}}}`;
		});
};

const htmlResponse = (content: string): Response => {
	return new Response(applyTemplate(content), {
		headers: {
			"Content-Type": "text/html",
			"Cache-Control": "no-cache",
		},
	});
};

const user = (await $`whoami`.text()).trim();
if (user !== "root") {
	throw new Error(
		"Server must be run as root to perform shutdown or reboot actions. User: " + user
	);
}

const server = Bun.serve({
	port: PORT,
	routes: {
		"/": {
			GET: () => htmlResponse(indexPage),
			POST: async (req) => {
				const formData = await req.formData();
				const action = formData.get("action") as string;

				if (action === "shutdown") {
					$`shutdown -h now`;
					return htmlResponse("<blockquote>Server is shutting down...</blockquote>");
				} else if (action === "reboot") {
					$`reboot`;
					return htmlResponse("<blockquote>Server is rebooting...</blockquote>");
				} else {
					return htmlResponse(
						"<blockquote>Unknown action. Please try again.</blockquote>"
					);
				}
			},
		},
	},
});

console.log(`Server is running on ${server.url}`);
