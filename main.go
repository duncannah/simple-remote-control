package main

import (
	"flag"
	"log"
)

func main() {
	configPath := flag.String("config", "", "Path to JSON configuration file")
	flag.Parse()

	if *configPath == "" {
		log.Fatal("missing required -config flag")
	}

	cfg, commandMap, err := loadConfig(*configPath)
	if err != nil {
		log.Fatalf("unable to load config: %v", err)
	}

	if err := runServer(cfg, commandMap); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
