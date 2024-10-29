import express from "express"
import axios from "axios"
import bodyParser from "body-parser"
import pg from "pg"

const app = express()
app.use(bodyParser.urlencoded({extended: true}))
app.use(express.static("public"))

const db = new pg.Client({
    user:'postgres',
    host:'localhost',
    database:'book_app',
    password:'Ethan@q25',
    port:5432
})

db.connect()

app.get('/',async (req,res)=>{
    try{
        const result = await db.query("select * from books order by date_read desc")
        
        res.render('index.ejs',{books:result.rows})
    }
    catch(err){
        console.error(err)
        res.send('Error fetching books')
    }
})

app.post('/search',async (req,res)=>{
    const title = req.body.title;
    try{
        const result = await axios.get(`https://openlibrary.org/search.json?title=${encodeURIComponent(title)}`)
        const books = result.data.docs.slice(0,10)
        res.render('search.ejs',{books,title})
    }catch(err){
        console.error('Error searching for books:', error);
    res.send('Error occurred while searching for books.');
    }
})

app.post('/add-to-list',async (req,res)=>{
    const { title, author_name, cover_i, key } = req.body;
    
    res.render('add.ejs',{ title, author_name, cover_i, key })

})

app.post('/save', async (req,res)=>{
    const { title, author_name, cover_i, key, rating, date_read } = req.body;
    const cover_url = cover_i ? `https://covers.openlibrary.org/b/id/${cover_i}-M.jpg` : null;
    try {
        // Insert book into PostgreSQL database
        const insertQuery = `
            INSERT INTO books (title, author, cover_url, openlibrary_id, rating, date_read)
            VALUES ($1, $2, $3, $4, $5, $6);
        `;
        await db.query(insertQuery, [title, author_name, cover_url, key, rating, date_read]);
        
        res.redirect('/');  // Redirect to book list after successful save
    } catch (err) {
        console.error(err);
        res.status(500).send('Error saving book to the database');
    }
})

app.get('/sort', async (req, res) => {
    const sortOption = req.query.sort;
    let sortBy = 'date_read'; // Default sort by date_read
    let sortOrder = 'ASC'; // Default order

    if (sortOption === 'rating') {
        sortBy = 'rating';
        sortOrder = 'DESC'; // Highest rating first
    }

    try {
        const result = await db.query(`SELECT * FROM books ORDER BY ${sortBy} ${sortOrder}`);
        const books = result.rows;

        // Render the book list with sorted books
        res.render('index.ejs', { books }); // Update with your EJS template name
    } catch (error) {
        console.error('Error fetching sorted books:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/delete/:id', async (req, res) => {
    const id = req.params.id;
    try {
        await db.query('DELETE FROM books WHERE id = $1', [id]);
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.send('Error deleting book');
    }
});

app.post('/edit/:id',async (req,res) => {
    const id = req.params.id;
    try{

    }catch(err){
        
    }
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});