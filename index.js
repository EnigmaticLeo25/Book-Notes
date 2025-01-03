import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import pg from "pg";
import session from "express-session";
import rateLimit from "express-rate-limit";
import pgSession from "connect-pg-simple";
import dotenv from "dotenv";

dotenv.config();

const db = new pg.Pool({
  connectionString: process.env.EURL,
  ssl: {
    rejectUnauthorized: false,
  },
});
db.connect((err) => {
  if (err) {
    throw err;
  } else {
    console.log("Connected.");
  }
});
const app = express();

app.set("trust proxy", 1);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));

app.set("view engine", "ejs");

// Rate limiter for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many login attempts. Please try again after 15 minutes.",
});

// Initialize PostgreSQL session store
const PostgresqlStore = pgSession(session);

// Session configuration
app.use(
  session({
    store: new PostgresqlStore({
      pool: db,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "your-secure-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 60 * 60 * 1000, // 1 hours
    },
  })
);

function checkAuth(req, res, next) {
  if (req.session.isAuthenticated) {
    next();
  } else {
    res.redirect("/login");
  }
}

app.post("/login", loginLimiter, (req, res) => {
  const { password } = req.body;

  if (password === process.env.ADMIN_PASSWORD) {
    req.session.isAuthenticated = true;
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).send("Error logging in");
      }
      res.redirect("/admin");
    });
  } else {
    res.render("login.ejs", { error: "Invalid password" });
  }
});

app.get("/admin", checkAuth, async (req, res) => {
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
      console.error("Session destruction error:", err);
      return res.status(500).send("Error logging out");
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
  const { title, author_name, cover_i, key, rating, date_read, review } =
    req.body;
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

    res.redirect("/admin");
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

    res.render("index.ejs", { books });
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
    await db.query(
      "UPDATE books SET rating = $1, date_read = $2 WHERE id = $3",
      [rating, date_read, id]
    );
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

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
