const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: {type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  likes: { type: Number, default: 0 },
  imageUrl: { type: String },
  imageDesc: { type: String }
});

const Post = mongoose.model('Post', postSchema);
module.exports = Post;