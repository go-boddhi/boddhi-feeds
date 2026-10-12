package feed

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type ResolvedFeedInfo struct {
	FeedURL  string
	SiteURL  string
	Title    string
	FeedType string // youtube, substack, github, blog
}

type Resolver struct {
	client *http.Client
}

func NewResolver() *Resolver {
	return &Resolver{
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// ResolveInput auto-detects and converts input strings into a valid RSS/Atom feed URL
func (r *Resolver) ResolveInput(input string) (*ResolvedFeedInfo, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return nil, fmt.Errorf("empty URL or resource input")
	}

	// 1. Check for Hacker News (e.g. news.ycombinator.com or hackernews)
	if strings.Contains(input, "news.ycombinator.com") || strings.EqualFold(input, "hackernews") || strings.EqualFold(input, "hn") {
		return &ResolvedFeedInfo{
			FeedURL:  "https://news.ycombinator.com/rss",
			SiteURL:  "https://news.ycombinator.com",
			Title:    "Hacker News",
			FeedType: "hackernews",
		}, nil
	}

	// 2. Check for GitHub Repo (e.g., owner/repo or https://github.com/owner/repo)
	if githubInfo := r.tryGitHub(input); githubInfo != nil {
		return githubInfo, nil
	}

	// 2. Check for YouTube Channel or Handle (@handle or youtube.com/...)
	if youtubeInfo := r.tryYouTube(input); youtubeInfo != nil {
		return youtubeInfo, nil
	}

	// 3. Ensure scheme for standard URLs
	targetURL := input
	if !strings.HasPrefix(targetURL, "http://") && !strings.HasPrefix(targetURL, "https://") {
		targetURL = "https://" + targetURL
	}

	u, err := url.Parse(targetURL)
	if err != nil {
		return nil, fmt.Errorf("invalid URL: %w", err)
	}

	// 4. Check for Substack (e.g. name.substack.com)
	if strings.HasSuffix(u.Host, ".substack.com") {
		feedURL := fmt.Sprintf("https://%s/feed", u.Host)
		siteURL := fmt.Sprintf("https://%s", u.Host)
		title := strings.TrimSuffix(u.Host, ".substack.com")
		title = strings.Title(strings.ReplaceAll(title, "-", " "))
		return &ResolvedFeedInfo{
			FeedURL:  feedURL,
			SiteURL:  siteURL,
			Title:    title + " (Substack)",
			FeedType: "substack",
		}, nil
	}

	// 5. Check if direct RSS/Atom link or HTML page autodiscovery
	return r.discoverHTMLFeed(targetURL)
}

func (r *Resolver) tryGitHub(input string) *ResolvedFeedInfo {
	// Pattern: owner/repo
	shortPattern := regexp.MustCompile(`^([a-zA-Z0-9_\-\.]+)/([a-zA-Z0-9_\-\.]+)$`)
	if matches := shortPattern.FindStringSubmatch(input); len(matches) == 3 {
		owner, repo := matches[1], matches[2]
		return &ResolvedFeedInfo{
			FeedURL:  fmt.Sprintf("https://github.com/%s/%s/releases.atom", owner, repo),
			SiteURL:  fmt.Sprintf("https://github.com/%s/%s", owner, repo),
			Title:    fmt.Sprintf("%s/%s Releases", owner, repo),
			FeedType: "github",
		}
	}

	// Full GitHub URL
	if strings.Contains(input, "github.com/") {
		u, err := url.Parse(input)
		if err == nil {
			parts := strings.Split(strings.Trim(u.Path, "/"), "/")
			if len(parts) >= 2 {
				owner, repo := parts[0], parts[1]
				return &ResolvedFeedInfo{
					FeedURL:  fmt.Sprintf("https://github.com/%s/%s/releases.atom", owner, repo),
					SiteURL:  fmt.Sprintf("https://github.com/%s/%s", owner, repo),
					Title:    fmt.Sprintf("%s/%s Releases", owner, repo),
					FeedType: "github",
				}
			}
		}
	}
	return nil
}

func (r *Resolver) tryYouTube(input string) *ResolvedFeedInfo {
	// YouTube Handle e.g. @veritasium or https://youtube.com/@veritasium
	handlePattern := regexp.MustCompile(`^@([a-zA-Z0-9_\-\.]+)$`)
	if matches := handlePattern.FindStringSubmatch(input); len(matches) == 2 {
		handle := matches[1]
		return r.resolveYouTubeHandle(handle)
	}

	if strings.Contains(input, "youtube.com") || strings.Contains(input, "youtu.be") {
		// Channel ID direct URL: youtube.com/channel/UC...
		channelIDPattern := regexp.MustCompile(`youtube\.com/channel/(UC[a-zA-Z0-9_\-]+)`)
		if matches := channelIDPattern.FindStringSubmatch(input); len(matches) == 2 {
			channelID := matches[1]
			return &ResolvedFeedInfo{
				FeedURL:  fmt.Sprintf("https://www.youtube.com/feeds/videos.xml?channel_id=%s", channelID),
				SiteURL:  fmt.Sprintf("https://www.youtube.com/channel/%s", channelID),
				Title:    "YouTube Channel (" + channelID + ")",
				FeedType: "youtube",
			}
		}

		// Playlist URL: youtube.com/playlist?list=... or list=...
		playlistPattern := regexp.MustCompile(`(?:youtube\.com/playlist\?list=|list=)([a-zA-Z0-9_\-]+)`)
		if matches := playlistPattern.FindStringSubmatch(input); len(matches) == 2 {
			playlistID := matches[1]
			return &ResolvedFeedInfo{
				FeedURL:  fmt.Sprintf("https://www.youtube.com/feeds/videos.xml?playlist_id=%s", playlistID),
				SiteURL:  fmt.Sprintf("https://www.youtube.com/playlist?list=%s", playlistID),
				Title:    "YouTube Playlist (" + playlistID + ")",
				FeedType: "youtube",
			}
		}

		// Handle in URL: youtube.com/@handle
		handleURLPattern := regexp.MustCompile(`youtube\.com/@([a-zA-Z0-9_\-\.]+)`)
		if matches := handleURLPattern.FindStringSubmatch(input); len(matches) == 2 {
			return r.resolveYouTubeHandle(matches[1])
		}
	}

	return nil
}

func (r *Resolver) resolveYouTubeHandle(handle string) *ResolvedFeedInfo {
	pageURL := fmt.Sprintf("https://www.youtube.com/@%s", handle)
	req, err := http.NewRequest("GET", pageURL, nil)
	if err != nil {
		return defaultYouTubeFeed(handle)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := r.client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		return defaultYouTubeFeed(handle)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return defaultYouTubeFeed(handle)
	}
	bodyStr := string(bodyBytes)

	// Robust regex patterns to extract channel ID (UC...)
	channelPatterns := []*regexp.Regexp{
		regexp.MustCompile(`href="https://www\.youtube\.com/feeds/videos\.xml\?channel_id=(UC[a-zA-Z0-9_\-]+)"`),
		regexp.MustCompile(`<meta itemprop="channelId" content="(UC[a-zA-Z0-9_\-]+)">`),
		regexp.MustCompile(`"channelId":"(UC[a-zA-Z0-9_\-]+)"`),
		regexp.MustCompile(`"externalId":"(UC[a-zA-Z0-9_\-]+)"`),
		regexp.MustCompile(`channel_id=(UC[a-zA-Z0-9_\-]+)`),
	}

	for _, pat := range channelPatterns {
		if matches := pat.FindStringSubmatch(bodyStr); len(matches) == 2 {
			channelID := matches[1]
			title := "@" + handle
			titleRegex := regexp.MustCompile(`<title>([^<]+)</title>`)
			if tMatches := titleRegex.FindStringSubmatch(bodyStr); len(tMatches) == 2 {
				cleanTitle := strings.TrimSuffix(tMatches[1], " - YouTube")
				if cleanTitle != "" {
					title = cleanTitle
				}
			}
			return &ResolvedFeedInfo{
				FeedURL:  fmt.Sprintf("https://www.youtube.com/feeds/videos.xml?channel_id=%s", channelID),
				SiteURL:  pageURL,
				Title:    title,
				FeedType: "youtube",
			}
		}
	}

	return defaultYouTubeFeed(handle)
}

func defaultYouTubeFeed(handle string) *ResolvedFeedInfo {
	return &ResolvedFeedInfo{
		FeedURL:  fmt.Sprintf("https://www.youtube.com/feeds/videos.xml?channel_id=%s", handle),
		SiteURL:  fmt.Sprintf("https://www.youtube.com/@%s", handle),
		Title:    "@" + handle,
		FeedType: "youtube",
	}
}

func (r *Resolver) discoverHTMLFeed(targetURL string) (*ResolvedFeedInfo, error) {
	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (DigitalGardenFeeds RSS Reader)")

	resp, err := r.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("unable to fetch URL: %w", err)
	}
	defer resp.Body.Close()

	contentType := resp.Header.Get("Content-Type")
	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 1024*1024)) // limit to 1MB
	if err != nil {
		return nil, err
	}

	// If content type is already XML / RSS / Atom
	if strings.Contains(contentType, "xml") || strings.Contains(contentType, "rss") || strings.Contains(contentType, "atom") || strings.HasSuffix(targetURL, ".xml") || strings.HasSuffix(targetURL, ".atom") || strings.HasSuffix(targetURL, ".rss") {
		return &ResolvedFeedInfo{
			FeedURL:  targetURL,
			SiteURL:  targetURL,
			Title:    extractTitleFromHTML(string(bodyBytes), targetURL),
			FeedType: "blog",
		}, nil
	}

	// Search for RSS / Atom link tags in HTML
	feedLinkRegex := regexp.MustCompile(`(?i)<link[^>]+rel=["']alternate["'][^>]+type=["']application/(rss\+xml|atom\+xml|json)["'][^>]*>`)
	hrefRegex := regexp.MustCompile(`(?i)href=["']([^"']+)["']`)

	htmlStr := string(bodyBytes)
	if matches := feedLinkRegex.FindAllString(htmlStr, -1); len(matches) > 0 {
		for _, tag := range matches {
			if hrefMatch := hrefRegex.FindStringSubmatch(tag); len(hrefMatch) == 2 {
				rawHref := hrefMatch[1]
				u, err := url.Parse(targetURL)
				if err == nil {
					refURL, err := u.Parse(rawHref)
					if err == nil {
						return &ResolvedFeedInfo{
							FeedURL:  refURL.String(),
							SiteURL:  targetURL,
							Title:    extractTitleFromHTML(htmlStr, targetURL),
							FeedType: "blog",
						}, nil
					}
				}
			}
		}
	}

	// Common fallback feed endpoints
	fallbacks := []string{"/rss.xml", "/feed", "/atom.xml", "/index.xml", "/rss"}
	parsedTarget, _ := url.Parse(targetURL)
	if parsedTarget != nil {
		baseURL := fmt.Sprintf("%s://%s", parsedTarget.Scheme, parsedTarget.Host)
		for _, fb := range fallbacks {
			fbURL := baseURL + fb
			checkReq, _ := http.NewRequest("HEAD", fbURL, nil)
			checkResp, checkErr := r.client.Do(checkReq)
			if checkErr == nil && checkResp.StatusCode == 200 {
				return &ResolvedFeedInfo{
					FeedURL:  fbURL,
					SiteURL:  targetURL,
					Title:    extractTitleFromHTML(htmlStr, targetURL),
					FeedType: "blog",
				}, nil
			}
		}
	}

	// Default assumption if input is already direct feed link
	return &ResolvedFeedInfo{
		FeedURL:  targetURL,
		SiteURL:  targetURL,
		Title:    extractTitleFromHTML(htmlStr, targetURL),
		FeedType: "blog",
	}, nil
}

func extractTitleFromHTML(htmlStr, fallbackURL string) string {
	titleRegex := regexp.MustCompile(`(?i)<title[^>]*>([^<]+)</title>`)
	if matches := titleRegex.FindStringSubmatch(htmlStr); len(matches) == 2 {
		t := strings.TrimSpace(matches[1])
		if t != "" {
			return t
		}
	}
	u, err := url.Parse(fallbackURL)
	if err == nil {
		return u.Host
	}
	return fallbackURL
}
