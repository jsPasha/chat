const mongoose = require("mongoose");

// define the schema for our user model
const User = mongoose.model("User", {
  email: String,
  password: String,
  notReadMessages: [
    {
      messageId: mongoose.Schema.Types.ObjectId,
      roomId: mongoose.Schema.Types.ObjectId
    }
  ]
});

module.exports = User;
