package feed

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

type Extractor struct {
	client *http.Client
}

func NewExtractor() *Extractor {
	return &Extractor{
		client: &http.Client{
			Timeout: 12 * time.Second,
		},
	}
}

// ExtractFullArticle fetches the web page at targetURL and extracts the main readable article HTML
func (e *Extractor) ExtractFullArticle(targetURL string) (string, error) {
	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp, err := e.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to fetch article page: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP error %d fetching article", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(io.LimitReader(resp.Body, 5*1024*1024))
	if err != nil {
		return "", fmt.Errorf("failed to parse HTML: %w", err)
	}

	// Remove unwanted elements, post headers, duplicate titles & avatar/author photos
	doc.Find("script, style, nav, footer, header, iframe, noscript, form, button, input, .ad, .ads, .advertisement, .sidebar, .comments, .related-posts, #comments, #nav, #footer, #header, .image-zoom-button, .lightbox-trigger, .post-header, .single-post-header, .article-header, .entry-header, .byline-wrapper, .pfp-button, .pfp-img, .pfp-wrapper, .author-photo, .profile-hover-card, .profile-hover-card-target, .byline-image, .pfp, .avatar, .author-avatar, img.avatar, img.author-photo, img[src*='user_image'], img[src*='user-image'], img[src*='profile'], img[src*='avatar']").Remove()

	// Select best matching article container (inner body first to avoid duplicate headers)
	selectors := []string{
		".available-content",
		".body.markup",
		"[itemprop='articleBody']",
		".article-body",
		".post-content",
		".entry-content",
		".article-content",
		".content-body",
		"#article-body",
		".story-body",
		".article__content",
		"main",
		"article",
		"#content",
	}

	var bestContent *goquery.Selection
	maxTextLen := 0

	for _, sel := range selectors {
		doc.Find(sel).Each(func(i int, s *goquery.Selection) {
			textLen := len(strings.TrimSpace(s.Text()))
			if textLen > maxTextLen {
				maxTextLen = textLen
				bestContent = s
			}
		})
	}

	// Fallback to body if no selector found enough text
	if bestContent == nil || maxTextLen < 150 {
		bestContent = doc.Find("body")
	}

	if bestContent == nil {
		return "", fmt.Errorf("unable to extract article content")
	}

	// Clean up inner attributes (keep href and src, strip inline styles and onclicks)
	bestContent.Find("*").Each(func(i int, s *goquery.Selection) {
		s.RemoveAttr("style")
		s.RemoveAttr("onclick")
		s.RemoveAttr("onload")
		s.RemoveAttr("class")
		s.RemoveAttr("id")

		// Handle lazy loaded images (data-src, data-original-src, etc.)
		if goquery.NodeName(s) == "img" {
			src, hasSrc := s.Attr("src")
			dataSrc, hasDataSrc := s.Attr("data-src")
			if !hasDataSrc {
				dataSrc, hasDataSrc = s.Attr("data-original-src")
			}
			if (!hasSrc || strings.HasPrefix(src, "data:image/svg") || len(src) < 10) && hasDataSrc {
				s.SetAttr("src", dataSrc)
			}
		}

		// Fix relative link and image URLs
		if href, exists := s.Attr("href"); exists && href != "" {
			s.SetAttr("href", resolveAbsoluteURL(targetURL, href))
		}
		if src, exists := s.Attr("src"); exists && src != "" {
			s.SetAttr("src", resolveAbsoluteURL(targetURL, src))
		}
	})

	htmlContent, err := bestContent.Html()
	if err != nil {
		return "", err
	}

	// Remove empty tags and multiple blank lines
	emptyTagsRegex := regexp.MustCompile(`<p>\s*</p>|<div>\s*</div>|<span>\s*</span>`)
	htmlContent = emptyTagsRegex.ReplaceAllString(htmlContent, "")

	return strings.TrimSpace(htmlContent), nil
}

func resolveAbsoluteURL(baseURLStr, relURLStr string) string {
	if strings.HasPrefix(relURLStr, "http://") || strings.HasPrefix(relURLStr, "https://") || strings.HasPrefix(relURLStr, "data:") {
		return relURLStr
	}
	base, err := url.Parse(baseURLStr)
	if err != nil {
		return relURLStr
	}
	rel, err := url.Parse(relURLStr)
	if err != nil {
		return relURLStr
	}
	return base.ResolveReference(rel).String()
}
