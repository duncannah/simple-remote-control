package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
)

func loadConfig(path string) (Config, map[string]CommandEntry, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return Config{}, nil, err
	}

	var cfg Config
	if err := json.Unmarshal(content, &cfg); err != nil {
		return Config{}, nil, err
	}

	if cfg.Bind == "" {
		cfg.Bind = "0.0.0.0"
	}
	if cfg.Port < 1 || cfg.Port > 65535 {
		return Config{}, nil, fmt.Errorf("invalid port %d", cfg.Port)
	}
	if cfg.CommandTimeoutSeconds <= 0 {
		cfg.CommandTimeoutSeconds = 30
	}
	if len(cfg.Categories) == 0 {
		return Config{}, nil, errors.New("at least one category is required")
	}

	commandMap := make(map[string]CommandEntry)

	for i := range cfg.Categories {
		cat := &cfg.Categories[i]
		cat.Name = strings.TrimSpace(cat.Name)
		if cat.Name == "" {
			return Config{}, nil, errors.New("category name cannot be empty")
		}
		if len(cat.Commands) == 0 {
			return Config{}, nil, fmt.Errorf("category %q must contain at least one command", cat.Name)
		}

		for j := range cat.Commands {
			entry := &cat.Commands[j]
			entry.ID = strings.TrimSpace(entry.ID)
			entry.Label = strings.TrimSpace(entry.Label)
			entry.Command = strings.TrimSpace(entry.Command)

			if entry.ID == "" {
				return Config{}, nil, fmt.Errorf("category %q has command with empty id", cat.Name)
			}
			if entry.Label == "" {
				return Config{}, nil, fmt.Errorf("command %q must have a label", entry.ID)
			}
			if entry.Command == "" {
				return Config{}, nil, fmt.Errorf("command %q must have a command", entry.ID)
			}
			if _, exists := commandMap[entry.ID]; exists {
				return Config{}, nil, fmt.Errorf("duplicate command id %q", entry.ID)
			}

			commandMap[entry.ID] = *entry
		}
	}

	return cfg, commandMap, nil
}
