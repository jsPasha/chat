const mongoose = require("mongoose");

// define the schema for our user model
const Message = mongoose.model("Message", {
  type: {
    type: String,
    enum: ["text"]
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  room: {
    type: mongoose.Schema.Types.ObjectId
  },
  status: {
    type: String,
    enum: ["read", "not-read"]
  },
  createdAt: Date,
  content: ""
});

module.exports = Message;
