const mongoose = require("mongoose");

const GoogleUserSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  name: String,
  email: { type: String, required: true, unique: true },
  picture: String,
});

module.exports = mongoose.model("GoogleUser", GoogleUserSchema);
