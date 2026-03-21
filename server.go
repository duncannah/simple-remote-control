package main

import (
	"context"
	"errors"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os/exec"
	"strings"
	"time"
)

func runServer(cfg Config, commandMap map[string]CommandEntry) error {
	tpl, err := template.ParseFS(templateFS, "templates/index.html")
	if err != nil {
		return fmt.Errorf("unable to parse template: %w", err)
	}

	timeout := time.Duration(cfg.CommandTimeoutSeconds) * time.Second
	flashKey, err := newFlashKey()
	if err != nil {
		return fmt.Errorf("unable to initialize flash key: %w", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		level, message := popFlashMessage(w, r, flashKey)
		data := PageData{
			Categories: cfg.Categories,
			Level:      level,
			Message:    message,
		}

		if err := tpl.Execute(w, data); err != nil {
			log.Printf("template render failed: %v", err)
		}
	})

	mux.HandleFunc("/run", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		if err := r.ParseForm(); err != nil {
			redirectWithMessage(w, r, flashKey, "error", "invalid form payload")
			return
		}

		id := strings.TrimSpace(r.FormValue("id"))
		entry, ok := commandMap[id]
		if !ok {
			redirectWithMessage(w, r, flashKey, "error", "unknown command")
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), timeout)
		defer cancel()

		cmd := exec.CommandContext(ctx, "/bin/sh", "-c", entry.Command)
		output, err := cmd.CombinedOutput()
		outputText := compactOutput(output)

		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			msg := fmt.Sprintf("Command %q timed out after %s", entry.Label, timeout)
			log.Printf("%s", msg)
			redirectWithMessage(w, r, flashKey, "error", msg)
			return
		}

		if err != nil {
			msg := fmt.Sprintf("Command %q failed: %v", entry.Label, err)
			if outputText != "" {
				msg += " | output: " + outputText
			}
			log.Printf("command %q failed: %v output=%q", entry.ID, err, outputText)
			redirectWithMessage(w, r, flashKey, "error", msg)
			return
		}

		msg := fmt.Sprintf("Command %q finished successfully", entry.Label)
		if outputText != "" {
			msg += " | output: " + outputText
		}
		log.Printf("command %q completed", entry.ID)
		redirectWithMessage(w, r, flashKey, "ok", msg)
	})

	listenAddr := fmt.Sprintf("%s:%d", cfg.Bind, cfg.Port)
	log.Printf("Starting server on %s", listenAddr)
	return http.ListenAndServe(listenAddr, mux)
}

func compactOutput(out []byte) string {
	trimmed := strings.TrimSpace(string(out))
	if trimmed == "" {
		return ""
	}

	oneLine := strings.Join(strings.Fields(trimmed), " ")
	const maxLen = 200
	if len(oneLine) > maxLen {
		return oneLine[:maxLen] + "..."
	}
	return oneLine
}
