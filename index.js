import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import pg from "pg";
import session from "express-session";
import rateLimit from 'express-rate-limit';
import pgSession from 'connect-pg-simple';
import dotenv from 'dotenv';

dotenv.config();

// Add database configuration
const db = new pg.Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "book_app",
  password: process.env.ADMIN_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

const app = express();
const PgSession = pgSession(session);

// Add body-parser middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));

// Set view engine
app.set('view engine', 'ejs');

// Rate limiter for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many login attempts. Please try again after 15 minutes.'
});

// Session configuration
app.use(session({
  store: new PgSession({
    pool: db,                // Use the same postgres db
    tableName: 'user_sessions'  // Table to store sessions
  }),
  secret: process.env.SESSION_SECRET || 'your-secure-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Middleware to check authentication
function checkAuth(req, res, next) {
  if (req.session.isAuthenticated) {
    next();
  } else {
    res.redirect('/admin');
  }
}

// Apply rate limiter to admin route
app.post("/admin", loginLimiter, (req, res) => {
  const { password } = req.body;
  
  if (password === process.env.ADMIN_PASSWORD) {
    req.session.isAuthenticated = true;
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).send('Error logging in');
      }
      res.redirect("/login");
    });
  } else {
    res.render("login.ejs", { error: "Invalid password" });
  }
});

// Protected routes
app.get("/login", checkAuth, async (req, res) => {
  try {
    const result = await db.query(
      "select * from books order by date_read desc"
    );
    res.render("index.ejs", { books: result.rows });
  } catch (err) {
    console.error(err);
    res.send("Error fetching books");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
      return res.status(500).send('Error logging out');
    }
    res.redirect("/admin");
  });
});

app.post("/search", async (req, res) => {
  const title = req.body.title;
  try {
    const result = await axios.get(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}`
    );
    const books = result.data.docs.slice(0, 10);
    res.render("search.ejs", { books, title });
  } catch (err) {
    console.error("Error searching for books:", error);
    res.send("Error occurred while searching for books.");
  }
});

app.post("/add-to-list", async (req, res) => {
  const { title, author_name, cover_i, key } = req.body;

  res.render("add.ejs", { title, author_name, cover_i, key });
});

app.post("/save", async (req, res) => {
  const { title, author_name, cover_i, key, rating, date_read, review } = req.body;
  const cover_url = cover_i
    ? `https://covers.openlibrary.org/b/id/${cover_i}-M.jpg`
    : null;
  try {
    // Insert book into PostgreSQL database
    const insertQuery = `
            INSERT INTO books (title, author, cover_url, openlibrary_id, rating, date_read, review)
            VALUES ($1, $2, $3, $4, $5, $6, $7);
        `;
    await db.query(insertQuery, [
      title,
      author_name,
      cover_url,
      key,
      rating,
      date_read,
      review,
    ]);

    res.redirect("/"); // Redirect to book list after successful save
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving book to the database");
  }
});

app.get("/sort", async (req, res) => {
  const sortOption = req.query.sort;
  let sortBy = "date_read"; // Default sort by date_read
  let sortOrder = "ASC"; // Default order

  if (sortOption === "rating") {
    sortBy = "rating";
    sortOrder = "DESC"; // Highest rating first
  }

  try {
    const result = await db.query(
      `SELECT * FROM books ORDER BY ${sortBy} ${sortOrder}`
    );
    const books = result.rows;

    // Render the book list with sorted books
    res.render("index.ejs", { books }); // Update with your EJS template name
  } catch (error) {
    console.error("Error fetching sorted books:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/delete/:id", async (req, res) => {
  const id = req.params.id;
  try {
    await db.query("DELETE FROM books WHERE id = $1", [id]);
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.send("Error deleting book");
  }
});

app.post("/edit/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.query("select * from books where id = $1", [id]);
    const book = result.rows;
    
    res.render("edit.ejs", { book: book[0] });
  } catch (err) {}
});

app.post("/save/:id", async (req, res) => {
  const id = req.params.id;
  const { rating, date_read } = req.body;
  try {
    await db.query("UPDATE books SET rating = $1, date_read = $2 WHERE id = $3", [rating, date_read, id]);
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating book");
  }
});

app.get("/", async (req, res) => {
  const result = await db.query("select * from books order by date_read desc");
  res.render("actual.ejs", { books: result.rows });
});

app.get("/admin", (req, res) => {
  res.render("login.ejs");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
