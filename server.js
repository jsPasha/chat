let usersOnline = Object.create(null);

Array.prototype.remove = function() {
  var what,
    a = arguments,
    L = a.length,
    ax;
  while (L && this.length) {
    what = a[--L];
    while ((ax = this.indexOf(what)) !== -1) {
      this.splice(ax, 1);
    }
  }
  return this;
};

const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const io = require("socket.io")(server);

const cors = require("cors");

const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;

const mongoose = require("mongoose");

const morgan = require("morgan");
const bodyParser = require("body-parser");
const session = require("express-session");
const MongoStore = require("connect-mongo")(session);

const path = require("path");
app.use(express.static(path.join(__dirname, "build")));

// const User = require("./models/user");
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

// const Room = require("./models/room");
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

// const Message = require("./models/message");
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

// const { setMessageOwner } = require("./utilities/messages");
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

// require("./utilities/extensions");

mongoose.connect(
  // "mongodb://localhost/chat",
  "mongodb://pavlo:p244w0rd@ds157503.mlab.com:57503/sociable",
  { useNewUrlParser: true }
);

app.use(morgan("tiny"));

app.use(express.static("public"));

const sessionMiddleware = session({
  store: new MongoStore({ mongooseConnection: mongoose.connection }),
  secret:
    "kldghjnfkljhnklnladghkdfngnpzkjfgnlfnsajklgbskfgbljhsbzfglifgbizdugb;andfgklzlfgjoijfojhisdgujdr",
  saveUninitialized: false,
  resave: true,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
});

app.use(sessionMiddleware);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(passport.initialize());
app.use(passport.session());

var allowCrossDomain = function(req, res, next) {
  // res.header(
  //   "Access-Control-Allow-Origin",
  //   "https://sociable-chat.firebaseapp.com"
  // );
  // res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");
  // res.header("Access-Control-Allow-Headers", "Content-Type");

  next();
};

app.use(allowCrossDomain);

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://sociable-chat.firebaseapp.com",
      "http://localhost:5000",
      "https://jspasha.github.io",
      "http://127.0.0.1:3000"
    ],
    methods: ["GET", "POST"],
    credentials: true // enable set cookie
  })
);

io.use(function(socket, next) {
  sessionMiddleware(socket.request, {}, next);
});

const pushMessagesToOnline = ({
  usersOnline,
  userId,
  socketId,
  savedMessage
}) => {
  usersOnline[userId] &&
    usersOnline[userId].map(el => {
      if (el != socketId) {
        savedMessage = setMessageOwner(savedMessage, userId);
        io.to(el).emit("message", savedMessage);
      }
    });
};

io.on("connection", function(socket) {
  // console.log(socket.request.session);

  if (!socket.request.session.passport) return;

  const passportUser = socket.request.session.passport.user;
  const socketId = socket.id;

  usersOnline[passportUser]
    ? usersOnline[passportUser].push(socketId)
    : (usersOnline[passportUser] = [socketId]);

  socket.on("message", async ({ uniqId, message }) => {
    let savedMessage = new Message({
      ...message,
      owner: passportUser,
      createdAt: new Date(),
      status: "not-read"
    });

    savedMessage = await savedMessage.save();

    savedMessage = await Message.populate(savedMessage, {
      path: "owner",
      select: "email avatar"
    });

    socket.emit("message saved", { uniqId, message: savedMessage });

    let room = await Room.findOne({ _id: savedMessage.room })
      .populate({
        path: "users",
        select: "email avatar"
      })
      .lean();

    room.users = room.users.map(el => {
      el.owner = !el._id.equals(passportUser);
      return el;
    });

    const { users } = room;

    savedMessage = savedMessage.toJSON();

    savedMessage.room = room;

    for (let i = 0; i < users.length; i++) {
      const userId = users[i]._id;

      if (!userId.equals(passportUser)) {
        await User.updateOne(
          { _id: userId },
          {
            $push: {
              notReadMessages: {
                messageId: savedMessage._id,
                roomId: savedMessage.room._id
              }
            }
          }
        );
      }

      pushMessagesToOnline({ usersOnline, userId, socketId, savedMessage });
    }
  });

  socket.on("read messages", async ({ roomId, notRead }) => {
    await User.updateOne(
      { _id: passportUser },
      { $pull: { notReadMessages: { roomId } } },
      () => null
    );

    await Message.updateMany(
      { room: roomId, owner: { $ne: passportUser } },
      { $set: { status: "read" } },
      () => null
    );

    let owners = {};

    let messages = await Message.find({ _id: { $in: notRead } });

    messages.forEach(el => {
      if (el.owner in owners) owners[el.owner].push(el._id);
      else owners[el.owner] = [el._id];
    });

    for (let key in owners) {
      if (key in usersOnline) {
        usersOnline[key].forEach(el => {
          io.to(el).emit("message was read", { messages: owners[key] });
        });
      }
    }
  });

  socket.on("disconnect", () => {
    usersOnline[passportUser].length > 1
      ? usersOnline[passportUser].remove(socketId)
      : delete usersOnline[passportUser];
  });
});

const isLoggedin = (req, res, next) => {
  if (!req.user)
    return res.send({
      status: "ERROR",
      message: "You are not authorized!"
    });
  next();
};

passport.use(
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password"
    },
    async function(email, password, done) {
      let user = await User.findOne({ email });

      if (!user)
        return done({
          status: "ERROR",
          errors: [
            {
              email: "No user by this credentials",
              _error: "Login failed!"
            }
          ]
        });

      if (user.password !== password)
        return done({
          status: "ERROR",
          errors: [
            {
              password: "Wrong password",
              _error: "Login failed!"
            }
          ]
        });

      return done(null, user);
    }
  )
);

passport.use(
  "local-signup",
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password"
    },
    async function(email, password, done) {
      let user = await User.findOne({ email });

      if (user)
        return done({
          status: "ERROR",
          errors: [
            {
              email: "User already exist!",
              _error: "Signup failed!"
            }
          ]
        });

      user = new User({ email, password });

      user = await user.save();

      done(null, user);
    }
  )
);

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

app.post("/api/login", (req, res, next) => {
  passport.authenticate("local", function(err, account) {
    // console.log(account)
    req.logIn(account, function(err) {
      req.session.save(function() {
        res.status(200).send(
          err
            ? err
            : {
                payload: { email: account.email, avatar: account.avatar }
              }
        );
      });
    });
  })(req, res, next);
});

app.post("/api/initialize", async (req, res) => {
  let { user } = req;
  // console.log("user");
  // console.log(user);
  if (user) {
    let { email, avatar, notReadMessages } = user;

    res.send({
      status: "OK",
      payload: { email, avatar, notReadMessages }
    });
  } else {
    res.send({
      status: "ERROR"
    });
  }
});

app.post("/api/signin", (req, res, next) => {
  passport.authenticate("local-signup", function(err, account) {
    req.logIn(account, function() {
      res.status(200).send(
        err
          ? err
          : {
              payload: { email: account.email, avatar: account.avatar }
            }
      );
    });
  })(req, res, next);
});

app.get("/api/logout", (req, res, next) => {
  req.logout();
  res.status(200).send({ status: "OK" });
});

app.get("/api/users", isLoggedin, async (req, res) => {
  let { q } = req.query;
  q = q.trim().toLowerCase();
  let users = await User.find({
    email: { $regex: new RegExp(q) },
    _id: { $ne: req.user.id }
  });
  let suggestions = users.map(el => {
    return {
      label: el.email,
      id: el.id
    };
  });
  res.send({ status: "OK", suggestions });
});

app.get("/api/user", isLoggedin, async (req, res) => {
  let userId = req.query.id;

  const user = await User.findById(userId);
  const { email, avatar, id } = user;

  res.send({
    status: "OK",
    info: {
      email,
      avatar,
      id
    }
  });
});

app.get("/api/room", isLoggedin, async (req, res) => {
  const userId = mongoose.Types.ObjectId(req.query.user);
  const reqUserId = mongoose.Types.ObjectId(req.user.id);
  const users = [
    { users: [userId, reqUserId] },
    { users: [reqUserId, userId] }
  ];

  const roomType = "dialog";

  const params = { roomType, users: users[0].users };

  let room = await Room.findOne({ roomType, $or: users });

  if (!room) {
    room = new Room(params);
    room = await room.save();
  }

  room = await Room.populate(room, {
    path: "users",
    select: "email avatar"
  });

  let roomInfo = room.toJSON();

  roomInfo.users = roomInfo.users.map(el => {
    el.owner = el._id.equals(req.user._id);
    delete el._id;
    return el;
  });

  res.send({ status: "OK", room: roomInfo });
});

app.get("/api/rooms", isLoggedin, async (req, res) => {
  const { _id } = req.user;

  let rooms = await Room.find({ users: _id }).populate({
    path: "users",
    select: "email avatar"
  });

  let roomsInfo = rooms.map(elem => {
    elem = elem.toJSON();

    elem.users = elem.users.map(el => {
      el.owner = el._id.equals(req.user._id);
      return el;
    });

    return elem;
  });

  res.send({ status: "OK", rooms: roomsInfo });
});

app.get("/api/messages", isLoggedin, async (req, res) => {
  const { id } = req.query;

  let messages = await Message.find({ room: id }).populate({
    path: "owner",
    select: "email avatar"
  });

  messages = messages.map(el => {
    return setMessageOwner(el.toJSON(), req.user._id);
  });

  res.send({ status: "OK", messages });
});

app.use((req, res, next) => {
  res.redirect("/");
});

server.listen(5000, () => console.log("Server: http://localhost:5000"));
