package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

type Feed struct {
	ID          int64  `json:"id"`
	Title       string `json:"title"`
	FeedURL     string `json:"feed_url"`
	SiteURL     string `json:"site_url"`
	FeedType    string `json:"feed_type"` // youtube, substack, github, blog
	Category    string `json:"category"`
	IconURL     string `json:"icon_url"`
	Scope       string `json:"scope"`     // latest, all
	LastUpdated string `json:"last_updated"`
	CreatedAt   string `json:"created_at"`
	UnreadCount int    `json:"unread_count"`
}

type Item struct {
	ID           int64  `json:"id"`
	FeedID       int64  `json:"feed_id"`
	FeedTitle    string `json:"feed_title"`
	FeedType     string `json:"feed_type"`
	Category     string `json:"category"`
	GUID         string `json:"guid"`
	Title        string `json:"title"`
	Content      string `json:"content"`
	Snippet      string `json:"snippet"`
	Link         string `json:"link"`
	Author       string `json:"author"`
	PubDate      string `json:"pub_date"`
	Thumbnail    string `json:"thumbnail"`
	IsRead       bool   `json:"is_read"`
	IsBookmarked bool   `json:"is_bookmarked"`
	NoiseScore   int    `json:"noise_score"`
	HasNote      bool   `json:"has_note"`
	CreatedAt    string `json:"created_at"`
}

type GardenNote struct {
	ID           int64  `json:"id"`
	ItemID       int64  `json:"item_id"`
	ItemTitle    string `json:"item_title"`
	ItemLink     string `json:"item_link"`
	FeedTitle    string `json:"feed_title"`
	NoteMarkdown string `json:"note_markdown"`
	Tags         string `json:"tags"`
	UpdatedAt    string `json:"updated_at"`
}

type FilterRule struct {
	ID          int64  `json:"id"`
	Keyword     string `json:"keyword"`
	Action      string `json:"action"`       // mute, prioritize
	TargetField string `json:"target_field"` // title, content, author
}

type QueueItem struct {
	ID          int64  `json:"id"`
	ItemID      *int64 `json:"item_id"`      // nullable — only set for RSS-sourced items
	URL         string `json:"url"`
	Title       string `json:"title"`
	Thumbnail   string `json:"thumbnail"`
	ContentType string `json:"content_type"` // youtube | article
	Description string `json:"description"`
	Status      string `json:"status"`       // pending | done
	Position    int    `json:"position"`
	AddedAt     string `json:"added_at"`
}

type DownloadItem struct {
	ID        int64  `json:"id"`
	ItemID    *int64 `json:"item_id"`
	URL       string `json:"url"`
	Title     string `json:"title"`
	Thumbnail string `json:"thumbnail"`
	Status    string `json:"status"`   // downloading | completed | failed
	Progress  int    `json:"progress"` // 0-100
	Speed     string `json:"speed"`
	ETA       string `json:"eta"`
	FilePath  string `json:"file_path"`
	ErrorMsg  string `json:"error_msg"`
	CreatedAt string `json:"created_at"`
}

type DB struct {
	conn *sql.DB
}

func NewDB(dbPath string) (*DB, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create db directory: %w", err)
	}

	conn, err := sql.Open("sqlite", fmt.Sprintf("%s?_journal_mode=WAL&_busy_timeout=5000", dbPath))
	if err != nil {
		return nil, fmt.Errorf("failed to open db: %w", err)
	}
	if err := conn.Ping(); err != nil {
		return nil, fmt.Errorf("failed to connect to db: %w", err)
	}

	database := &DB{conn: conn}
	if err := database.initTables(); err != nil {
		return nil, fmt.Errorf("failed to initialize db tables: %w", err)
	}

	return database, nil
}

func (d *DB) Close() error {
	return d.conn.Close()
}

func (d *DB) initTables() error {
	schema := `
	CREATE TABLE IF NOT EXISTS feeds (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL,
		feed_url TEXT UNIQUE NOT NULL,
		site_url TEXT,
		feed_type TEXT DEFAULT 'blog',
		category TEXT DEFAULT 'General',
		icon_url TEXT,
		scope TEXT DEFAULT 'latest',
		last_updated DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS items (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		feed_id INTEGER NOT NULL,
		guid TEXT NOT NULL,
		title TEXT NOT NULL,
		content TEXT,
		snippet TEXT,
		link TEXT NOT NULL,
		author TEXT,
		pub_date DATETIME,
		thumbnail TEXT,
		is_read BOOLEAN DEFAULT 0,
		is_bookmarked BOOLEAN DEFAULT 0,
		noise_score INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
		UNIQUE(feed_id, guid)
	);

	CREATE TABLE IF NOT EXISTS garden_notes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		item_id INTEGER UNIQUE NOT NULL,
		note_markdown TEXT NOT NULL,
		tags TEXT DEFAULT '',
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS filter_rules (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		keyword TEXT NOT NULL UNIQUE,
		action TEXT DEFAULT 'mute',
		target_field TEXT DEFAULT 'title'
	);

	CREATE INDEX IF NOT EXISTS idx_items_feed_id ON items(feed_id);
	CREATE INDEX IF NOT EXISTS idx_items_pub_date ON items(pub_date DESC);
	CREATE INDEX IF NOT EXISTS idx_items_is_read ON items(is_read);
	CREATE INDEX IF NOT EXISTS idx_items_is_bookmarked ON items(is_bookmarked);

	CREATE TABLE IF NOT EXISTS queue (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
		url TEXT NOT NULL,
		title TEXT NOT NULL,
		thumbnail TEXT DEFAULT '',
		content_type TEXT DEFAULT 'article',
		description TEXT DEFAULT '',
		status TEXT DEFAULT 'pending',
		position INTEGER DEFAULT 0,
		added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(url)
	);
	CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status);
	CREATE INDEX IF NOT EXISTS idx_queue_position ON queue(position);

	CREATE TABLE IF NOT EXISTS downloads (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
		url TEXT UNIQUE NOT NULL,
		title TEXT NOT NULL,
		thumbnail TEXT DEFAULT '',
		status TEXT DEFAULT 'downloading',
		progress INTEGER DEFAULT 0,
		speed TEXT DEFAULT '',
		eta TEXT DEFAULT '',
		file_path TEXT DEFAULT '',
		error_msg TEXT DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
	`
	_, err := d.conn.Exec(schema)
	if err != nil {
		return err
	}
	_, _ = d.conn.Exec("ALTER TABLE feeds ADD COLUMN scope TEXT DEFAULT 'latest'")
	return nil
}

// Feeds CRUD
func (d *DB) AddFeed(title, feedURL, siteURL, feedType, category, iconURL, scope string) (*Feed, error) {
	if scope == "" {
		scope = "latest"
	}
	nowStr := time.Now().Format(time.RFC3339)
	res, err := d.conn.Exec(`
		INSERT INTO feeds (title, feed_url, site_url, feed_type, category, icon_url, scope, last_updated, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(feed_url) DO UPDATE SET
			title=excluded.title,
			category=excluded.category,
			icon_url=excluded.icon_url,
			scope=excluded.scope
	`, title, feedURL, siteURL, feedType, category, iconURL, scope, nowStr, nowStr)

	if err != nil {
		return nil, err
	}

	id, err := res.LastInsertId()
	if err != nil || id == 0 {
		var existing Feed
		var lastUpdated, createdAt sql.NullString
		err := d.conn.QueryRow("SELECT id, title, feed_url, site_url, feed_type, category, icon_url, COALESCE(scope, 'latest'), last_updated, created_at FROM feeds WHERE feed_url=?", feedURL).
			Scan(&existing.ID, &existing.Title, &existing.FeedURL, &existing.SiteURL, &existing.FeedType, &existing.Category, &existing.IconURL, &existing.Scope, &lastUpdated, &createdAt)
		if lastUpdated.Valid {
			existing.LastUpdated = lastUpdated.String
		}
		if createdAt.Valid {
			existing.CreatedAt = createdAt.String
		}
		return &existing, err
	}

	return &Feed{
		ID:          id,
		Title:       title,
		FeedURL:     feedURL,
		SiteURL:     siteURL,
		FeedType:    feedType,
		Category:    category,
		IconURL:     iconURL,
		Scope:       scope,
		LastUpdated: nowStr,
		CreatedAt:   nowStr,
	}, nil
}

func (d *DB) GetFeeds() ([]Feed, error) {
	query := `
		SELECT f.id, f.title, f.feed_url, f.site_url, f.feed_type, f.category, f.icon_url, COALESCE(f.scope, 'latest') as scope, f.last_updated, f.created_at,
		       COALESCE(COUNT(CASE WHEN i.is_read = 0 THEN 1 END), 0) as unread_count
		FROM feeds f
		LEFT JOIN items i ON f.id = i.feed_id
		GROUP BY f.id
		ORDER BY f.category ASC, f.title ASC
	`
	rows, err := d.conn.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var feeds []Feed
	for rows.Next() {
		var f Feed
		var lastUpdated, createdAt sql.NullString
		if err := rows.Scan(&f.ID, &f.Title, &f.FeedURL, &f.SiteURL, &f.FeedType, &f.Category, &f.IconURL, &f.Scope, &lastUpdated, &createdAt, &f.UnreadCount); err != nil {
			return nil, err
		}
		if lastUpdated.Valid {
			f.LastUpdated = lastUpdated.String
		}
		if createdAt.Valid {
			f.CreatedAt = createdAt.String
		}
		feeds = append(feeds, f)
	}
	return feeds, nil
}

func (d *DB) DeleteFeed(feedID int64) error {
	_, err := d.conn.Exec("DELETE FROM feeds WHERE id=?", feedID)
	return err
}

func (d *DB) UpdateFeedTitle(feedID int64, newTitle string) error {
	_, err := d.conn.Exec("UPDATE feeds SET title=? WHERE id=?", newTitle, feedID)
	return err
}

func (d *DB) UpdateFeedLastUpdated(feedID int64) error {
	_, err := d.conn.Exec("UPDATE feeds SET last_updated=? WHERE id=?", time.Now().Format(time.RFC3339), feedID)
	return err
}

// Items Operations
func (d *DB) SaveItem(item *Item) (bool, error) {
	res, err := d.conn.Exec(`
		INSERT INTO items (feed_id, guid, title, content, snippet, link, author, pub_date, thumbnail, is_read, is_bookmarked, noise_score)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(feed_id, guid) DO NOTHING
	`, item.FeedID, item.GUID, item.Title, item.Content, item.Snippet, item.Link, item.Author, item.PubDate, item.Thumbnail, item.IsRead, item.IsBookmarked, item.NoiseScore)

	if err != nil {
		return false, err
	}
	rowsAffected, _ := res.RowsAffected()
	return rowsAffected > 0, nil
}

func (d *DB) GetItems(category string, feedID int64, filterType string, searchQuery string, limit int, offset int) ([]Item, error) {
	query := `
		SELECT i.id, i.feed_id, f.title as feed_title, f.feed_type, f.category, i.guid, i.title, i.content, i.snippet,
		       i.link, i.author, i.pub_date, i.thumbnail, i.is_read, i.is_bookmarked, i.noise_score,
		       (CASE WHEN g.id IS NOT NULL THEN 1 ELSE 0 END) as has_note, i.created_at
		FROM items i
		JOIN feeds f ON i.feed_id = f.id
		LEFT JOIN garden_notes g ON i.id = g.item_id
		WHERE 1=1
	`
	args := []interface{}{}

	if category != "" && category != "All" {
		query += " AND f.category = ?"
		args = append(args, category)
	}
	if feedID > 0 {
		query += " AND i.feed_id = ?"
		args = append(args, feedID)
	}
	if filterType == "unread" {
		query += " AND i.is_read = 0"
	} else if filterType == "bookmarked" {
		query += " AND i.is_bookmarked = 1"
	} else if filterType == "notes" {
		query += " AND g.id IS NOT NULL"
	} else if filterType == "today" {
		query += " AND (date(i.pub_date, 'localtime') = date('now', 'localtime') OR date(i.pub_date) = date('now'))"
	}

	if searchQuery != "" {
		query += " AND (i.title LIKE ? OR i.content LIKE ? OR i.author LIKE ?)"
		searchPattern := "%" + searchQuery + "%"
		args = append(args, searchPattern, searchPattern, searchPattern)
	}

	query += " ORDER BY i.pub_date DESC LIMIT ? OFFSET ?"
	if limit <= 0 {
		limit = 100
	}
	args = append(args, limit, offset)

	rows, err := d.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []Item
	for rows.Next() {
		var it Item
		var pubDate, createdAt, author, thumbnail, snippet, content sql.NullString
		if err := rows.Scan(
			&it.ID, &it.FeedID, &it.FeedTitle, &it.FeedType, &it.Category, &it.GUID, &it.Title, &content, &snippet,
			&it.Link, &author, &pubDate, &thumbnail, &it.IsRead, &it.IsBookmarked, &it.NoiseScore, &it.HasNote, &createdAt,
		); err != nil {
			return nil, err
		}
		if pubDate.Valid {
			it.PubDate = pubDate.String
		}
		if createdAt.Valid {
			it.CreatedAt = createdAt.String
		}
		if author.Valid {
			it.Author = author.String
		}
		if thumbnail.Valid {
			it.Thumbnail = thumbnail.String
		}
		if snippet.Valid {
			it.Snippet = snippet.String
		}
		if content.Valid {
			it.Content = content.String
		}
		items = append(items, it)
	}
	return items, nil
}

func (d *DB) GetItemByID(itemID int64) (*Item, error) {
	query := `
		SELECT i.id, i.feed_id, f.title as feed_title, f.feed_type, f.category, i.guid, i.title, i.content, i.snippet,
		       i.link, i.author, i.pub_date, i.thumbnail, i.is_read, i.is_bookmarked, i.noise_score,
		       (CASE WHEN g.id IS NOT NULL THEN 1 ELSE 0 END) as has_note, i.created_at
		FROM items i
		JOIN feeds f ON i.feed_id = f.id
		LEFT JOIN garden_notes g ON i.id = g.item_id
		WHERE i.id = ?
	`
	var it Item
	var pubDate, createdAt, author, thumbnail, snippet, content sql.NullString
	err := d.conn.QueryRow(query, itemID).Scan(
		&it.ID, &it.FeedID, &it.FeedTitle, &it.FeedType, &it.Category, &it.GUID, &it.Title, &content, &snippet,
		&it.Link, &author, &pubDate, &thumbnail, &it.IsRead, &it.IsBookmarked, &it.NoiseScore, &it.HasNote, &createdAt,
	)
	if err != nil {
		return nil, err
	}
	if pubDate.Valid {
		it.PubDate = pubDate.String
	}
	if createdAt.Valid {
		it.CreatedAt = createdAt.String
	}
	if author.Valid {
		it.Author = author.String
	}
	if thumbnail.Valid {
		it.Thumbnail = thumbnail.String
	}
	if snippet.Valid {
		it.Snippet = snippet.String
	}
	if content.Valid {
		it.Content = content.String
	}
	return &it, nil
}

func (d *DB) ToggleRead(itemID int64, isRead bool) error {
	_, err := d.conn.Exec("UPDATE items SET is_read=? WHERE id=?", isRead, itemID)
	return err
}

func (d *DB) MarkAllAsRead(feedID int64) error {
	if feedID > 0 {
		_, err := d.conn.Exec("UPDATE items SET is_read=1 WHERE feed_id=?", feedID)
		return err
	}
	_, err := d.conn.Exec("UPDATE items SET is_read=1")
	return err
}

func (d *DB) ToggleBookmark(itemID int64) (bool, error) {
	var current bool
	err := d.conn.QueryRow("SELECT is_bookmarked FROM items WHERE id=?", itemID).Scan(&current)
	if err != nil {
		return false, err
	}
	newVal := !current
	_, err = d.conn.Exec("UPDATE items SET is_bookmarked=? WHERE id=?", newVal, itemID)
	return newVal, err
}

func (d *DB) UpdateItemContent(itemID int64, content, snippet string) error {
	_, err := d.conn.Exec("UPDATE items SET content=?, snippet=? WHERE id=?", content, snippet, itemID)
	return err
}

// Digital Garden Notes
func (d *DB) SaveGardenNote(itemID int64, noteMarkdown, tags string) (*GardenNote, error) {
	nowStr := time.Now().Format(time.RFC3339)
	_, err := d.conn.Exec(`
		INSERT INTO garden_notes (item_id, note_markdown, tags, updated_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(item_id) DO UPDATE SET
			note_markdown=excluded.note_markdown,
			tags=excluded.tags,
			updated_at=excluded.updated_at
	`, itemID, noteMarkdown, tags, nowStr)
	if err != nil {
		return nil, err
	}

	return d.GetGardenNoteByItemID(itemID)
}

func (d *DB) GetGardenNoteByItemID(itemID int64) (*GardenNote, error) {
	query := `
		SELECT g.id, g.item_id, i.title, i.link, f.title, g.note_markdown, g.tags, g.updated_at
		FROM garden_notes g
		JOIN items i ON g.item_id = i.id
		JOIN feeds f ON i.feed_id = f.id
		WHERE g.item_id = ?
	`
	var n GardenNote
	var updatedAt sql.NullString
	err := d.conn.QueryRow(query, itemID).Scan(&n.ID, &n.ItemID, &n.ItemTitle, &n.ItemLink, &n.FeedTitle, &n.NoteMarkdown, &n.Tags, &updatedAt)
	if err != nil {
		return nil, err
	}
	if updatedAt.Valid {
		n.UpdatedAt = updatedAt.String
	}
	return &n, nil
}

func (d *DB) GetAllGardenNotes() ([]GardenNote, error) {
	query := `
		SELECT g.id, g.item_id, i.title, i.link, f.title, g.note_markdown, g.tags, g.updated_at
		FROM garden_notes g
		JOIN items i ON g.item_id = i.id
		JOIN feeds f ON i.feed_id = f.id
		ORDER BY g.updated_at DESC
	`
	rows, err := d.conn.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notes []GardenNote
	for rows.Next() {
		var n GardenNote
		var updatedAt sql.NullString
		if err := rows.Scan(&n.ID, &n.ItemID, &n.ItemTitle, &n.ItemLink, &n.FeedTitle, &n.NoteMarkdown, &n.Tags, &updatedAt); err != nil {
			return nil, err
		}
		if updatedAt.Valid {
			n.UpdatedAt = updatedAt.String
		}
		notes = append(notes, n)
	}
	return notes, nil
}

func (d *DB) DeleteGardenNote(itemID int64) error {
	_, err := d.conn.Exec("DELETE FROM garden_notes WHERE item_id=?", itemID)
	return err
}

// Filter Rules CRUD
func (d *DB) AddFilterRule(keyword, action, targetField string) (*FilterRule, error) {
	res, err := d.conn.Exec(`
		INSERT INTO filter_rules (keyword, action, target_field)
		VALUES (?, ?, ?)
		ON CONFLICT(keyword) DO UPDATE SET action=excluded.action, target_field=excluded.target_field
	`, keyword, action, targetField)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &FilterRule{ID: id, Keyword: keyword, Action: action, TargetField: targetField}, nil
}

func (d *DB) GetFilterRules() ([]FilterRule, error) {
	rows, err := d.conn.Query("SELECT id, keyword, action, target_field FROM filter_rules ORDER BY keyword ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []FilterRule
	for rows.Next() {
		var r FilterRule
		if err := rows.Scan(&r.ID, &r.Keyword, &r.Action, &r.TargetField); err != nil {
			return nil, err
		}
		rules = append(rules, r)
	}
	return rules, nil
}

func (d *DB) DeleteFilterRule(id int64) error {
	_, err := d.conn.Exec("DELETE FROM filter_rules WHERE id=?", id)
	return err
}

// Queue CRUD
func (d *DB) AddToQueue(itemID *int64, url, title, thumbnail, contentType, description string) (*QueueItem, error) {
	// Get current max position
	var maxPos int
	_ = d.conn.QueryRow("SELECT COALESCE(MAX(position), -1) FROM queue").Scan(&maxPos)

	res, err := d.conn.Exec(`
		INSERT INTO queue (item_id, url, title, thumbnail, content_type, description, status, position, added_at)
		VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
		ON CONFLICT(url) DO NOTHING
	`, itemID, url, title, thumbnail, contentType, description, maxPos+1, time.Now().Format(time.RFC3339))
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	if id == 0 {
		return nil, fmt.Errorf("item already in queue")
	}
	return &QueueItem{
		ID: id, ItemID: itemID, URL: url, Title: title,
		Thumbnail: thumbnail, ContentType: contentType, Description: description,
		Status: "pending", Position: maxPos + 1,
	}, nil
}

func (d *DB) GetQueue(status string) ([]QueueItem, error) {
	query := "SELECT id, item_id, url, title, thumbnail, content_type, description, status, position, added_at FROM queue"
	args := []interface{}{}
	if status != "" {
		query += " WHERE status = ?"
		args = append(args, status)
	}
	query += " ORDER BY position ASC, added_at DESC"

	rows, err := d.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []QueueItem
	for rows.Next() {
		var q QueueItem
		var itemID sql.NullInt64
		var thumbnail, description, addedAt sql.NullString
		if err := rows.Scan(&q.ID, &itemID, &q.URL, &q.Title, &thumbnail, &q.ContentType, &description, &q.Status, &q.Position, &addedAt); err != nil {
			return nil, err
		}
		if itemID.Valid {
			v := itemID.Int64
			q.ItemID = &v
		}
		if thumbnail.Valid {
			q.Thumbnail = thumbnail.String
		}
		if description.Valid {
			q.Description = description.String
		}
		if addedAt.Valid {
			q.AddedAt = addedAt.String
		}
		items = append(items, q)
	}
	return items, nil
}

func (d *DB) SetQueueStatus(id int64, status string) error {
	_, err := d.conn.Exec("UPDATE queue SET status=? WHERE id=?", status, id)
	return err
}

func (d *DB) RemoveFromQueue(id int64) error {
	_, err := d.conn.Exec("DELETE FROM queue WHERE id=?", id)
	return err
}

func (d *DB) GetQueueCounts() (pending int, done int) {
	_ = d.conn.QueryRow("SELECT COUNT(*) FROM queue WHERE status='pending'").Scan(&pending)
	_ = d.conn.QueryRow("SELECT COUNT(*) FROM queue WHERE status='done'").Scan(&done)
	return
}

// Download DB Methods
func (d *DB) AddDownload(itemID *int64, urlStr string, title string, thumbnail string) (*DownloadItem, error) {
	res, err := d.conn.Exec(`INSERT INTO downloads (item_id, url, title, thumbnail, status, progress, created_at)
		VALUES (?, ?, ?, ?, 'downloading', 0, CURRENT_TIMESTAMP)
		ON CONFLICT(url) DO UPDATE SET status='downloading', progress=0, error_msg=''`,
		itemID, urlStr, title, thumbnail)
	if err != nil {
		return nil, fmt.Errorf("failed to insert download: %w", err)
	}
	id, _ := res.LastInsertId()
	if id == 0 {
		_ = d.conn.QueryRow("SELECT id FROM downloads WHERE url=?", urlStr).Scan(&id)
	}
	return d.GetDownloadByID(id)
}

func (d *DB) UpdateDownloadProgress(id int64, status string, progress int, speed string, eta string, filePath string, errorMsg string) error {
	_, err := d.conn.Exec(`UPDATE downloads SET status=?, progress=?, speed=?, eta=?, file_path=?, error_msg=? WHERE id=?`,
		status, progress, speed, eta, filePath, errorMsg, id)
	return err
}

func (d *DB) GetDownloadByID(id int64) (*DownloadItem, error) {
	var dl DownloadItem
	var itemID sql.NullInt64
	var thumbnail, speed, eta, filePath, errorMsg, createdAt sql.NullString
	err := d.conn.QueryRow(`SELECT id, item_id, url, title, thumbnail, status, progress, speed, eta, file_path, error_msg, created_at
		FROM downloads WHERE id=?`, id).Scan(
		&dl.ID, &itemID, &dl.URL, &dl.Title, &thumbnail, &dl.Status, &dl.Progress, &speed, &eta, &filePath, &errorMsg, &createdAt,
	)
	if err != nil {
		return nil, err
	}
	if itemID.Valid {
		v := itemID.Int64
		dl.ItemID = &v
	}
	if thumbnail.Valid {
		dl.Thumbnail = thumbnail.String
	}
	if speed.Valid {
		dl.Speed = speed.String
	}
	if eta.Valid {
		dl.ETA = eta.String
	}
	if filePath.Valid {
		dl.FilePath = filePath.String
	}
	if errorMsg.Valid {
		dl.ErrorMsg = errorMsg.String
	}
	if createdAt.Valid {
		dl.CreatedAt = createdAt.String
	}
	return &dl, nil
}

func (d *DB) GetDownloads() ([]DownloadItem, error) {
	rows, err := d.conn.Query(`SELECT id, item_id, url, title, thumbnail, status, progress, speed, eta, file_path, error_msg, created_at
		FROM downloads ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var downloads []DownloadItem
	for rows.Next() {
		var dl DownloadItem
		var itemID sql.NullInt64
		var thumbnail, speed, eta, filePath, errorMsg, createdAt sql.NullString
		if err := rows.Scan(&dl.ID, &itemID, &dl.URL, &dl.Title, &thumbnail, &dl.Status, &dl.Progress, &speed, &eta, &filePath, &errorMsg, &createdAt); err != nil {
			return nil, err
		}
		if itemID.Valid {
			v := itemID.Int64
			dl.ItemID = &v
		}
		if thumbnail.Valid {
			dl.Thumbnail = thumbnail.String
		}
		if speed.Valid {
			dl.Speed = speed.String
		}
		if eta.Valid {
			dl.ETA = eta.String
		}
		if filePath.Valid {
			dl.FilePath = filePath.String
		}
		if errorMsg.Valid {
			dl.ErrorMsg = errorMsg.String
		}
		if createdAt.Valid {
			dl.CreatedAt = createdAt.String
		}
		downloads = append(downloads, dl)
	}
	return downloads, nil
}

func (d *DB) DeleteDownload(id int64) error {
	_, err := d.conn.Exec("DELETE FROM downloads WHERE id=?", id)
	return err
}
