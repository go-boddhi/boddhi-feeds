package feed

import (
	"strings"
	"testing"
)

func TestResolveInput(t *testing.T) {
	resolver := NewResolver()

	tests := []struct {
		input        string
		expectedType string
	}{
		{
			input:        "@veritasium",
			expectedType: "youtube",
		},
		{
			input:        "golang/go",
			expectedType: "github",
		},
		{
			input:        "https://pragmaticengineer.substack.com",
			expectedType: "substack",
		},
		{
			input:        "https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgQA9GnIGy8QV635I",
			expectedType: "youtube",
		},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			res, err := resolver.ResolveInput(tt.input)
			if err != nil {
				t.Fatalf("unexpected error resolving %s: %v", tt.input, err)
			}
			if res.FeedType != tt.expectedType {
				t.Errorf("expected FeedType %s, got %s", tt.expectedType, res.FeedType)
			}
			if !strings.HasPrefix(res.FeedURL, "https://") {
				t.Errorf("expected valid HTTPS FeedURL, got %s", res.FeedURL)
			}
		})
	}
}
