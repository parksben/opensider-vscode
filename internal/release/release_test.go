package release

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func swapEndpoints(api, web string) (restore func()) {
	oldAPI, oldWeb := apiLatest, webLatest
	apiLatest, webLatest = api, web
	return func() { apiLatest, webLatest = oldAPI, oldWeb }
}

func TestTagFromLocation(t *testing.T) {
	good := map[string]string{
		"https://github.com/parksben/opensider-vscode/releases/tag/v0.1.0":     "v0.1.0",
		"https://github.com/parksben/opensider-vscode/releases/tag/v0.2.0?x=1": "v0.2.0",
	}
	for location, want := range good {
		got, err := tagFromLocation(location)
		if err != nil || got != want {
			t.Fatalf("tagFromLocation(%q) = %q, %v; want %q", location, got, err, want)
		}
	}
	if tag, err := tagFromLocation("https://github.com/login"); err == nil {
		t.Fatalf("tagFromLocation(login) = %q; want an error", tag)
	}
}

func TestLatestFallsBackWhenAPIIsRateLimited(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"message":"API rate limit exceeded"}`, http.StatusForbidden)
	}))
	defer api.Close()
	web := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/parksben/opensider-vscode/releases/tag/v0.9.0", http.StatusFound)
	}))
	defer web.Close()
	defer swapEndpoints(api.URL, web.URL)()

	info, err := Latest(2 * time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if info.Tag != "v0.9.0" {
		t.Fatalf("got tag %q", info.Tag)
	}
}

func TestLatestErrorsWhenBothEndpointsFail(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusForbidden)
	}))
	defer api.Close()
	web := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "no redirect", http.StatusOK)
	}))
	defer web.Close()
	defer swapEndpoints(api.URL, web.URL)()

	if _, err := Latest(2 * time.Second); err == nil {
		t.Fatal("expected an error when the API and the website both fail")
	}
}
