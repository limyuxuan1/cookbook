const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const crypto = require('crypto');
const session = require('express-session');
const app = express();
//set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req,file,cb)=> {
        cb(null,'public/images');
    },
    filename: (req,file,cb)=>{
        cb(null,file.originalname);
    }
});

const upload = multer ({storage:storage});
// Create MySQL connection
const connection = mysql.createConnection({
host: 'mysql-yuxuan.alwaysdata.net',
user: 'yuxuan',
password: 'localhost123',
database: 'yuxuan_cookbook'
});

connection.connect((err) => {
if (err) {
console.error('Error connecting to MySQL:', err);
return;
}
console.log('Connected to MySQL database');
});
// Set up view engine
app.set('view engine', 'ejs');
// enable static files
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded ({
    extended:false
}));

app.use(session({
    secret: 'mysecretkey',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));
// Define routes

const hashPassword = (password) => {
    return crypto.createHash('sha256')
      .update(password)
      .digest('hex');
}

const verifyPassword = (inputPassword, storedHash) => {
    const inputHash = hashPassword(inputPassword);
    return inputHash === storedHash;
}

const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).send('You must be logged in to access this resource');
    }
    next();
};

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', upload.single('image'), (req, res) => {

    const { username, email, password, bio } = req.body;

    let profilePicture;

    if (req.file) {
        profilePicture = req.file.filename;
    } else {
        profilePicture = null;
    }

    if (!username || !email || !password || !bio) {
        res.status(400).send({ meessage: "Invalid request"});
        return;
    }

    const hashedPassword = hashPassword(password);

    const sql = 'INSERT INTO users (username, email, password_hash, profile_picture, bio) VALUES (?,?,?,?,?)';
    connection.query (sql, [username, email, hashedPassword, profilePicture, bio], (error,results) =>{
        if (error){
            console.error("Error adding user:", error);
            res.status(500).send ('Error adding user');
        } else {
            res.redirect('/');
        }
    });

});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {

    const { username, password } = req.body;

    if (!username || !password ) {
        res.status(400).send( "Invalid request");
        return;
    }

    const sql = 'SELECT * FROM users WHERE username = ?';
    connection.query(sql, [username], (error, results) => {
        if (error) {
            console.error('Error getting user: ', error);
            res.status(500).send('Error getting user');
        } else {
            if (results.length == 0) {
                res.status(401).send("User not found");
                return;
            } else {
                const user = results[0];
                const isPasswordCorrect = verifyPassword(password, user.password_hash);
                 
                if (isPasswordCorrect) {
                    req.session.userId = user.user_id;
                    // res.status(200).send("Login successful");
                    res.redirect('/');
                } else {
                    res.status(401).send("Invalid password");
                    return;
                }
            }
        }
    });
});

app.patch('/update', upload.single('image'), requireAuth, (req, res) => {
    const userId = req.session.userId;

    const { username, email, bio } = req.body;

    let profilePicture;

    if (req.file) {
        profilePicture = req.file.filename;
    } else {
        profilePicture = null;
    }

    let sql = 'UPDATE users SET ';
    const values = [];
    const updateFields = [];

    if (username) {
        updateFields.push('username = ?');
        values.push(username);
    }
    if (email) {
        updateFields.push('email = ?');
        values.push(email);
    }
    if (bio) {
        updateFields.push('bio = ?');
        values.push(bio);
    }
    if (profilePicture) {
        updateFields.push('profile_picture = ?');
        values.push(profilePicture);
    }

    sql += updateFields.join(', ');
    sql += ' WHERE user_id = ?';
    values.push(userId);

    connection.query(sql, values, (error, results) => {
        if (error) {
            console.error("Error updating user:", error);
            res.status(500).json({ message: 'Error updating user' });
        } else {
            if (results.affectedRows > 0) {
                res.status(200).send('User updated successfully' );
            } else {
                res.status(404).send('User not found');
            }
        }
    });
});

app.get('/recipe', requireAuth, (req, res) => {
    res.render('addProduct');
});

app.post('/recipe', upload.single('image'), requireAuth, (req, res) => {
    const userId = req.session.userId;
    const { title, ingredients, instructions, prepTime, cuisineType } = req.body;
    
    let image;

    if (req.file) {
        image = req.file.filename;
    } else {
        image = null;
    }

    if (!title || !ingredients || !instructions || !prepTime || !cuisineType) {
        res.status(400).send({ meessage: "Invalid request"});
        return;
    }

    const sql = 'INSERT INTO recipe (user_id, title, ingredient, instructions, prep_time, cuisine_type, image) VALUES (?,?,?,?,?,?,?)';
    connection.query (sql, [userId, title, ingredients, instructions, prepTime, cuisineType, image], (error,results) =>{
        if (error){
            console.error("Error adding recipe:", error);
            res.status(500).send ('Error adding recipe');
        } else {
            res.redirect('/');
        }
    });
});

app.get('/recipe/:id', (req, res) => {
    const recipeId = req.params.id;
    const sql = 'SELECT * FROM recipe WHERE recipe_id = ?';
    connection.query(sql, [recipeId], (error, results) => {
        if (error) {
            console.error("Error fetching recipe:", error);
            res.status(500).send('Error fetching recipe');
        } else {
            if (results.length > 0) {
                res.render('product', { recipe: results[0] });
            } else {
                res.status(404).send('Recipe not found');
            }
        }
    });
});

app.get('/', (req, res) => {
    const { cuisine, ingredients, prepTime } = req.query;

    let sql = 'SELECT * FROM recipe';
    let filters = [];

    if (cuisine || ingredients || prepTime) {
        sql += ' WHERE';

        if (cuisine) {
            sql += ' cuisine_type = ?';
            filters.push(cuisine);
        }

        if (ingredients) {
            if (filters.length) sql += ' AND';
            sql += ' ingredient LIKE ?';
            filters.push('%' + ingredients + '%');
        }

        if (prepTime) {
            if (filters.length) sql += ' AND';
            sql += ' prep_time <= ?';
            filters.push(prepTime);
        }
    }

    connection.query(sql, filters, (error, results) => {
        if (error) {
            console.error("Error retrieving recipes:", error);
            res.status(500).send('Error retrieving recipes');
        } else {
            res.render('index', { recipes: results });
        }
    });
});

app.get('/recipe/:id/edit', requireAuth, (req, res) => {
    const { id } = req.params;
    const userId = req.session.userId;

    const sql = 'SELECT * FROM recipe WHERE recipe_id = ? AND user_id = ?';
    connection.query(sql, [id, userId], (error, results) => {
        if (error) {
            console.error("Error fetching recipe:", error);
            res.status(500).send('Error fetching recipe');
        } else if (results.length == 0) {
            res.status(404).send('Recipe not found or user not authorized');
        } else {
            res.render('editProduct', { recipe: results[0] });
        }
    });
});

app.post('/recipe/:id', upload.single('image'),  requireAuth, (req, res) => {
    const { id } = req.params;
    const userId = req.session.userId;
    const { title, ingredients, instructions, prepTime, cuisineType } = req.body;

    let image;
    if (req.file) {
        image = req.file.path;
    }

    if (!userId) {
        res.status(400).send("Invalid request");
        return;
    }

    let sql = 'UPDATE recipe SET';
    const fields = [];
    const values = [];

    if (title) {
        fields.push('title = ?');
        values.push(title);
    }

    if (ingredients) {
        fields.push('ingredient = ?');
        values.push(ingredients);
    }

    if (instructions) {
        fields.push('instructions = ?');
        values.push(instructions);
    }

    if (prepTime) {
        fields.push('prep_time = ?');
        values.push(prepTime);
    }

    if (cuisineType) {
        fields.push('cuisine_type = ?');
        values.push(cuisineType);
    }

    if (image) {
        fields.push('image = ?');
        values.push(image);
    }

    if (fields.length == 0) {
        res.status(400).send({ message: "No fields to update" });
        return;
    }

    sql += ' ' + fields.join(', ') + ' WHERE recipe_id = ? AND user_id = ?';
    values.push(id, userId);

    connection.query(sql, values, (error, results) => {
        if (error) {
            console.error("Error updating recipe:", error);
            res.status(500).send('Error updating recipe');
        } else if (results.affectedRows == 0) {
            res.status(404).send('Recipe not found or user not authorized');
        } else {
            // res.send('Recipe updated successfully');
            res.redirect('/');
        }
    });
});

app.delete('/recipe/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const userId = req.session.userId;

    if (!userId) {
        res.status(400).send("Invalid request");
        return;
    }

    const sql = 'DELETE FROM recipe WHERE recipe_id = ? AND user_id = ?';
    const values = [id, userId];

    connection.query(sql, values, (error, results) => {
        if (error) {
            console.error("Error deleting recipe:", error);
            res.status(500).send('Error deleting recipe');
        } else if (results.affectedRows == 0) {
            res.status(404).send('Recipe not found or user not authorized');
        } else {
            res.send('Recipe deleted successfully');
        }
    });
});

app.post('/recipe/:id/comment', requireAuth, (req, res) => {
    const { id } = req.params;
    const userId = req.session.userId;
    const { commentText } = req.body;

    if (!userId || !commentText) {
        res.status(400).send({ message: "Invalid request" });
        return;
    }

    const sql = 'INSERT INTO comments (recipe_id, user_id, comment_text) VALUES (?, ?, ?)';
    connection.query(sql, [id, userId, commentText], (error, results) => {
        if (error) {
            console.error("Error adding comment:", error);
            res.status(500).send('Error adding comment');
        } else {
            res.send('Comment added successfully');
        }
    });
});

app.post('/recipe/:id/like', requireAuth, (req, res) => {
    const { id } = req.params;
    const userId = req.session.userId;

    if (!userId) {
        res.status(400).send("Invalid request");
        return;
    }

    const sql = 'INSERT INTO likes (recipe_id, user_id) VALUES (?, ?)';
    connection.query(sql, [id, userId], (error, results) => {
        if (error) {
            console.error("Error liking recipe:", error);
            res.status(500).send('Error liking recipe');
        } else {
            res.send('Recipe liked successfully');
        }
    });
});


/* app.get ('/', (req,res)=>{
    const sql = 'SELECT * FROM products';
    connection.query (sql, (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status (500).send('Error Retrieving products');
        }
            res.render('index', {products :results});
    });
});
app.get ('/product/:id', (req,res)=>{
    const productId = req.params.id;
    const sql = 'SELECT * FROM products WHERE productId = ?';
    connection.query (sql, [productId], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error Retrieving products by ID');
        }
        if (results.length >0) {
            res.render('product', {product :results[0] });
        } else {
            res.status(404).send('Product not found');
        }
    });
});
app.get ('/addProduct', (req,res) =>{
    res.render ('addProduct');
});

app.post('/addProduct', upload.single('image'), (req,res)=>{
    const { name, quantity, price }= req.body;
    let image;
    if(req.file) {
        image = req.file.filename;
    } else {
        image =null;
    }
    const sql = 'INSERT INTO products (productName, quantity, price, image) VALUES (?,?,?,?)';
    connection.query (sql, [name, quantity, price, image], (error,results) =>{
        if (error){
            console.error("Error adding product:", error);
            res.status(500).send ('Error adding product');
        } else {
            res.redirect('/');
        }
    });
});

app.get ('/editProduct/:id', (req,res)=>{
    const productId = req.params.id;
    const sql = 'SELECT * FROM products WHERE productId = ?';
    connection.query(sql, [productId], (error,results)=> {
        if (error){
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retriving product by ID');
        }
        if (results.length >0 ){
            res.render ('editProduct', {product:results [0] });
        } else {
            res.status(404).send ('Product not found');
        }
    });
});

app.post ('/editProduct/:id', upload.single('image'), (req,res)=>{
    const productId = req.params.id;
    const {name, quantity, price} = req.body;
    let image = req.body.currentImage;
    if (req.file){
        image = req.file.filename;
    }
    const sql = 'UPDATE products SET productName = ?, quantity = ?, price = ? WHERE productId = ?';
    connection.query (sql , [name, quantity, price, image, productId], (error, results)=>{
        if (error){
            console.error("Error updating product:", error);
            res.status (500).send('Error updating product');
        } else {
            res.redirect('/');
        }
    });
});

app.get('/deleteProduct/:id', (req,res)=>{
    const productId = req.params.id;
    const sql = 'DELETE FROM products WHERE productId = ?';
    connection.query (sql , [productId], (error,results) =>{
        if (error){
            console.error("Error deleting product:", error);
            res.status(500).send('Error deleting product');
       } else {
        res.redirect('/');
       }
    });
}); */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));