package main

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestValidation(t *testing.T) {
	for _, v := range []struct {
		email, password string
		want            bool
	}{{"a@b.com", "password", true}, {"bad", "password", false}, {"a@b.com", "short", false}, {"a@b.com", string(bytes.Repeat([]byte("x"), 73)), false}} {
		if validCredentials(v.email, v.password) != v.want {
			t.Errorf("credential validation mismatch for %s", v.email)
		}
	}
	for _, s := range []string{"todo", "in_progress", "done"} {
		if !validStatus(s) {
			t.Fatal(s)
		}
	}
	if validStatus("invalid") {
		t.Fatal("accepted invalid status")
	}
}
func TestUnauthenticatedRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := (&App{}).router()
	for _, path := range []string{"/api/boards", "/api/boards/other/tasks", "/api/auth/me"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 401 {
			t.Fatalf("%s: %d", path, w.Code)
		}
	}
}
func TestTokenHash(t *testing.T) {
	if tokenHash("a") == "a" || len(tokenHash("a")) != 64 || tokenHash("a") == tokenHash("b") {
		t.Fatal("invalid token digest")
	}
}
func TestDatabaseIntegration(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	db, e := pgxpool.New(context.Background(), url)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	if _, e = db.Exec(context.Background(), schema); e != nil {
		t.Fatal(e)
	}
	r := (&App{db}).router()
	call := func(method, path, token string, body any) (int, map[string]any) {
		var buf bytes.Buffer
		if body != nil {
			json.NewEncoder(&buf).Encode(body)
		}
		q := httptest.NewRequest(method, path, &buf)
		q.Header.Set("Content-Type", "application/json")
		if token != "" {
			q.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, q)
		var out map[string]any
		json.Unmarshal(w.Body.Bytes(), &out)
		return w.Code, out
	}
	email := "integration-" + time.Now().Format("20060102150405.000000000") + "@example.com"
	code, u := call("POST", "/api/auth/register", "", gin.H{"name": "Test", "email": email, "password": "testpassword"})
	if code != 200 {
		t.Fatalf("register: %d %v", code, u)
	}
	token := u["token"].(string)
	userID := u["user"].(map[string]any)["id"].(string)
	defer db.Exec(context.Background(), "DELETE FROM users WHERE id=$1", userID)
	code, b := call("POST", "/api/boards", token, gin.H{"name": "Private"})
	if code != 201 {
		t.Fatalf("board: %d %v", code, b)
	}
	id := b["board"].(map[string]any)["id"].(string)
	code, other := call("POST", "/api/auth/register", "", gin.H{"name": "Other", "email": "other-" + email, "password": "testpassword"})
	if code != 200 {
		t.Fatal(other)
	}
	otherToken := other["token"].(string)
	defer db.Exec(context.Background(), "DELETE FROM users WHERE id=$1", other["user"].(map[string]any)["id"])
	if code, _ = call("GET", "/api/boards/"+id+"/tasks", otherToken, nil); code != 404 {
		t.Fatalf("ownership not enforced: %d", code)
	}
	code, task := call("POST", "/api/boards/"+id+"/tasks", token, gin.H{"title": "Persist me"})
	if code != 201 {
		t.Fatal(task)
	}
	taskID := task["task"].(map[string]any)["id"].(string)
	if code, _ = call("PATCH", "/api/tasks/"+taskID, otherToken, gin.H{"status": "done"}); code != 404 {
		t.Fatal("other user updated task")
	}

	for _, path := range []string{"/api/tasks/" + taskID, "/api/boards/" + id} {
		if code, _ = call("DELETE", path, otherToken, nil); code != 404 {
			t.Fatalf("other user deleted resource %s: %d", path, code)
		}
	}
	if code, _ = call("PATCH", "/api/tasks/"+taskID, token, gin.H{"status": "invalid"}); code != 400 {
		t.Fatal("invalid status accepted")
	}
	if code, _ = call("PATCH", "/api/tasks/"+taskID, token, gin.H{"status": "done", "position": 2}); code != 200 {
		t.Fatal("task move failed")
	}
	code, list := call("GET", "/api/boards/"+id+"/tasks", token, nil)
	if code != 200 || list["tasks"].([]any)[0].(map[string]any)["status"] != "done" {
		t.Fatal("move did not persist")
	}

	for _, body := range []gin.H{{"title": "Bad date", "startDate": "2026-02-30", "endDate": "2026-03-01"}, {"title": "Missing end", "startDate": "2026-10-16"}, {"title": "Reversed", "startDate": "2026-10-20", "endDate": "2026-10-16"}} {
		if code, _ = call("POST", "/api/boards/"+id+"/tasks", token, body); code != 400 {
			t.Fatal("invalid date create accepted")
		}
	}
	if code, _ = call("PATCH", "/api/tasks/"+taskID, token, gin.H{"startDate": "2026-10-16", "endDate": "2026-10-20"}); code != 200 {
		t.Fatal("schedule patch failed")
	}
	code, preserved := call("PATCH", "/api/tasks/"+taskID, token, gin.H{"title": "Dates preserved"})
	if code != 200 || preserved["task"].(map[string]any)["startDate"] != "2026-10-16" {
		t.Fatal("omitted date not preserved")
	}
	if code, _ = call("PATCH", "/api/tasks/"+taskID, token, gin.H{"startDate": "2026-10-21"}); code != 400 {
		t.Fatal("reversed partial range accepted")
	}
	if code, _ = call("PATCH", "/api/tasks/"+taskID, otherToken, gin.H{"endDate": "2026-10-22"}); code != 404 {
		t.Fatal("other user scheduled task")
	}
	if code, _ = call("PATCH", "/api/tasks/"+taskID, token, gin.H{"endDate": "2026-10-22"}); code != 200 {
		t.Fatal("valid partial range rejected")
	}
	code, dated := call("GET", "/api/boards/"+id+"/tasks", token, nil)
	datedTask := dated["tasks"].([]any)[0].(map[string]any)
	if code != 200 || datedTask["startDate"] != "2026-10-16" || datedTask["endDate"] != "2026-10-22" {
		t.Fatal("dates not persisted")
	}
	if code, _ = call("PATCH", "/api/tasks/"+taskID, token, gin.H{"startDate": ""}); code != 400 {
		t.Fatal("partial clear accepted")
	}
	code, cleared := call("PATCH", "/api/tasks/"+taskID, token, gin.H{"startDate": "", "endDate": ""})
	if code != 200 || cleared["task"].(map[string]any)["startDate"] != "" || cleared["task"].(map[string]any)["endDate"] != "" {
		t.Fatal("clear failed")
	}
	code, scheduled := call("POST", "/api/boards/"+id+"/tasks", token, gin.H{"title": "Scheduled", "startDate": "2026-10-16", "endDate": "2026-10-18"})
	if code != 201 || scheduled["task"].(map[string]any)["endDate"] != "2026-10-18" {
		t.Fatal("scheduled create failed")
	}
	code, logged := call("POST", "/api/auth/login", "", gin.H{"email": email, "password": "testpassword"})
	if code != 200 {
		t.Fatal("login failed")
	}
	expiredToken := logged["token"].(string)
	if _, e = db.Exec(context.Background(), "UPDATE sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1", tokenHash(expiredToken)); e != nil {
		t.Fatal(e)
	}
	if code, _ = call("GET", "/api/auth/me", expiredToken, nil); code != 401 {
		t.Fatal("expired session accepted")
	}
	if code, _ = call("POST", "/api/auth/logout", token, nil); code != http.StatusNoContent {
		t.Fatal("logout failed")
	}
	if code, _ = call("GET", "/api/auth/me", token, nil); code != 401 {
		t.Fatal("session not revoked")
	}
}

func TestDateRangeValidation(t *testing.T) {
	for _, v := range []struct {
		start, end string
		valid      bool
	}{{"", "", true}, {"2026-10-16", "2026-10-16", true}, {"2026-10-16", "2026-10-20", true}, {"2026-10-20", "2026-10-16", false}, {"2026-02-30", "2026-03-01", false}, {"2026-10-16", "", false}, {"", "2026-10-16", false}, {"2026-1-01", "2026-10-16", false}, {"0000-01-01", "2026-10-16", false}} {
		if validDateRange(v.start, v.end) != v.valid {
			t.Errorf("range %q/%q", v.start, v.end)
		}
	}
}

func TestStaticFrontend(t *testing.T) {
	directory := t.TempDir()
	if e := os.Mkdir(filepath.Join(directory, "assets"), 0755); e != nil {
		t.Fatal(e)
	}
	for path, body := range map[string]string{"index.html": "<html>Kanban application</html>", "assets/app.js": "console.log('kanban')", ".private": "secret"} {
		if e := os.WriteFile(filepath.Join(directory, path), []byte(body), 0644); e != nil {
			t.Fatal(e)
		}
	}
	outside := filepath.Join(t.TempDir(), "outside.txt")
	if e := os.WriteFile(outside, []byte("outside secret"), 0644); e != nil {
		t.Fatal(e)
	}
	if e := os.Symlink(outside, filepath.Join(directory, "outside.txt")); e != nil {
		t.Fatal(e)
	}
	t.Setenv("STATIC_DIR", directory)
	r := (&App{}).router()
	for _, test := range []struct {
		method, path string
		status       int
		body         string
	}{{"GET", "/", 200, "Kanban application"}, {"GET", "/boards/abc", 200, "Kanban application"}, {"GET", "/assets/app.js", 200, "console.log"}, {"GET", "/assets/missing.js", 404, "not found"}, {"GET", "/assets/missing", 404, "not found"}, {"GET", "/missing.ico", 404, "not found"}, {"GET", "/api/missing", 404, "API route not found"}, {"GET", "/api", 404, "API route not found"}, {"POST", "/boards/abc", 404, "not found"}, {"GET", "/../outside.txt", 404, "not found"}, {"GET", "/%2e%2e/outside.txt", 404, "not found"}, {"GET", "/.private", 404, "not found"}, {"GET", "/outside.txt", 404, "not found"}} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(test.method, test.path, nil))
		if w.Code != test.status || !strings.Contains(w.Body.String(), test.body) {
			t.Errorf("%s %s got %d %q", test.method, test.path, w.Code, w.Body.String())
		}
		if strings.Contains(w.Body.String(), "outside secret") {
			t.Fatal("outside file disclosed")
		}
	}
}
func TestDefaultAPIOnly(t *testing.T) {
	t.Setenv("STATIC_DIR", "")
	r := (&App{}).router()
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != 404 {
		t.Fatal(w.Code)
	}
}
