const mongoose = require('mongoose');

const ingredientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  quantity: { type: String, required: true }
});

const commentSchema = new mongoose.Schema({
  comment: { type: String, required: true },
  rating: { type: Number, required: true }
});

const recipeSchema = new mongoose.Schema({
    id: {
    type: String,  // <-- UUID string
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  cuisine: {
    type: String,
    required: true
  },
  cookingTime: {
    type: Number,
    required: true
  },
  ingredients: [ingredientSchema],
  nutritionalInfo: {
    type: String,
    default: ''
  },
  methodSteps: {
    type: [String],
    required: true
  },
  youtubeLink: {
    type: String,
    default: ''
  },
  imageUrl: {
    type: String,
    default: ''
  },
  comments: [commentSchema],
  rating: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: String,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Recipe', recipeSchema);
