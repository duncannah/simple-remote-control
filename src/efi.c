#include "efi.h"

#include <regex.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static regex_t prepare_regex(const char *pattern) {
	regex_t regex;

	if (regcomp(&regex, pattern, REG_EXTENDED) != 0) {
		fprintf(stderr, "Could not compile regex: %s\n", pattern);
		exit(EXIT_FAILURE);
	}

	return regex;
}

void get_boot_order(struct boot_order *order) {
	order->items = NULL;
	order->item_count = 0;
	order->current = NULL;
	order->next = NULL;

	regex_t current_boot_regex = prepare_regex("^BootCurrent: ([0-9A-F]{4})");
	regex_t next_boot_regex = prepare_regex("^BootNext: ([0-9A-F]{4})");
	regex_t boot_entry_regex =
		prepare_regex("^Boot([0-9A-F]{4})(\\*?) (.+?)\t");

	FILE *fp = popen("efibootmgr", "r");
	if (!fp) {
		perror("popen");
		return;
	}

	char current_id[4] = {0};
	char next_id[4] = {0};
	size_t current_index = 0;
	size_t next_index = 0;

	char line[128];
	regmatch_t pmatch[4];
	while (fgets(line, sizeof(line), fp) != NULL) {
		if (regexec(&current_boot_regex, line, 2, pmatch, 0) == 0) {
			memcpy(current_id, line + pmatch[1].rm_so, 4);
		} else if (regexec(&next_boot_regex, line, 2, pmatch, 0) == 0) {
			memcpy(next_id, line + pmatch[1].rm_so, 4);
		} else if (regexec(&boot_entry_regex, line, 4, pmatch, 0) == 0) {
			const char *id = line + pmatch[1].rm_so;

			order->items = realloc(order->items, sizeof(struct boot_item) *
													 (order->item_count + 1));

			order->items[order->item_count] =
				(struct boot_item){.id = {0},
								   .is_enabled = (line[pmatch[2].rm_so] == '*'),
								   .name = NULL};
			memcpy(order->items[order->item_count].id, id, 4);

			order->items[order->item_count].name = strndup(
				line + pmatch[3].rm_so, pmatch[3].rm_eo - pmatch[3].rm_so);

			if (strncmp(id, current_id, 4) == 0) {
				current_index = order->item_count;
			}

			if (strncmp(id, next_id, 4) == 0) {
				next_index = order->item_count;
			}

			order->item_count++;
		}
	}

	if (order->item_count > 0) {
		if (current_id[0] != '\0') {
			order->current = &order->items[current_index];
		}
		if (next_id[0] != '\0') {
			order->next = &order->items[next_index];
		}
	} else {
		order->current = NULL;
		order->next = NULL;
	}

	regfree(&current_boot_regex);
	regfree(&next_boot_regex);
	regfree(&boot_entry_regex);
	pclose(fp);
}

void free_boot_order(struct boot_order *order) {
	if (order->items) {
		for (size_t i = 0; i < order->item_count; i++) {
			free(order->items[i].name);
		}
		free(order->items);
	}
}