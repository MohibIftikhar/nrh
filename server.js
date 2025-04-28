const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const User = require('./models/User');
const Recipe = require('./models/Recipe');

dotenv.config();

const app = express();

// Validate environment variables
const requiredEnv = ['MONGO_URI', 'JWT_SECRET', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
for (const env of requiredEnv) {
  if (!process.env[env]) {
    console.error(`Error: Missing required environment variable: ${env}`);
    process.exit(1);
  }
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Middleware
app.use(cors({
  origin: ['https://recipehubfe.onrender.com', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json());

// Multer setup with Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'recipehub',
    allowed_formats: ['jpg', 'png'],
    public_id: (req, file) => `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(file.originalname.toLowerCase().split('.').pop());
    if (extname) {
      return cb(null, true);
    }
    cb(new Error('Only .jpg and .png files are allowed'));
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Verify JWT
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(403).json({ message: 'Access denied. No token provided.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ message: 'Invalid token' });
  }
};

// Routes
app.get('/', (req, res) => {
  res.send('Welcome to RecipeHub!');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Register
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: 'Username already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ message: 'Login successful', token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Get all recipes
app.get('/recipes', verifyToken, async (req, res) => {
  try {
    const recipes = await Recipe.find();
    res.json(recipes);
  } catch (err) {
    console.error('Error getting recipes:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a recipe by ID
app.get('/recipes/:id', verifyToken, async (req, res) => {
  console.log(`Fetching recipe with ID: ${req.params.id}`);
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      console.log(`Recipe not found: ${req.params.id}`);
      return res.status(404).json({ message: 'Recipe not found' });
    }
    res.json(recipe);
  } catch (err) {
    console.error('Error getting recipe:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new recipe
app.post('/recipes', verifyToken, upload.single('image'), async (req, res) => {
  const { name, cuisine, cookingTime, ingredients, nutritionalInfo, methodSteps, youtubeLink } = req.body;
  try {
    if (!name || !cuisine || !cookingTime || !ingredients) {
      return res.status(400).json({ message: 'Name, cuisine, cooking time, and ingredients are required' });
    }
    let parsedIngredients = JSON.parse(ingredients);
    if (!Array.isArray(parsedIngredients)) {
      return res.status(400).json({ message: 'Ingredients must be an array' });
    }

    const newRecipe = new Recipe({
      name,
      cuisine,
      cookingTime: parseInt(cookingTime),
      ingredients: parsedIngredients,
      nutritionalInfo: nutritionalInfo || '',
      methodSteps: typeof methodSteps === 'string' ? methodSteps.split(',').map(item => item.trim()) : methodSteps,
      youtubeLink: youtubeLink || '',
      imageUrl: req.file ? req.file.path : '',
      comments: [],
      rating: 0,
    });

    await newRecipe.save();
    res.status(201).json(newRecipe);
  } catch (err) {
    console.error('Error creating recipe:', err);
    res.status(500).json({ message: 'Server error during recipe creation' });
  }
});

// Update a recipe
app.put('/recipes/:id', verifyToken, upload.single('image'), async (req, res) => {
  const { name, cuisine, cookingTime, ingredients, nutritionalInfo, methodSteps, youtubeLink } = req.body;
  try {
    const updateData = {};
    if (name) updateData.name = name;
    if (cuisine) updateData.cuisine = cuisine;
    if (cookingTime) updateData.cookingTime = parseInt(cookingTime);
    if (ingredients) {
      const parsedIngredients = JSON.parse(ingredients);
      if (!Array.isArray(parsedIngredients)) {
        return res.status(400).json({ message: 'Ingredients must be an array' });
      }
      updateData.ingredients = parsedIngredients;
    }
    if (nutritionalInfo) updateData.nutritionalInfo = nutritionalInfo;
    if (methodSteps) {
      updateData.methodSteps = typeof methodSteps === 'string'
        ? methodSteps.split(',').map(item => item.trim())
        : methodSteps;
    }
    if (youtubeLink) updateData.youtubeLink = youtubeLink;
    if (req.file) updateData.imageUrl = req.file.path;

    const updatedRecipe = await Recipe.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updatedRecipe) return res.status(404).json({ message: 'Recipe not found' });

    res.json(updatedRecipe);
  } catch (err) {
    console.error('Error updating recipe:', err);
    res.status(500).json({ message: 'Server error during recipe update' });
  }
});

// Delete a recipe
app.delete('/recipes/:id', verifyToken, async (req, res) => {
  try {
    const deletedRecipe = await Recipe.findByIdAndDelete(req.params.id);
    if (!deletedRecipe) return res.status(404).json({ message: 'Recipe not found' });

    // Delete image from Cloudinary
    if (deletedRecipe.imageUrl) {
      const publicId = deletedRecipe.imageUrl.split('/').slice(-2).join('/').split('.')[0]; // e.g., recipehub/1234567890
      await cloudinary.uploader.destroy(publicId);
      console.log(`Deleted image from Cloudinary: ${publicId}`);
    }

    res.json({ message: 'Recipe deleted successfully' });
  } catch (err) {
    console.error('Error deleting recipe:', err);
    res.status(500).json({ message: 'Server error during recipe deletion' });
  }
});

// Add a comment to a recipe
app.post('/recipes/:id/comment', verifyToken, async (req, res) => {
  const { comment, rating } = req.body;
  try {
    if (!comment || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Comment and rating (1-5) are required' });
    }
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ message: 'Recipe not found' });

    recipe.comments.push({ comment, rating: parseInt(rating), user: req.user.id });
    const totalRating = recipe.comments.reduce((sum, c) => sum + c.rating, 0);
    recipe.rating = (totalRating / recipe.comments.length).toFixed(1);

    await recipe.save();
    res.json({ message: 'Comment added', recipe });
  } catch (err) {
    console.error('Error adding comment:', err);
    res.status(500).json({ message: 'Server error during comment addition' });
  }
});

// Start server
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
