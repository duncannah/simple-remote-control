#ifndef EFI_H
#define EFI_H

#include <stdbool.h>
#include <stddef.h>

struct boot_item {
	char id[4];
	bool is_enabled;
	char *name;
};

struct boot_order {
	struct boot_item *items;
	size_t item_count;
	struct boot_item *current;
	struct boot_item *next;
};

void get_boot_order(struct boot_order *order);
void free_boot_order(struct boot_order *order);

#endif	// EFI_H
