package server

import (
	"context"
	"github.com/go-boddhi/boddhi-feeds/pkg/db"
	"github.com/go-boddhi/boddhi-feeds/pkg/feed"
	"encoding/json"
	"os/exec"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"strconv"
	"time"
)

type Server struct {
	database   *db.DB
	fetcher    *feed.Fetcher
	port       int
	assetsFS   fs.FS
	httpServer *http.Server
}

func NewPWAServer(database *db.DB, fetcher *feed.Fetcher, port int, assetsFS fs.FS) *Server {
	return &Server{
		database: database,
		fetcher:  fetcher,
		port:     port,
		assetsFS: assetsFS,
	}
}

func (s *Server) Start() error {
	mux := http.NewServeMux()

	// API Endpoints
	mux.HandleFunc("/api/info", s.handleInfo)
	mux.HandleFunc("/api/feeds", s.handleFeeds)
	mux.HandleFunc("/api/feeds/delete", s.handleDeleteFeed)
	mux.HandleFunc("/api/feeds/update-title", s.handleUpdateFeedTitle)
	mux.HandleFunc("/api/items", s.handleItems)
	mux.HandleFunc("/api/items/extract", s.handleExtractFullArticle)
	mux.HandleFunc("/api/items/read", s.handleToggleRead)
	mux.HandleFunc("/api/items/mark-all-read", s.handleMarkAllRead)
	mux.HandleFunc("/api/items/bookmark", s.handleToggleBookmark)
	mux.HandleFunc("/api/notes", s.handleNotes)
	mux.HandleFunc("/api/refresh", s.handleRefresh)
	mux.HandleFunc("/api/filters", s.handleFilters)
	mux.HandleFunc("/api/filters/delete", s.handleDeleteFilter)
	mux.HandleFunc("/api/video/embed", s.handleVideoEmbed)
	mux.HandleFunc("/api/video/mpv", s.handleVideoMPV)
	mux.HandleFunc("/api/queue", s.handleQueue)
	mux.HandleFunc("/api/queue/add-url", s.handleAddURLToQueue)
	mux.HandleFunc("/api/queue/add-item", s.handleAddItemToQueue)
	mux.HandleFunc("/api/queue/status", s.handleSetQueueStatus)
	mux.HandleFunc("/api/queue/delete", s.handleDeleteQueue)

	// Static Files (Embedded PWA Assets)
	if s.assetsFS != nil {
		subFS, err := fs.Sub(s.assetsFS, "frontend")
		if err == nil {
			mux.Handle("/", http.FileServer(http.FS(subFS)))
		} else {
			mux.Handle("/", http.FileServer(http.FS(s.assetsFS)))
		}
	}

	addr := fmt.Sprintf(":%d", s.port)
	s.httpServer = &http.Server{
		Addr:    addr,
		Handler: mux,
	}
	go func() {
		if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("PWA Server error: %v", err)
		}
	}()

	return nil
}

func (s *Server) Stop() {
	if s.httpServer != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = s.httpServer.Shutdown(ctx)
	}
}

func (s *Server) GetInfo() map[string]interface{} {
	ips := getLocalIPs()
	resp := map[string]interface{}{
		"port":      s.port,
		"local_ips": ips,
		"urls":      []string{},
	}

	for _, ip := range ips {
		resp["urls"] = append(resp["urls"].([]string), fmt.Sprintf("http://%s:%d", ip, s.port))
	}

	return resp
}

func (s *Server) handleInfo(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, s.GetInfo())
}

func (s *Server) handleFeeds(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var req struct {
			URL      string `json:"url"`
			Category string `json:"category"`
			Scope    string `json:"scope"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		feedEntry, err := s.fetcher.AddFeedFromInput(req.URL, req.Category, req.Scope)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		jsonResponse(w, feedEntry)
		return
	}

	feeds, err := s.database.GetFeeds()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, feeds)
}

func (s *Server) handleDeleteFeed(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := s.database.DeleteFeed(req.ID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]bool{"success": true})
}

func (s *Server) handleUpdateFeedTitle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ID    int64  `json:"id"`
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == 0 || req.Title == "" {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := s.database.UpdateFeedTitle(req.ID, req.Title); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]bool{"success": true})
}

func (s *Server) handleItems(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("category")
	filterType := r.URL.Query().Get("filter")
	searchQuery := r.URL.Query().Get("q")
	feedID, _ := strconv.ParseInt(r.URL.Query().Get("feed_id"), 10, 64)
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	items, err := s.database.GetItems(category, feedID, filterType, searchQuery, limit, offset)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, items)
}

func (s *Server) handleExtractFullArticle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ItemID int64  `json:"item_id"`
		URL    string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	var fullHTML string
	var err error
	if req.ItemID > 0 {
		fullHTML, err = s.fetcher.ExtractFullArticleForItem(req.ItemID)
	} else if req.URL != "" {
		fullHTML, err = s.fetcher.ExtractFullArticle(req.URL)
	} else {
		http.Error(w, "missing item_id or url", http.StatusBadRequest)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]interface{}{"content": fullHTML})
}

func (s *Server) handleToggleRead(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ItemID int64 `json:"item_id"`
		IsRead bool  `json:"is_read"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := s.database.ToggleRead(req.ItemID, req.IsRead); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]bool{"success": true})
}

func (s *Server) handleMarkAllRead(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		FeedID int64 `json:"feed_id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if err := s.database.MarkAllAsRead(req.FeedID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]bool{"success": true})
}

func (s *Server) handleToggleBookmark(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ItemID int64 `json:"item_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	newVal, err := s.database.ToggleBookmark(req.ItemID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]bool{"is_bookmarked": newVal})
}

func (s *Server) handleNotes(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var req struct {
			ItemID       int64  `json:"item_id"`
			NoteMarkdown string `json:"note_markdown"`
			Tags         string `json:"tags"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		note, err := s.database.SaveGardenNote(req.ItemID, req.NoteMarkdown, req.Tags)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		jsonResponse(w, note)
		return
	}

	itemIDStr := r.URL.Query().Get("item_id")
	if itemIDStr != "" {
		itemID, _ := strconv.ParseInt(itemIDStr, 10, 64)
		note, err := s.database.GetGardenNoteByItemID(itemID)
		if err != nil {
			jsonResponse(w, nil)
			return
		}
		jsonResponse(w, note)
		return
	}

	notes, err := s.database.GetAllGardenNotes()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, notes)
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	go func() {
		_ = s.fetcher.RefreshAllFeeds()
	}()
	jsonResponse(w, map[string]bool{"started": true})
}

func (s *Server) handleFilters(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var req struct {
			Keyword     string `json:"keyword"`
			Action      string `json:"action"`
			TargetField string `json:"target_field"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		rule, err := s.database.AddFilterRule(req.Keyword, req.Action, req.TargetField)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		jsonResponse(w, rule)
		return
	}

	rules, err := s.database.GetFilterRules()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, rules)
}

func (s *Server) handleDeleteFilter(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := s.database.DeleteFilterRule(req.ID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]bool{"success": true})
}

func jsonResponse(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	_ = json.NewEncoder(w).Encode(data)
}

func getLocalIPs() []string {
	var ips []string
	ifaces, err := net.Interfaces()
	if err != nil {
		return []string{"127.0.0.1"}
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip != nil && ip.To4() != nil {
				ips = append(ips, ip.String())
			}
		}
	}
	if len(ips) == 0 {
		return []string{"127.0.0.1"}
	}
	return ips
}

func (s *Server) handleVideoEmbed(w http.ResponseWriter, r *http.Request) {
	videoID := r.URL.Query().Get("id")
	if videoID == "" {
		http.Error(w, "missing video id", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%%; height: 100%%; background: #000; overflow: hidden; display: flex; align-items: center; justify-content: center; }
    .wrapper { position: relative; width: 100%%; aspect-ratio: 16 / 9; max-height: 100vh; }
    iframe { position: absolute; inset: 0; width: 100%%; height: 100%%; border: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <iframe src="https://www.youtube-nocookie.com/embed/%s?autoplay=1&rel=0&iv_load_policy=3&modestbranding=1&playsinline=1&enablejsapi=1" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
            allowfullscreen></iframe>
  </div>
</body>
</html>`, videoID)

	_, _ = w.Write([]byte(html))
}

func (s *Server) handleQueue(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	queue, err := s.database.GetQueue(status)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, queue)
}

func (s *Server) handleAddURLToQueue(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.URL == "" {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	meta, err := s.fetcher.FetchURLMetadata(req.URL)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	qItem, err := s.database.AddToQueue(nil, meta.URL, meta.Title, meta.Thumbnail, meta.ContentType, meta.Description)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResponse(w, qItem)
}

func (s *Server) handleAddItemToQueue(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ItemID int64 `json:"item_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ItemID == 0 {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	item, err := s.database.GetItemByID(req.ItemID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	cType := "article"
	if item.FeedType == "youtube" {
		cType = "youtube"
	}
	qItem, err := s.database.AddToQueue(&req.ItemID, item.Link, item.Title, item.Thumbnail, cType, item.Snippet)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResponse(w, qItem)
}

func (s *Server) handleSetQueueStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ID     int64  `json:"id"`
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == 0 {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := s.database.SetQueueStatus(req.ID, req.Status); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]bool{"success": true})
}

func (s *Server) handleDeleteQueue(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == 0 {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := s.database.RemoveFromQueue(req.ID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]bool{"success": true})
}

func (s *Server) handleVideoMPV(w http.ResponseWriter, r *http.Request) {
	urlStr := r.URL.Query().Get("url")
	w.Header().Set("Content-Type", "application/json")
	if urlStr == "" {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "missing url"})
		return
	}
	var err error
	if _, lookErr := exec.LookPath("mpv"); lookErr == nil {
		err = exec.Command("mpv", "--force-window=immediate", "--title=Vayu Media Player", "--ytdl-format=bestvideo[height<=1080]+bestaudio/best[height<=1080]/best", urlStr).Start()
	} else if exec.Command("flatpak", "info", "io.mpv.Mpv").Run() == nil {
		err = exec.Command("flatpak", "run", "io.mpv.Mpv", urlStr).Start()
	} else if _, lookErr := exec.LookPath("vlc"); lookErr == nil {
		err = exec.Command("vlc", urlStr).Start()
	} else if exec.Command("flatpak", "info", "org.videolan.VLC").Run() == nil {
		err = exec.Command("flatpak", "run", "org.videolan.VLC", urlStr).Start()
	} else if _, lookErr := exec.LookPath("celluloid"); lookErr == nil {
		err = exec.Command("celluloid", urlStr).Start()
	} else if exec.Command("flatpak", "info", "io.github.celluloid_player.Celluloid").Run() == nil {
		err = exec.Command("flatpak", "run", "io.github.celluloid_player.Celluloid", urlStr).Start()
	} else {
		err = fmt.Errorf("No native player (MPV/VLC) found on host system. Install mpv via 'sudo dnf install mpv'")
	}

	if err != nil {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}
