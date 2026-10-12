package feed

import (
	"context"
	"github.com/go-boddhi/boddhi-feeds/pkg/db"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/mmcdole/gofeed"
)

type Fetcher struct {
	database  *db.DB
	parser    *gofeed.Parser
	resolver  *Resolver
	extractor *Extractor
}

func NewFetcher(database *db.DB) *Fetcher {
	return &Fetcher{
		database:  database,
		parser:    gofeed.NewParser(),
		resolver:  NewResolver(),
		extractor: NewExtractor(),
	}
}

// ExtractFullArticleForItem fetches and extracts full text content for an item from its target URL
func (f *Fetcher) ExtractFullArticleForItem(itemID int64) (string, error) {
	item, err := f.database.GetItemByID(itemID)
	if err != nil {
		return "", fmt.Errorf("item not found: %w", err)
	}

	fullHTML, err := f.extractor.ExtractFullArticle(item.Link)
	if err != nil {
		return "", err
	}

	snippet := createSnippet(fullHTML, 220)
	_ = f.database.UpdateItemContent(itemID, fullHTML, snippet)

	return fullHTML, nil
}

// AddFeedFromInput resolves the URL, fetches the feed, creates database entry, and imports initial items
func (f *Fetcher) AddFeedFromInput(inputURL string, category string, scope string) (*db.Feed, error) {
	resolved, err := f.resolver.ResolveInput(inputURL)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve feed URL: %w", err)
	}

	if category == "" {
		switch resolved.FeedType {
		case "youtube":
			category = "YouTube"
		case "substack":
			category = "Substack"
		case "github":
			category = "GitHub"
		default:
			category = "Blogs"
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	parsedFeed, err := f.parser.ParseURLWithContext(resolved.FeedURL, ctx)
	title := resolved.Title
	siteURL := resolved.SiteURL
	iconURL := ""

	if err == nil && parsedFeed != nil {
		if parsedFeed.Title != "" {
			title = parsedFeed.Title
		}
		if parsedFeed.Link != "" {
			siteURL = parsedFeed.Link
		}
		if parsedFeed.Image != nil && parsedFeed.Image.URL != "" {
			iconURL = parsedFeed.Image.URL
		}
	}

	feedEntry, err := f.database.AddFeed(title, resolved.FeedURL, siteURL, resolved.FeedType, category, iconURL, scope)
	if err != nil {
		return nil, fmt.Errorf("failed to save feed: %w", err)
	}

	// Import initial feed items
	if parsedFeed != nil {
		f.processFeedItems(feedEntry, parsedFeed, scope)
	}

	return feedEntry, nil
}

// RefreshAllFeeds concurrently fetches updates for all stored feeds
func (f *Fetcher) RefreshAllFeeds() error {
	feeds, err := f.database.GetFeeds()
	if err != nil {
		return err
	}

	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 5) // max 5 concurrent feed fetches

	for _, feedEntry := range feeds {
		wg.Add(1)
		go func(fe db.Feed) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()

			parsedFeed, err := f.parser.ParseURLWithContext(fe.FeedURL, ctx)
			if err == nil && parsedFeed != nil {
				f.processFeedItems(&fe, parsedFeed, fe.Scope)
				_ = f.database.UpdateFeedLastUpdated(fe.ID)
			}
		}(feedEntry)
	}

	wg.Wait()
	return nil
}

func (f *Fetcher) processFeedItems(feedEntry *db.Feed, parsedFeed *gofeed.Feed, scope string) {
	filterRules, _ := f.database.GetFilterRules()

	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	yesterdayStart := todayStart.AddDate(0, 0, -1)

	for _, item := range parsedFeed.Items {
		guid := item.GUID
		if guid == "" {
			guid = item.Link
		}
		if guid == "" {
			guid = item.Title
		}

		pubDate := time.Now()
		if item.PublishedParsed != nil {
			pubDate = *item.PublishedParsed
		} else if item.UpdatedParsed != nil {
			pubDate = *item.UpdatedParsed
		}

		if scope == "latest" {
			if pubDate.Before(yesterdayStart) {
				continue
			}
		}

		author := ""
		if item.Author != nil {
			author = item.Author.Name
		} else if len(item.Authors) > 0 {
			author = item.Authors[0].Name
		}

		content := item.Content
		if content == "" {
			content = item.Description
		}

		// Automatic full article extraction if content is short / snippet-only
		if feedEntry.FeedType != "youtube" && feedEntry.FeedType != "github" && feedEntry.FeedType != "hackernews" && item.Link != "" {
			plainLen := len(strings.TrimSpace(createSnippet(content, 500)))
			if plainLen < 350 {
				if fullHTML, err := f.extractor.ExtractFullArticle(item.Link); err == nil && len(fullHTML) > 200 {
					content = fullHTML
				}
			}
		}

		if feedEntry.FeedType == "hackernews" || strings.Contains(feedEntry.FeedURL, "news.ycombinator.com") {
			if strings.TrimSpace(createSnippet(content, 100)) == "Comments" || len(content) < 60 {
				content = fmt.Sprintf(`
					<div class="hn-post-card" style="background: rgba(255, 102, 0, 0.08); border: 1px solid rgba(255, 102, 0, 0.3); padding: 18px; border-radius: 12px; margin-bottom: 20px;">
						<p style="margin-bottom: 12px; font-weight: 500;">Shared on Hacker News</p>
						<div style="display: flex; gap: 10px; flex-wrap: wrap;">
							<a href="%s" target="_blank" style="display: inline-flex; align-items: center; gap: 6px; background: #ff6600; color: #fff; padding: 8px 16px; border-radius: 8px; font-weight: 600; text-decoration: none;">
								Read Full Article &rarr;
							</a>
							<span style="display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.1); padding: 8px 16px; border-radius: 8px;">
								%s
							</span>
						</div>
					</div>
				`, item.Link, item.Description)
			}
		}

		snippet := createSnippet(content, 220)
		if snippet == "Comments" || snippet == "" {
			snippet = "Story posted on Hacker News. Click to read article or join discussion."
		}
		thumbnail := extractThumbnail(item, feedEntry.FeedType)

		// Evaluate noise filtering score
		noiseScore := calculateNoiseScore(item.Title, content, author, filterRules)

		dbItem := &db.Item{
			FeedID:     feedEntry.ID,
			GUID:       guid,
			Title:      item.Title,
			Content:    content,
			Snippet:    snippet,
			Link:       item.Link,
			Author:     author,
			PubDate:    pubDate.Format(time.RFC3339),
			Thumbnail:  thumbnail,
			IsRead:     noiseScore < 0, // Auto-mark read if heavily muted
			NoiseScore: noiseScore,
		}

		_, _ = f.database.SaveItem(dbItem)
	}
}

func extractThumbnail(item *gofeed.Item, feedType string) string {
	// YouTube Video thumbnail extraction
	if feedType == "youtube" || strings.Contains(item.Link, "youtube.com") || strings.Contains(item.Link, "youtu.be") {
		ytID := extractYouTubeID(item.Link)
		if ytID != "" {
			return fmt.Sprintf("https://i.ytimg.com/vi/%s/hqdefault.jpg", ytID)
		}
	}

	// Check Media Enclosures / Extensions
	if item.Image != nil && item.Image.URL != "" {
		return item.Image.URL
	}
	for _, enc := range item.Enclosures {
		if strings.HasPrefix(enc.Type, "image/") {
			return enc.URL
		}
	}

	// Extract first img tag from html content
	imgRegex := regexp.MustCompile(`(?i)<img[^>]+src=["']([^"']+)["']`)
	if matches := imgRegex.FindStringSubmatch(item.Content + item.Description); len(matches) == 2 {
		return matches[1]
	}

	return ""
}

func extractYouTubeID(link string) string {
	vRegex := regexp.MustCompile(`v=([a-zA-Z0-9_\-]+)`)
	if matches := vRegex.FindStringSubmatch(link); len(matches) == 2 {
		return matches[1]
	}
	embedRegex := regexp.MustCompile(`youtu\.be/([a-zA-Z0-9_\-]+)`)
	if matches := embedRegex.FindStringSubmatch(link); len(matches) == 2 {
		return matches[1]
	}
	return ""
}

func createSnippet(htmlContent string, maxLen int) string {
	// Strip HTML tags
	tagRegex := regexp.MustCompile(`<[^>]*>`)
	plainText := tagRegex.ReplaceAllString(htmlContent, "")
	plainText = strings.Join(strings.Fields(plainText), " ")
	plainText = strings.TrimSpace(plainText)

	if len(plainText) > maxLen {
		return plainText[:maxLen] + "..."
	}
	return plainText
}

func calculateNoiseScore(title, content, author string, rules []db.FilterRule) int {
	score := 0
	titleLower := strings.ToLower(title)
	contentLower := strings.ToLower(content)
	authorLower := strings.ToLower(author)

	for _, rule := range rules {
		kw := strings.ToLower(rule.Keyword)
		matched := false

		switch rule.TargetField {
		case "title":
			matched = strings.Contains(titleLower, kw)
		case "content":
			matched = strings.Contains(contentLower, kw)
		case "author":
			matched = strings.Contains(authorLower, kw)
		default:
			matched = strings.Contains(titleLower, kw) || strings.Contains(contentLower, kw)
		}

		if matched {
			if rule.Action == "mute" {
				score -= 10
			} else if rule.Action == "prioritize" {
				score += 10
			}
		}
	}
	return score
}

type URLMetadata struct {
	URL         string `json:"url"`
	Title       string `json:"title"`
	Thumbnail   string `json:"thumbnail"`
	ContentType string `json:"content_type"`
	Description string `json:"description"`
}

func (f *Fetcher) ExtractFullArticle(targetURL string) (string, error) {
	return f.extractor.ExtractFullArticle(targetURL)
}

func (f *Fetcher) FetchURLMetadata(inputURL string) (*URLMetadata, error) {
	ytID := extractYouTubeID(inputURL)
	if ytID != "" {
		// YouTube URL
		thumb := fmt.Sprintf("https://i.ytimg.com/vi/%s/hqdefault.jpg", ytID)
		title := "YouTube Video"
		// Try fetching oEmbed info
		oembedURL := fmt.Sprintf("https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=%s&format=json", ytID)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, "GET", oembedURL, nil)
		if err == nil {
			resp, err := http.DefaultClient.Do(req)
			if err == nil && resp.StatusCode == 200 {
				var data struct {
					Title        string `json:"title"`
					AuthorName   string `json:"author_name"`
					ThumbnailURL string `json:"thumbnail_url"`
				}
				if json.NewDecoder(resp.Body).Decode(&data) == nil {
					if data.Title != "" {
						title = data.Title
					}
					if data.ThumbnailURL != "" {
						thumb = data.ThumbnailURL
					}
				}
				_ = resp.Body.Close()
			}
		}
		return &URLMetadata{
			URL:         inputURL,
			Title:       title,
			Thumbnail:   thumb,
			ContentType: "youtube",
			Description: "YouTube Video",
		}, nil
	}

	// General Web Article / Link
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "GET", inputURL, nil)
	if err != nil {
		return &URLMetadata{URL: inputURL, Title: inputURL, ContentType: "article"}, nil
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return &URLMetadata{URL: inputURL, Title: inputURL, ContentType: "article"}, nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1024*500)) // max 500KB
	if err != nil {
		return &URLMetadata{URL: inputURL, Title: inputURL, ContentType: "article"}, nil
	}

	htmlStr := string(body)
	title := inputURL
	thumbnail := ""
	description := ""

	// Extract <title>
	titleRegex := regexp.MustCompile(`(?i)<title[^>]*>([^<]+)</title>`)
	if matches := titleRegex.FindStringSubmatch(htmlStr); len(matches) == 2 {
		title = strings.TrimSpace(matches[1])
	}

	// Extract og:title if available
	ogTitleRegex := regexp.MustCompile(`(?i)<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']`)
	if matches := ogTitleRegex.FindStringSubmatch(htmlStr); len(matches) == 2 {
		title = strings.TrimSpace(matches[1])
	}

	// Extract og:image
	ogImgRegex := regexp.MustCompile(`(?i)<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']`)
	if matches := ogImgRegex.FindStringSubmatch(htmlStr); len(matches) == 2 {
		thumbnail = strings.TrimSpace(matches[1])
	}

	// Extract og:description or meta description
	ogDescRegex := regexp.MustCompile(`(?i)<meta[^>]+(?:property=["']og:description["']|name=["']description["'])[^>]+content=["']([^"']+)["']`)
	if matches := ogDescRegex.FindStringSubmatch(htmlStr); len(matches) == 2 {
		description = strings.TrimSpace(matches[1])
	}

	// Extract full readable article HTML if possible
	if fullHTML, err := f.extractor.ExtractFullArticle(inputURL); err == nil && len(strings.TrimSpace(fullHTML)) > 150 {
		description = fullHTML
	}

	return &URLMetadata{
		URL:         inputURL,
		Title:       title,
		Thumbnail:   thumbnail,
		ContentType: "article",
		Description: description,
	}, nil
}

