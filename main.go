package main

import (
	"embed"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend
var assetsFS embed.FS

func init() {
	if os.Getenv("WEBKIT_FORCE_COMPOSITING_MODE") == "" {
		os.Setenv("WEBKIT_FORCE_COMPOSITING_MODE", "1")
	}
	if os.Getenv("WEBKIT_DISABLE_COMPOSITING_MODE") == "" {
		os.Setenv("WEBKIT_DISABLE_COMPOSITING_MODE", "0")
	}
	// Enable WebKitGTK Hardware Video Acceleration (VA-API & GStreamer GPU Decoding)
	if os.Getenv("WEBKIT_GST_VAAPI") == "" {
		os.Setenv("WEBKIT_GST_VAAPI", "1")
	}
	if os.Getenv("GST_VAAPI_ALL_DRIVERS") == "" {
		os.Setenv("GST_VAAPI_ALL_DRIVERS", "1")
	}
	if os.Getenv("WEBKIT_ENABLE_FULLSCREEN_VISUAL_COMPOSITOR") == "" {
		os.Setenv("WEBKIT_ENABLE_FULLSCREEN_VISUAL_COMPOSITOR", "1")
	}
}

func main() {
	pwaPort := 8080
	app := NewApp(pwaPort)

	err := wails.Run(&options.App{
		Title:     "Vayu",
		Width:     1300,
		Height:    850,
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets: assetsFS,
		},
		BackgroundColour: &options.RGBA{R: 20, G: 18, B: 16, A: 255},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
