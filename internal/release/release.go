// Package release looks up the latest GitHub Release tag.
//
// The side panel compares it with the installed extension and, only when the tag is
// actually newer, shows the update button. A rate limit or any other failure is
// silent: the caller must not change the panel when this returns an error.
package release

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Endpoints are variables so tests can point them at a local server.
var (
	apiLatest = "https://api.github.com/repos/parksben/opensider-vscode/releases/latest"
	// The website redirect is not subject to the unauthenticated API quota. It can be
	// served from a CDN cache, so it is only the fallback after the API fails.
	webLatest = "https://github.com/parksben/opensider-vscode/releases/latest"
)

// Info is one successful lookup.
type Info struct {
	Tag       string
	CheckedAt string
}

// Latest returns the newest release tag. The API is tried first; a rate limit or
// any other API failure falls through to the website redirect. Both failing is an
// error and must be swallowed by the caller.
func Latest(timeout time.Duration) (Info, error) {
	info, apiErr := fetchViaAPI(timeout)
	if apiErr == nil {
		return info, nil
	}
	info, webErr := fetchViaRedirect(timeout)
	if webErr == nil {
		return info, nil
	}
	return Info{}, fmt.Errorf("github: api %v; web %v", apiErr, webErr)
}

func fetchViaAPI(timeout time.Duration) (Info, error) {
	client := &http.Client{Timeout: timeout}
	req, err := http.NewRequest(http.MethodGet, apiLatest, nil)
	if err != nil {
		return Info{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "opensider-vscode-host")
	resp, err := client.Do(req)
	if err != nil {
		return Info{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Info{}, fmt.Errorf("HTTP %s", resp.Status)
	}
	var payload struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return Info{}, err
	}
	tag := strings.TrimSpace(payload.TagName)
	if tag == "" {
		return Info{}, errors.New("empty tag")
	}
	return newInfo(tag), nil
}

func fetchViaRedirect(timeout time.Duration) (Info, error) {
	client := &http.Client{
		Timeout:       timeout,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	req, err := http.NewRequest(http.MethodGet, webLatest, nil)
	if err != nil {
		return Info{}, err
	}
	req.Header.Set("User-Agent", "opensider-vscode-host")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Pragma", "no-cache")
	resp, err := client.Do(req)
	if err != nil {
		return Info{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusFound && resp.StatusCode != http.StatusMovedPermanently &&
		resp.StatusCode != http.StatusTemporaryRedirect && resp.StatusCode != http.StatusPermanentRedirect {
		return Info{}, fmt.Errorf("HTTP %s", resp.Status)
	}
	tag, err := tagFromLocation(resp.Header.Get("Location"))
	if err != nil {
		return Info{}, err
	}
	return newInfo(tag), nil
}

func tagFromLocation(location string) (string, error) {
	parsed, err := url.Parse(location)
	if err != nil {
		return "", err
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	for i := 0; i+1 < len(parts); i++ {
		if parts[i] == "tag" && parts[i+1] != "" {
			return parts[i+1], nil
		}
	}
	return "", fmt.Errorf("no tag in %q", location)
}

func newInfo(tag string) Info {
	return Info{Tag: tag, CheckedAt: time.Now().UTC().Format(time.RFC3339)}
}
