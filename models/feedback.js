const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  email: { type: String, required: true },
  subject: {type: String, required: true },
  content: {type: String, required: true },
  createdAt: { type: Date, required: true, default: Date.now },
  status: { type: String, required: true, default: "New" },
  published: {type: Boolean, required: true, default: "false" },
  likes: { type: Number, required: true, default: 0 }
});

const Feedback = mongoose.model('Feedback', feedbackSchema);
module.exports = Feedback;