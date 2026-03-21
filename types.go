package main

import "embed"

type Config struct {
	Bind                  string     `json:"bind"`
	Port                  int        `json:"port"`
	CommandTimeoutSeconds int        `json:"command_timeout_seconds"`
	Categories            []Category `json:"categories"`
}

type Category struct {
	Name     string         `json:"name"`
	Commands []CommandEntry `json:"commands"`
}

type CommandEntry struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	Command string `json:"command"`
}

type PageData struct {
	Categories []Category
	Level      string
	Message    string
}

const flashCookieName = "flash"

//go:embed templates/index.html
var templateFS embed.FS
