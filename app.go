package main

import (
	"bufio"
	"context"
	"github.com/go-boddhi/boddhi-feeds/pkg/db"
	"github.com/go-boddhi/boddhi-feeds/pkg/feed"
	"github.com/go-boddhi/boddhi-feeds/pkg/server"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx       context.Context
	database  *db.DB
	fetcher   *feed.Fetcher
	pwaServer *server.Server
	pwaPort   int
}

func NewApp(pwaPort int) *App {
	dbPath := os.Getenv("DIGITAL_GARDEN_DB")
	if dbPath == "" {
		userHome, err := os.UserHomeDir()
		if err == nil && userHome != "" {
			dbDir := filepath.Join(userHome, ".digital_garden")
			if err := os.MkdirAll(dbDir, 0755); err == nil {
				dbPath = filepath.Join(dbDir, "data.db")
			}
		}
	}
	if dbPath == "" {
		dbPath = filepath.Join(".", "data", "data.db")
	}

	database, err := db.NewDB(dbPath)
	if err != nil {
		fmt.Printf("Warning: fallback DB path used due to: %v\n", err)
		fallbackPath := filepath.Join(".", "data.db")
		database, _ = db.NewDB(fallbackPath)
	}

	var fetcher *feed.Fetcher
	var pwaServer *server.Server
	if database != nil {
		fetcher = feed.NewFetcher(database)
		pwaServer = server.NewPWAServer(database, fetcher, pwaPort, assetsFS)
	}

	return &App{
		database:  database,
		fetcher:   fetcher,
		pwaServer: pwaServer,
		pwaPort:   pwaPort,
	}
}

func (a *App) WindowMinimise() {
	if a.ctx != nil {
		runtime.WindowMinimise(a.ctx)
	}
}

func (a *App) WindowToggleMaximise() {
	if a.ctx != nil {
		runtime.WindowToggleMaximise(a.ctx)
	}
}

func (a *App) WindowClose() {
	if a.ctx != nil {
		runtime.Quit(a.ctx)
	}
}

func (a *App) GetPWAInfo() map[string]interface{} {
	if a.pwaServer != nil {
		return a.pwaServer.GetInfo()
	}
	return map[string]interface{}{
		"urls": []string{},
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if a.pwaServer != nil {
		go func() {
			if err := a.pwaServer.Start(); err != nil {
				runtime.LogErrorf(ctx, "Failed to start PWA embedded server: %v", err)
			}
		}()
	}

	if a.fetcher != nil {
		go func() {
			_ = a.fetcher.RefreshAllFeeds()
			runtime.EventsEmit(ctx, "feeds_updated", true)
		}()

		// Silent 15-minute background auto-refresh
		go func() {
			ticker := time.NewTicker(15 * time.Minute)
			defer ticker.Stop()
			for range ticker.C {
				_ = a.fetcher.RefreshAllFeeds()
				if a.ctx != nil {
					runtime.EventsEmit(a.ctx, "feeds_updated", true)
				}
			}
		}()
	}
}

func (a *App) shutdown(ctx context.Context) {
	if a.pwaServer != nil {
		a.pwaServer.Stop()
	}
	if a.database != nil {
		_ = a.database.Close()
	}
}

// Wails Bound Methods
func (a *App) ExtractFullArticle(itemID int64) (string, error) {
	if a.fetcher == nil {
		return "", fmt.Errorf("fetcher not initialized")
	}
	return a.fetcher.ExtractFullArticleForItem(itemID)
}

func (a *App) ExtractFullArticleByURL(urlStr string) (string, error) {
	if a.fetcher == nil {
		return "", fmt.Errorf("fetcher not initialized")
	}
	return a.fetcher.ExtractFullArticle(urlStr)
}

// Wails Bound Methods
func (a *App) AddFeed(inputURL string, category string, scope string) (*db.Feed, error) {
	if a.fetcher == nil {
		return nil, fmt.Errorf("fetcher not initialized")
	}
	feedEntry, err := a.fetcher.AddFeedFromInput(inputURL, category, scope)
	if err != nil {
		return nil, err
	}
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "feeds_updated", true)
	}
	return feedEntry, nil
}

func (a *App) GetFeeds() ([]db.Feed, error) {
	if a.database == nil {
		return []db.Feed{}, nil
	}
	return a.database.GetFeeds()
}

func (a *App) DeleteFeed(feedID int64) error {
	if a.database == nil {
		return nil
	}
	err := a.database.DeleteFeed(feedID)
	if err == nil && a.ctx != nil {
		runtime.EventsEmit(a.ctx, "feeds_updated", true)
	}
	return err
}

func (a *App) UpdateFeedTitle(feedID int64, newTitle string) error {
	if a.database == nil {
		return nil
	}
	err := a.database.UpdateFeedTitle(feedID, newTitle)
	if err == nil && a.ctx != nil {
		runtime.EventsEmit(a.ctx, "feeds_updated", true)
	}
	return err
}

func (a *App) GetItems(category string, feedID int64, filterType string, searchQuery string, limit int, offset int) ([]db.Item, error) {
	if a.database == nil {
		return []db.Item{}, nil
	}
	return a.database.GetItems(category, feedID, filterType, searchQuery, limit, offset)
}

func (a *App) ToggleRead(itemID int64, isRead bool) error {
	if a.database == nil {
		return nil
	}
	return a.database.ToggleRead(itemID, isRead)
}

func (a *App) MarkAllAsRead(feedID int64) error {
	if a.database == nil {
		return nil
	}
	err := a.database.MarkAllAsRead(feedID)
	if err == nil && a.ctx != nil {
		runtime.EventsEmit(a.ctx, "feeds_updated", true)
	}
	return err
}

func (a *App) ToggleBookmark(itemID int64) (bool, error) {
	if a.database == nil {
		return false, nil
	}
	return a.database.ToggleBookmark(itemID)
}

func (a *App) SaveGardenNote(itemID int64, noteMarkdown string, tags string) (*db.GardenNote, error) {
	if a.database == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	return a.database.SaveGardenNote(itemID, noteMarkdown, tags)
}

func (a *App) GetGardenNote(itemID int64) (*db.GardenNote, error) {
	if a.database == nil {
		return nil, nil
	}
	return a.database.GetGardenNoteByItemID(itemID)
}

func (a *App) GetAllGardenNotes() ([]db.GardenNote, error) {
	if a.database == nil {
		return []db.GardenNote{}, nil
	}
	return a.database.GetAllGardenNotes()
}

func (a *App) DeleteGardenNote(itemID int64) error {
	if a.database == nil {
		return nil
	}
	return a.database.DeleteGardenNote(itemID)
}

func (a *App) AddFilterRule(keyword string, action string, targetField string) (*db.FilterRule, error) {
	if a.database == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	return a.database.AddFilterRule(keyword, action, targetField)
}

func (a *App) GetFilterRules() ([]db.FilterRule, error) {
	if a.database == nil {
		return []db.FilterRule{}, nil
	}
	return a.database.GetFilterRules()
}

func (a *App) DeleteFilterRule(id int64) error {
	if a.database == nil {
		return nil
	}
	return a.database.DeleteFilterRule(id)
}

func (a *App) RefreshFeeds() error {
	if a.fetcher == nil {
		return nil
	}
	go func() {
		_ = a.fetcher.RefreshAllFeeds()
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "feeds_updated", true)
		}
	}()
	return nil
}

func (a *App) GetServerInfo() (map[string]interface{}, error) {
	return map[string]interface{}{
		"port": a.pwaPort,
	}, nil
}

func (a *App) OpenURL(urlStr string) {
	if a.ctx != nil {
		runtime.BrowserOpenURL(a.ctx, urlStr)
	}
}

// Queue API methods
func (a *App) AddURLToQueue(inputURL string) (*db.QueueItem, error) {
	if a.database == nil || a.fetcher == nil {
		return nil, fmt.Errorf("app not initialized")
	}
	meta, err := a.fetcher.FetchURLMetadata(inputURL)
	if err != nil {
		return nil, err
	}
	qItem, err := a.database.AddToQueue(nil, meta.URL, meta.Title, meta.Thumbnail, meta.ContentType, meta.Description)
	if err == nil && a.ctx != nil {
		runtime.EventsEmit(a.ctx, "queue_updated", true)
	}
	return qItem, err
}

func (a *App) AddItemToQueue(itemID int64) (*db.QueueItem, error) {
	if a.database == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	item, err := a.database.GetItemByID(itemID)
	if err != nil {
		return nil, err
	}
	cType := "article"
	if item.FeedType == "youtube" {
		cType = "youtube"
	}
	qItem, err := a.database.AddToQueue(&itemID, item.Link, item.Title, item.Thumbnail, cType, item.Snippet)
	if err == nil && a.ctx != nil {
		runtime.EventsEmit(a.ctx, "queue_updated", true)
	}
	return qItem, err
}

func (a *App) GetQueue(status string) ([]db.QueueItem, error) {
	if a.database == nil {
		return []db.QueueItem{}, nil
	}
	return a.database.GetQueue(status)
}

func (a *App) SetQueueStatus(id int64, status string) error {
	if a.database == nil {
		return nil
	}
	err := a.database.SetQueueStatus(id, status)
	if err == nil && a.ctx != nil {
		runtime.EventsEmit(a.ctx, "queue_updated", true)
	}
	return err
}

func (a *App) RemoveFromQueue(id int64) error {
	if a.database == nil {
		return nil
	}
	err := a.database.RemoveFromQueue(id)
	if err == nil && a.ctx != nil {
		runtime.EventsEmit(a.ctx, "queue_updated", true)
	}
	return err
}

// PDFResult holds base64-encoded PDF data and the filename
type PDFResult struct {
	Data     string `json:"data"`
	FileName string `json:"file_name"`
}

// OpenPDFFile shows a native file picker, reads the selected PDF, and returns it as base64
func (a *App) OpenPDFFile() (*PDFResult, error) {
	if a.ctx == nil {
		return nil, fmt.Errorf("app not started")
	}
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Open PDF Document",
		Filters: []runtime.FileFilter{
			{DisplayName: "PDF Documents (*.pdf)", Pattern: "*.pdf"},
		},
	})
	if err != nil {
		return nil, err
	}
	if filePath == "" {
		return nil, nil // user cancelled
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("could not read PDF: %w", err)
	}
	return &PDFResult{
		Data:     base64.StdEncoding.EncodeToString(data),
		FileName: filepath.Base(filePath),
	}, nil
}

type VoiceInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func findPiperBinary() string {
	if path, err := exec.LookPath("piper"); err == nil {
		return path
	}
	userHome, err := os.UserHomeDir()
	if err == nil {
		candidates := []string{
			filepath.Join(userHome, ".local", "share", "piper", "piper"),
			filepath.Join(userHome, ".local", "bin", "piper"),
			filepath.Join(userHome, "piper", "piper"),
		}
		for _, c := range candidates {
			if _, err := os.Stat(c); err == nil {
				return c
			}
		}
	}
	systemCandidates := []string{
		"/usr/local/bin/piper",
		"/usr/bin/piper",
		"/opt/piper/piper",
	}
	for _, c := range systemCandidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return ""
}

func findPiperVoiceModel(requestedVoice string) string {
	userHome, err := os.UserHomeDir()
	if err != nil {
		return ""
	}

	searchDirs := []string{
		filepath.Join(userHome, ".local", "share", "piper-voices"),
		filepath.Join(userHome, ".local", "share", "piper"),
		filepath.Join(userHome, ".config", "piper"),
	}

	if requestedVoice != "" {
		for _, dir := range searchDirs {
			modelPath := filepath.Join(dir, requestedVoice+".onnx")
			if _, err := os.Stat(modelPath); err == nil {
				return modelPath
			}
		}
	}

	preferred := []string{"en_US-lessac-high", "en_US-lessac-medium", "en_US-amy-medium", "en_US-mike-medium", "en_US-hfc_female-medium", "en_US-hfc_male-medium"}
	for _, pref := range preferred {
		for _, dir := range searchDirs {
			modelPath := filepath.Join(dir, pref+".onnx")
			if _, err := os.Stat(modelPath); err == nil {
				return modelPath
			}
		}
	}

	for _, dir := range searchDirs {
		matches, _ := filepath.Glob(filepath.Join(dir, "*.onnx"))
		if len(matches) > 0 {
			return matches[0]
		}
	}
	return ""
}

// GetAvailableVoices returns all installed Piper voice models across system directories
func (a *App) GetAvailableVoices() []VoiceInfo {
	userHome, err := os.UserHomeDir()
	if err != nil {
		return []VoiceInfo{{ID: "espeak", Name: "eSpeak NG (Default)"}}
	}

	searchDirs := []string{
		filepath.Join(userHome, ".local", "share", "piper-voices"),
		filepath.Join(userHome, ".local", "share", "piper"),
		filepath.Join(userHome, ".config", "piper"),
	}

	seen := make(map[string]bool)
	var voices []VoiceInfo

	for _, dir := range searchDirs {
		matches, err := filepath.Glob(filepath.Join(dir, "*.onnx"))
		if err != nil {
			continue
		}
		for _, m := range matches {
			base := filepath.Base(m)
			id := strings.TrimSuffix(base, ".onnx")
			if seen[id] {
				continue
			}
			seen[id] = true

			name := id
			parts := strings.Split(id, "-")
			if len(parts) >= 2 {
				voiceName := strings.Title(parts[1])
				if len(parts) >= 3 {
					quality := strings.Title(parts[2])
					name = fmt.Sprintf("%s (%s Neural)", voiceName, quality)
				} else {
					name = fmt.Sprintf("%s (Neural)", voiceName)
				}
			}
			voices = append(voices, VoiceInfo{ID: id, Name: name})
		}
	}

	if len(voices) == 0 {
		return []VoiceInfo{{ID: "espeak", Name: "eSpeak NG (Default)"}}
	}
	return voices
}

// GenerateSpeechAudio synthesizes text into base64 WAV audio using Piper TTS (with espeak-ng fallback)
func (a *App) GenerateSpeechAudio(text string, rate float64, voice string) (string, error) {
	if text == "" {
		return "", fmt.Errorf("empty text")
	}

	piperBin := findPiperBinary()
	piperModel := findPiperVoiceModel(voice)

	tmpFile, err := os.CreateTemp("", "vayu_tts_*.wav")
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()
	tmpFile.Close()
	defer os.Remove(tmpPath)

	if piperBin != "" && piperModel != "" {
		lengthScale := 1.0
		if rate > 0 {
			lengthScale = 1.0 / rate
		}
		if lengthScale < 0.3 {
			lengthScale = 0.3
		}
		if lengthScale > 2.5 {
			lengthScale = 2.5
		}

		cmd := exec.Command(piperBin, "--model", piperModel, "--output_file", tmpPath, "--length_scale", fmt.Sprintf("%.2f", lengthScale))
		cmd.Stdin = strings.NewReader(text)
		if err := cmd.Run(); err == nil {
			wavBytes, err := os.ReadFile(tmpPath)
			if err == nil && len(wavBytes) > 100 {
				encoded := base64.StdEncoding.EncodeToString(wavBytes)
				return "data:audio/wav;base64," + encoded, nil
			}
		}
	}

	// Fallback to espeak-ng if Piper is unavailable or fails
	wpm := 175
	if rate > 0 {
		wpm = int(175.0 * rate)
	}
	cmd := exec.Command("espeak-ng", "-s", fmt.Sprintf("%d", wpm), "-w", tmpPath, text)
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("audio generation failed: %w", err)
	}

	wavBytes, err := os.ReadFile(tmpPath)
	if err != nil {
		return "", fmt.Errorf("failed to read audio file: %w", err)
	}

	encoded := base64.StdEncoding.EncodeToString(wavBytes)
	return "data:audio/wav;base64," + encoded, nil
}

// Download API Methods
var (
	dlProgressRegex = regexp.MustCompile(`\[download\]\s+([0-9.]+)%\s+of\s+~?\s*([0-9.]+\s*\w+)\s+at\s+([0-9.]+\s*\w+/s)\s+ETA\s+([0-9:]+)`)
	dlDestRegex     = regexp.MustCompile(`\[download\]\s+Destination:\s+(.+)`)
	dlMergerRegex   = regexp.MustCompile(`\[Merger\]\s+Merging\s+formats\s+into\s+"(.+)"`)
)

func (a *App) StartVideoDownload(urlStr string, title string, thumbnail string, itemID *int64) (*db.DownloadItem, error) {
	if a.database == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	if urlStr == "" {
		return nil, fmt.Errorf("URL cannot be empty")
	}

	dlItem, err := a.database.AddDownload(itemID, urlStr, title, thumbnail)
	if err != nil {
		return nil, err
	}

	// Trigger async download task
	go a.runVideoDownload(dlItem.ID, urlStr, title)

	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "download_progress", dlItem)
	}

	return dlItem, nil
}

func (a *App) runVideoDownload(downloadID int64, urlStr string, title string) {
	userHome, err := os.UserHomeDir()
	if err != nil {
		userHome = "."
	}
	outputDir := filepath.Join(userHome, "Videos", "vayu_downloads")
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		a.database.UpdateDownloadProgress(downloadID, "failed", 0, "", "", "", fmt.Sprintf("failed to create directory: %v", err))
		if a.ctx != nil {
			if item, err := a.database.GetDownloadByID(downloadID); err == nil {
				runtime.EventsEmit(a.ctx, "download_progress", item)
			}
		}
		return
	}

	outTemplate := filepath.Join(outputDir, "%(title)s [%(id)s].%(ext)s")
	
	// Determine binary path: /home/alok/.local/bin/ytdwn or yt-dlp
	dlBinary := "yt-dlp"
	customYtdwn := filepath.Join(userHome, ".local", "bin", "ytdwn")
	if _, err := os.Stat(customYtdwn); err == nil {
		// Verify if ytdwn supports yt-dlp flags or pass URL directly
		dlBinary = "yt-dlp" // Default to reliable yt-dlp engine for structured stdout parsing
	}

	cmdArgs := []string{
		"-o", outTemplate,
		"--newline",
		"--no-check-certificate",
		"--ignore-errors",
		"-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
		"--merge-output-format", "mp4",
		urlStr,
	}

	cmd := exec.Command(dlBinary, cmdArgs...)
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		a.database.UpdateDownloadProgress(downloadID, "failed", 0, "", "", "", fmt.Sprintf("failed to start process stdout: %v", err))
		return
	}

	if err := cmd.Start(); err != nil {
		a.database.UpdateDownloadProgress(downloadID, "failed", 0, "", "", "", fmt.Sprintf("failed to execute downloader: %v", err))
		if a.ctx != nil {
			if item, err := a.database.GetDownloadByID(downloadID); err == nil {
				runtime.EventsEmit(a.ctx, "download_progress", item)
			}
		}
		return
	}

	scanner := bufio.NewScanner(stdoutPipe)
	var finalFilePath string
	var currentPct int

	for scanner.Scan() {
		line := scanner.Text()

		// Match Destination
		if matches := dlDestRegex.FindStringSubmatch(line); len(matches) > 1 {
			finalFilePath = strings.TrimSpace(matches[1])
		}
		if matches := dlMergerRegex.FindStringSubmatch(line); len(matches) > 1 {
			finalFilePath = strings.TrimSpace(matches[1])
		}

		// Match Progress
		if matches := dlProgressRegex.FindStringSubmatch(line); len(matches) >= 5 {
			pct, _ := strconv.ParseFloat(matches[1], 64)
			currentPct = int(pct)
			speedStr := matches[3]
			etaStr := matches[4]

			_ = a.database.UpdateDownloadProgress(downloadID, "downloading", currentPct, speedStr, etaStr, finalFilePath, "")
			if a.ctx != nil {
				if item, err := a.database.GetDownloadByID(downloadID); err == nil {
					runtime.EventsEmit(a.ctx, "download_progress", item)
				}
			}
		}
	}

	if err := cmd.Wait(); err != nil {
		_ = a.database.UpdateDownloadProgress(downloadID, "failed", currentPct, "", "", finalFilePath, err.Error())
	} else {
		_ = a.database.UpdateDownloadProgress(downloadID, "completed", 100, "Done", "00:00", finalFilePath, "")
	}

	if a.ctx != nil {
		if item, err := a.database.GetDownloadByID(downloadID); err == nil {
			runtime.EventsEmit(a.ctx, "download_progress", item)
		}
	}
}

func (a *App) GetDownloads() ([]db.DownloadItem, error) {
	if a.database == nil {
		return []db.DownloadItem{}, nil
	}
	return a.database.GetDownloads()
}

func (a *App) DeleteDownload(id int64, deleteFile bool) error {
	if a.database == nil {
		return nil
	}
	if deleteFile {
		if item, err := a.database.GetDownloadByID(id); err == nil && item.FilePath != "" {
			_ = os.Remove(item.FilePath)
		}
	}
	err := a.database.DeleteDownload(id)
	if err == nil && a.ctx != nil {
		runtime.EventsEmit(a.ctx, "download_updated", true)
	}
	return err
}

func (a *App) OpenDownloadedFile(filePath string) error {
	if filePath == "" {
		return fmt.Errorf("file path is empty")
	}
	return exec.Command("xdg-open", filePath).Start()
}

func (a *App) OpenDownloadFolder(filePath string) error {
	targetDir := filepath.Dir(filePath)
	if filePath == "" || targetDir == "." {
		userHome, _ := os.UserHomeDir()
		targetDir = filepath.Join(userHome, "Videos", "vayu_downloads")
	}
	return exec.Command("xdg-open", targetDir).Start()
}

func (a *App) PlayInMPV(urlStr string) error {
	if urlStr == "" {
		return fmt.Errorf("URL cannot be empty")
	}
	// 1. Native MPV
	if _, err := exec.LookPath("mpv"); err == nil {
		return exec.Command("mpv", "--force-window=immediate", "--title=Vayu Media Player", "--ytdl-format=bestvideo[height<=1080]+bestaudio/best[height<=1080]/best", urlStr).Start()
	}
	// 2. Flatpak MPV
	if err := exec.Command("flatpak", "info", "io.mpv.Mpv").Run(); err == nil {
		return exec.Command("flatpak", "run", "io.mpv.Mpv", urlStr).Start()
	}
	// 3. Native VLC
	if _, err := exec.LookPath("vlc"); err == nil {
		return exec.Command("vlc", urlStr).Start()
	}
	// 4. Flatpak VLC
	if err := exec.Command("flatpak", "info", "org.videolan.VLC").Run(); err == nil {
		return exec.Command("flatpak", "run", "org.videolan.VLC", urlStr).Start()
	}
	// 5. Native / Flatpak Celluloid
	if _, err := exec.LookPath("celluloid"); err == nil {
		return exec.Command("celluloid", urlStr).Start()
	}
	if err := exec.Command("flatpak", "info", "io.github.celluloid_player.Celluloid").Run(); err == nil {
		return exec.Command("flatpak", "run", "io.github.celluloid_player.Celluloid", urlStr).Start()
	}

	return fmt.Errorf("No native player (MPV/VLC) found. Please install mpv: 'sudo dnf install mpv'")
}
