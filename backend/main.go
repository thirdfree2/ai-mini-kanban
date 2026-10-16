package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type App struct{ db *pgxpool.Pool }
type User struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}
type Board struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"createdAt"`
}
type Task struct {
	StartDate   string    `json:"startDate"`
	EndDate     string    `json:"endDate"`
	ID          string    `json:"id"`
	BoardID     string    `json:"boardId"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Status      string    `json:"status"`
	Position    int       `json:"position"`
	CreatedAt   time.Time `json:"createdAt"`
}

const schema = `CREATE TABLE IF NOT EXISTS users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text UNIQUE NOT NULL,password_hash text NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS boards(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,name text NOT NULL,description text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,title text NOT NULL,description text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','done')),position integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS end_date date;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='tasks'::regclass AND conname='tasks_date_range_check') THEN ALTER TABLE tasks ADD CONSTRAINT tasks_date_range_check CHECK ((start_date IS NULL AND end_date IS NULL) OR (start_date IS NOT NULL AND end_date IS NOT NULL AND start_date <= end_date)); END IF; END $$;
CREATE INDEX IF NOT EXISTS tasks_board_idx ON tasks(board_id);
CREATE INDEX IF NOT EXISTS boards_user_idx ON boards(user_id);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);`

func main() {
	ctx := context.Background()
	db, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	for i := 0; i < 30; i++ {
		err = db.Ping(ctx)
		if err == nil {
			break
		}
		time.Sleep(time.Second)
	}
	if err != nil {
		log.Fatal(err)
	}
	if _, err = db.Exec(ctx, schema); err != nil {
		log.Fatal(err)
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	server := &http.Server{Addr: ":" + port, Handler: (&App{db}).router(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	log.Fatal(server.ListenAndServe())
}
func (a *App) router() *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	r.Use(func(c *gin.Context) { c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20); c.Next() })
	r.GET("/api/health", func(c *gin.Context) {
		if a.db == nil || a.db.Ping(c) == nil {
			c.JSON(200, gin.H{"status": "ok"})
		} else {
			c.JSON(503, gin.H{"error": "database unavailable"})
		}
	})
	r.POST("/api/auth/register", a.register)
	r.POST("/api/auth/login", a.login)
	p := r.Group("/api")
	p.Use(a.auth)
	p.GET("/auth/me", func(c *gin.Context) { c.JSON(200, gin.H{"user": c.MustGet("user")}) })
	p.POST("/auth/logout", a.logout)
	p.GET("/boards", a.boards)
	p.POST("/boards", a.createBoard)
	p.PATCH("/boards/:id", a.updateBoard)
	p.DELETE("/boards/:id", a.deleteBoard)
	p.GET("/boards/:id/tasks", a.tasks)
	p.POST("/boards/:id/tasks", a.createTask)
	p.PATCH("/tasks/:id", a.updateTask)
	p.DELETE("/tasks/:id", a.deleteTask)
	r.NoRoute(staticHandler(os.Getenv("STATIC_DIR")))
	return r
}
func fail(c *gin.Context, status int, msg string) { c.AbortWithStatusJSON(status, gin.H{"error": msg}) }
func tokenHash(t string) string                   { h := sha256.Sum256([]byte(t)); return hex.EncodeToString(h[:]) }
func validCredentials(email, password string) bool {
	return len(email) <= 254 && strings.Contains(email, "@") && len(password) >= 8 && len(password) <= 72
}
func validDate(s string) bool {
	if s == "" {
		return true
	}
	d, e := time.Parse("2006-01-02", s)
	return e == nil && d.Year() >= 1 && d.Format("2006-01-02") == s
}
func validDateRange(start, end string) bool {
	return validDate(start) && validDate(end) && ((start == "" && end == "") || (start != "" && end != "" && start <= end))
}
func validStatus(s string) bool { return s == "todo" || s == "in_progress" || s == "done" }
func (a *App) session(c *gin.Context, u User) {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		fail(c, 500, "session creation failed")
		return
	}
	token := hex.EncodeToString(b)
	_, e := a.db.Exec(c, "INSERT INTO sessions VALUES($1,$2,$3)", tokenHash(token), u.ID, time.Now().Add(7*24*time.Hour))
	if e != nil {
		fail(c, 500, "session creation failed")
		return
	}
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("session", token, 7*86400, "/", "", os.Getenv("COOKIE_SECURE") == "true", true)
	c.JSON(200, gin.H{"user": u, "token": token})
}
func (a *App) register(c *gin.Context) {
	var v struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if c.ShouldBindJSON(&v) != nil {
		fail(c, 400, "invalid request")
		return
	}
	v.Name = strings.TrimSpace(v.Name)
	v.Email = strings.ToLower(strings.TrimSpace(v.Email))
	if v.Name == "" || len(v.Name) > 100 || !validCredentials(v.Email, v.Password) {
		fail(c, 400, "name, valid email and password of 8–72 bytes required")
		return
	}
	hash, e := bcrypt.GenerateFromPassword([]byte(v.Password), bcrypt.DefaultCost)
	if e != nil {
		fail(c, 500, "registration failed")
		return
	}
	u := User{Name: v.Name, Email: v.Email}
	e = a.db.QueryRow(c, "INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING RETURNING id", v.Name, v.Email, string(hash)).Scan(&u.ID)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(c, 409, "email already registered")
		return
	}
	if e != nil {
		fail(c, 500, "registration failed")
		return
	}
	a.session(c, u)
}
func (a *App) login(c *gin.Context) {
	var v struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if c.ShouldBindJSON(&v) != nil {
		fail(c, 400, "invalid request")
		return
	}
	var u User
	var hash string
	e := a.db.QueryRow(c, "SELECT id,name,email,password_hash FROM users WHERE email=$1", strings.ToLower(strings.TrimSpace(v.Email))).Scan(&u.ID, &u.Name, &u.Email, &hash)
	if e != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(v.Password)) != nil {
		fail(c, 401, "invalid email or password")
		return
	}
	a.session(c, u)
}
func requestToken(c *gin.Context) string {
	if s := c.GetHeader("Authorization"); strings.HasPrefix(s, "Bearer ") {
		return strings.TrimPrefix(s, "Bearer ")
	}
	s, _ := c.Cookie("session")
	return s
}
func (a *App) auth(c *gin.Context) {
	t := requestToken(c)
	if t == "" {
		fail(c, 401, "login required")
		return
	}
	var u User
	e := a.db.QueryRow(c, "SELECT u.id,u.name,u.email FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()", tokenHash(t)).Scan(&u.ID, &u.Name, &u.Email)
	if e != nil {
		fail(c, 401, "login required")
		return
	}
	c.Set("user", u)
	c.Next()
}
func uid(c *gin.Context) string { return c.MustGet("user").(User).ID }
func (a *App) logout(c *gin.Context) {
	if _, e := a.db.Exec(c, "DELETE FROM sessions WHERE token_hash=$1", tokenHash(requestToken(c))); e != nil {
		fail(c, 500, "logout failed")
		return
	}
	c.SetCookie("session", "", -1, "/", "", false, true)
	c.Status(204)
}
func (a *App) boards(c *gin.Context) {
	rows, e := a.db.Query(c, "SELECT id,name,description,created_at FROM boards WHERE user_id=$1 ORDER BY created_at", uid(c))
	if e != nil {
		fail(c, 500, "could not load boards")
		return
	}
	defer rows.Close()
	out := []Board{}
	for rows.Next() {
		var b Board
		if rows.Scan(&b.ID, &b.Name, &b.Description, &b.CreatedAt) != nil {
			fail(c, 500, "could not load boards")
			return
		}
		out = append(out, b)
	}
	if rows.Err() != nil {
		fail(c, 500, "could not load boards")
		return
	}
	c.JSON(200, gin.H{"boards": out})
}
func (a *App) createBoard(c *gin.Context) {
	var b Board
	if c.ShouldBindJSON(&b) != nil || strings.TrimSpace(b.Name) == "" || len(b.Name) > 120 || len(b.Description) > 5000 {
		fail(c, 400, "board name required (maximum 120 characters)")
		return
	}
	b.Name = strings.TrimSpace(b.Name)
	e := a.db.QueryRow(c, "INSERT INTO boards(user_id,name,description) VALUES($1,$2,$3) RETURNING id,created_at", uid(c), strings.TrimSpace(b.Name), b.Description).Scan(&b.ID, &b.CreatedAt)
	if e != nil {
		fail(c, 500, "could not create board")
		return
	}
	c.JSON(201, gin.H{"board": b})
}
func (a *App) updateBoard(c *gin.Context) {
	var v struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
	}
	if c.ShouldBindJSON(&v) != nil || (v.Name != nil && (strings.TrimSpace(*v.Name) == "" || len(*v.Name) > 120)) || (v.Description != nil && len(*v.Description) > 5000) {
		fail(c, 400, "invalid board")
		return
	}
	if v.Name != nil {
		trimmed := strings.TrimSpace(*v.Name)
		v.Name = &trimmed
	}
	var b Board
	e := a.db.QueryRow(c, "UPDATE boards SET name=COALESCE($1,name),description=COALESCE($2,description) WHERE id::text=$3 AND user_id=$4 RETURNING id,name,description,created_at", v.Name, v.Description, c.Param("id"), uid(c)).Scan(&b.ID, &b.Name, &b.Description, &b.CreatedAt)
	if e != nil {
		if !errors.Is(e, pgx.ErrNoRows) {
			fail(c, 500, "could not update board")
			return
		}
		fail(c, 404, "board not found")
		return
	}
	c.JSON(200, gin.H{"board": b})
}
func (a *App) deleteBoard(c *gin.Context) {
	r, e := a.db.Exec(c, "DELETE FROM boards WHERE id::text=$1 AND user_id=$2", c.Param("id"), uid(c))
	if e != nil {
		fail(c, 500, "could not delete board")
		return
	}
	if r.RowsAffected() == 0 {
		fail(c, 404, "board not found")
		return
	}
	c.Status(204)
}
func (a *App) ownsBoard(c *gin.Context) bool {
	var ok bool
	e := a.db.QueryRow(c, "SELECT EXISTS(SELECT 1 FROM boards WHERE id::text=$1 AND user_id=$2)", c.Param("id"), uid(c)).Scan(&ok)
	if e != nil || !ok {
		fail(c, 404, "board not found")
		return false
	}
	return true
}
func (a *App) tasks(c *gin.Context) {
	if !a.ownsBoard(c) {
		return
	}
	rows, e := a.db.Query(c, "SELECT id,board_id,title,description,status,position,created_at,COALESCE(start_date::text,''),COALESCE(end_date::text,'') FROM tasks WHERE board_id::text=$1 ORDER BY position,created_at", c.Param("id"))
	if e != nil {
		fail(c, 500, "could not load tasks")
		return
	}
	defer rows.Close()
	out := []Task{}
	for rows.Next() {
		var t Task
		if rows.Scan(&t.ID, &t.BoardID, &t.Title, &t.Description, &t.Status, &t.Position, &t.CreatedAt, &t.StartDate, &t.EndDate) != nil {
			fail(c, 500, "could not load tasks")
			return
		}
		out = append(out, t)
	}
	if rows.Err() != nil {
		fail(c, 500, "could not load tasks")
		return
	}
	c.JSON(200, gin.H{"tasks": out})
}
func (a *App) createTask(c *gin.Context) {
	if !a.ownsBoard(c) {
		return
	}
	var t Task
	if c.ShouldBindJSON(&t) != nil {
		fail(c, 400, "invalid task")
		return
	}
	if t.Status == "" {
		t.Status = "todo"
	}
	if strings.TrimSpace(t.Title) == "" || len(t.Title) > 200 || len(t.Description) > 10000 || !validStatus(t.Status) || t.Position < 0 || !validDateRange(t.StartDate, t.EndDate) {
		fail(c, 400, "invalid task title, status, position or date range")
		return
	}
	t.Title = strings.TrimSpace(t.Title)
	t.BoardID = c.Param("id")
	e := a.db.QueryRow(c, "INSERT INTO tasks(board_id,title,description,status,position,start_date,end_date) VALUES($1,$2,$3,$4,$5,NULLIF($6,'')::date,NULLIF($7,'')::date) RETURNING id,created_at", t.BoardID, strings.TrimSpace(t.Title), t.Description, t.Status, t.Position, t.StartDate, t.EndDate).Scan(&t.ID, &t.CreatedAt)
	if e != nil {
		fail(c, 500, "could not create task")
		return
	}
	c.JSON(201, gin.H{"task": t})
}
func (a *App) updateTask(c *gin.Context) {
	var v struct {
		Title       *string `json:"title"`
		Description *string `json:"description"`
		Status      *string `json:"status"`
		Position    *int    `json:"position"`
		StartDate   *string `json:"startDate"`
		EndDate     *string `json:"endDate"`
	}
	if c.ShouldBindJSON(&v) != nil || (v.Title != nil && (strings.TrimSpace(*v.Title) == "" || len(*v.Title) > 200)) || (v.Description != nil && len(*v.Description) > 10000) || (v.Status != nil && !validStatus(*v.Status)) || (v.Position != nil && *v.Position < 0) || (v.StartDate != nil && !validDate(*v.StartDate)) || (v.EndDate != nil && !validDate(*v.EndDate)) {
		fail(c, 400, "invalid task")
		return
	}
	if v.Title != nil {
		trimmed := strings.TrimSpace(*v.Title)
		v.Title = &trimmed
	}
	var t Task
	e := a.db.QueryRow(c, "UPDATE tasks SET title=COALESCE($1,title),description=COALESCE($2,description),status=COALESCE($3,status),position=COALESCE($4,position),start_date=CASE WHEN $7::text IS NULL THEN start_date ELSE NULLIF($7,'')::date END,end_date=CASE WHEN $8::text IS NULL THEN end_date ELSE NULLIF($8,'')::date END WHERE id::text=$5 AND board_id IN(SELECT id FROM boards WHERE user_id=$6) RETURNING id,board_id,title,description,status,position,created_at,COALESCE(start_date::text,''),COALESCE(end_date::text,'')", v.Title, v.Description, v.Status, v.Position, c.Param("id"), uid(c), v.StartDate, v.EndDate).Scan(&t.ID, &t.BoardID, &t.Title, &t.Description, &t.Status, &t.Position, &t.CreatedAt, &t.StartDate, &t.EndDate)
	if e != nil {
		var pe *pgconn.PgError
		if errors.As(e, &pe) && pe.Code == "23514" {
			fail(c, 400, "startDate and endDate must both be present and ordered")
			return
		}
		if !errors.Is(e, pgx.ErrNoRows) {
			fail(c, 500, "could not update task")
			return
		}
		fail(c, 404, "task not found")
		return
	}
	c.JSON(200, gin.H{"task": t})
}
func (a *App) deleteTask(c *gin.Context) {
	r, e := a.db.Exec(c, "DELETE FROM tasks WHERE id::text=$1 AND board_id IN(SELECT id FROM boards WHERE user_id=$2)", c.Param("id"), uid(c))
	if e != nil {
		fail(c, 500, "could not delete task")
		return
	}
	if r.RowsAffected() == 0 {
		fail(c, 404, "task not found")
		return
	}
	c.Status(204)
}

// staticHandler serves a compiled frontend while preserving the API namespace.
func staticHandler(directory string) gin.HandlerFunc {
	root, rootErr := filepath.Abs(directory)
	if directory != "" && rootErr == nil {
		root, rootErr = filepath.EvalSymlinks(root)
	}
	return func(c *gin.Context) {
		requestPath := c.Request.URL.Path
		if requestPath == "/api" || strings.HasPrefix(requestPath, "/api/") {
			fail(c, 404, "API route not found")
			return
		}
		if directory == "" || rootErr != nil || c.Request.Method != http.MethodGet {
			fail(c, 404, "not found")
			return
		}
		if strings.Contains(requestPath, "\\") {
			fail(c, 404, "not found")
			return
		}
		for _, segment := range strings.Split(requestPath, "/") {
			if segment == ".." || strings.HasPrefix(segment, ".") {
				fail(c, 404, "not found")
				return
			}
		}
		serve := func(relative string) bool {
			resolved, e := filepath.EvalSymlinks(filepath.Join(root, relative))
			if e != nil {
				return false
			}
			rel, e := filepath.Rel(root, resolved)
			if e != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
				return false
			}
			file, e := os.Open(resolved)
			if e != nil {
				return false
			}
			defer file.Close()
			info, e := file.Stat()
			if e != nil || !info.Mode().IsRegular() {
				return false
			}
			http.ServeContent(c.Writer, c.Request, info.Name(), info.ModTime(), file)
			return true
		}
		relative := strings.TrimPrefix(requestPath, "/")
		if relative != "" && serve(relative) {
			return
		}
		if requestPath == "/assets" || strings.HasPrefix(requestPath, "/assets/") || filepath.Ext(requestPath) != "" {
			fail(c, 404, "not found")
			return
		}
		if serve("index.html") {
			return
		}
		fail(c, 404, "not found")
	}
}
