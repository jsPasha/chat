const mongoose = require("mongoose");

// define the schema for our user model
const Room = mongoose.model("Room", {
  roomType: {
    type: String,
    enum: ["dialog", "conversation"]
  },
  users: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  ]
});

module.exports = Room;
