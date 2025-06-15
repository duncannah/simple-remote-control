#include <mongoose.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "efi.h"
#include "embed.h"

const char *html_headers =
	"Content-Type: text/html\r\n"
	"Cache-Control: no-cache, no-store, must-revalidate\r\n"
	"Pragma: no-cache\r\n"
	"Expires: 0\r\n";

// Constants to be loaded during runtime
char hostname[256];
struct boot_order boot_order = {0};
char *boot_picker_html = NULL;

struct boot_item *find_boot_item(const char *id) {
	for (size_t i = 0; i < boot_order.item_count; i++) {
		if (strncmp(boot_order.items[i].id, id, 4) == 0) {
			return &boot_order.items[i];
		}
	}
	return NULL;
}

void load_boot_picker_html() {
	get_boot_order(&boot_order);

	char start[] =
		"<form method=\"POST\">"
		"<fieldset>"
		"<legend>UEFI Boot Entries</legend>";
	char end[] =
		"<div class=\"field-row\">"
		"<button type=\"submit\" name=\"action\" value=\"next_boot\">Boot "
		"selected next time</button>"
		"</div>"
		"</fieldset>"
		"</form>";
	size_t template_size = sizeof(start) + sizeof(end) - 1;

	boot_picker_html = realloc(boot_picker_html, template_size);

	strcpy(boot_picker_html, start);

	size_t options_size = 0;

	struct boot_item *next =
		boot_order.next ? boot_order.next : boot_order.current;

	for (size_t i = 0; i < boot_order.item_count; i++) {
		struct boot_item *item = &boot_order.items[i];
		const char *checked = item == next ? "checked" : "";
		const char *disabled = item->is_enabled ? "" : "disabled";

		char option[512];
		snprintf(option, sizeof(option),
				 "<div class=\"field-row\">"
				 "<input type=\"radio\" name=\"boot_selected\" value=\"%4.4s\" "
				 "id=\"%4.4s\" %s %s>"
				 "<label for=\"%4.4s\">%s</label>"
				 "</div>",

				 item->id, item->id, checked, disabled, item->id, item->name);

		options_size += strlen(option);

		boot_picker_html =
			realloc(boot_picker_html, template_size + options_size + 1);
		strcat(boot_picker_html, option);
	}

	strcat(boot_picker_html, end);
}

static void fn(struct mg_connection *c, int ev, void *ev_data) {
	if (ev != MG_EV_HTTP_MSG) return;

	struct mg_http_message *hm = (struct mg_http_message *)ev_data;

	if (!mg_match(hm->uri, mg_str("/"), NULL)) {
		mg_http_reply(c, 404, "", "");
		return;
	}

	char *message = NULL;

	if (hm->body.len > 0) {
		struct mg_str action, boot_selected = {0};
		struct mg_str entry, key, val;
		while (mg_span(hm->body, &entry, &hm->body, '&')) {
			mg_span(entry, &key, &val, '=');
			if (mg_match(key, mg_str("action"), NULL)) {
				action = val;
			} else if (mg_match(key, mg_str("boot_selected"), NULL)) {
				boot_selected = val;
			} else {
				printf("Unknown parameter: %.*s\n", (int)key.len, key.buf);
			}
		}

		if (mg_match(action, mg_str("shutdown"), NULL)) {
			int res = system("shutdown -h now");
			asprintf(&message,
					 res == 0 ? "Shutting down..." : "Failed to shut down.");
		} else if (mg_match(action, mg_str("reboot"), NULL)) {
			int res = system("reboot");
			asprintf(&message, res == 0 ? "Rebooting..." : "Failed to reboot.");
		} else if (mg_match(action, mg_str("next_boot"), NULL)) {
			if (boot_selected.len == 4) {
				struct boot_item *selected = find_boot_item(boot_selected.buf);

				char cmd[256];
				snprintf(cmd, sizeof(cmd), "efibootmgr -n %.*s",
						 (int)boot_selected.len, boot_selected.buf);
				int res = system(cmd);
				if (res == 0) {
					asprintf(&message,
							 "Next boot set successfully to "
							 "<strong>%s</strong>.",
							 selected->name);
					load_boot_picker_html();
				} else {
					asprintf(&message, "Failed to set next boot entry: %d",
							 res);
				}
			} else {
				asprintf(&message, "No boot entry selected.");
			}
		} else {
			printf("Unknown action: %.*s\n", (int)action.len, action.buf);
		}
	}

	if (message) {
		mg_http_reply(c, 200, html_headers,
					  "%s"
					  "<meta http-equiv=\"refresh\" content=\"5; url=/\">"
					  "<p>%s</p>"
					  "%s",
					  template_start_html, message, template_end_html);
	} else {
		mg_http_reply(c, 200, html_headers,
					  "%s\n"
					  "<p>You're now controlling <strong>%s</strong>.</p>\n"
					  "%s\n"
					  "%s\n"
					  "%s",

					  template_start_html, hostname, main_html,
					  boot_picker_html, template_end_html);
	}

	free(message);
}

static int s_signo;
static void signal_handler(int signo) { s_signo = signo; }

int main(int argc, char *argv[]) {
	if (geteuid() != 0) {
		fprintf(stderr, "Error: This program must be run as root.\n");
		exit(EXIT_FAILURE);
	}

	char listen_addr[sizeof("http://0.0.0.0:65535")];
	int port = argc > 1 ? atoi(argv[1]) : 3000;
	if (port <= 0 || port > 65535) {
		fprintf(stderr,
				"Error: Invalid port number. Must be between 1 and 65535.\n");
		exit(EXIT_FAILURE);
	}
	sprintf(listen_addr, "http://0.0.0.0:%d", port);

	signal(SIGINT, signal_handler);
	signal(SIGTERM, signal_handler);

	gethostname(hostname, sizeof(hostname));
	hostname[sizeof(hostname) - 1] = '\0';

	load_boot_picker_html();

	struct mg_mgr mgr;
	mg_mgr_init(&mgr);
	mg_http_listen(&mgr, listen_addr, fn, NULL);

	printf("Server started on %s\n", listen_addr);

	while (s_signo == 0) mg_mgr_poll(&mgr, 1000);

	mg_mgr_free(&mgr);

	free_boot_order(&boot_order);

	free(boot_picker_html);

	return 0;
}
