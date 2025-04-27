const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  email: { type: String, required: true },
  subject: {type: String, required: true },
  content: {type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  status: {type: String, required: true, default: "New" }
});

const Feedback = mongoose.model('Feedback', feedbackSchema);
module.exports = Feedback;