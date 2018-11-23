const mongoose = require("mongoose");

const setMessageOwner = (message, userId) => {
  if (message.owner) {
    message.owner.owner = mongoose.Types.ObjectId(userId).equals(
      message.owner._id
    )
      ? true
      : false;
  } else {
    message.owner = { owner: false };
  }
  return message;
};

module.exports = {
  setMessageOwner
};
