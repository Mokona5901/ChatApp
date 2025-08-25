process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv').config();
const path = require('path');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const MongoStore = require('connect-mongo');

const client = new MongoClient(process.env.URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let usersCollection;
let messagesCollection;

async function connectMongo() {
  await client.connect();
  console.log("Connected to MongoDB!");
  const db = client.db('chatapp');
  usersCollection = db.collection('users');
  messagesCollection = db.collection('messages');
}

connectMongo().catch(console.error);

passport.use(new LocalStrategy(async (username, password, done) => {
  try {
    const user = await usersCollection.findOne({ username });
    if (!user) return done(null, false);
    const ok = await bcrypt.compare(password, user.hash);
    return ok ? done(null, user) : done(null, false);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, cb) => cb(null, user.username));

passport.deserializeUser(async (username, cb) => {
  try {
    const user = await usersCollection.findOne({ username });
    cb(null, user);
  } catch (err) {
    cb(err);
  }
});

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server);

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.URI }),
});

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

app.get('/register', (req, res) =>
  res.sendFile(path.join(__dirname, 'public/register.html'))
);

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const existingUser = await usersCollection.findOne({ username });
    if (existingUser) return res.send('Username already exists.');
    const hash = await bcrypt.hash(password, 10);
    await usersCollection.insertOne({ username, hash });
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal error');
  }
});

app.get('/login', (req, res) =>
  res.sendFile(path.join(__dirname, 'public/login.html'))
);

app.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user) => {
    if (err || !user) return res.status(401).send('Login failed');
    req.logIn(user, (err) => {
      if (err) return res.status(500).send('Login error');
      return res.json({ success: true, username: user.username });
    });
  })(req, res, next);
});

app.get('/messages', async (req, res) => {
  const skip = parseInt(req.query.skip) || 0;
  try {
    const olderMessages = await messagesCollection
      .find({})
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(50)
      .toArray();
    res.json(olderMessages.reverse());
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load messages');
  }
});

app.put('/messages/:id', async (req, res) => {
  const { id } = req.params;
  const { username, newMessage } = req.body;

  try {
    const message = await messagesCollection.findOne({ _id: new ObjectId(id) });
    if (!message) return res.status(404).send('Message not found');
    if (message.username !== username) return res.status(403).send('Forbidden: Not your message');

    await messagesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { message: newMessage } }
    );

    const updatedMessage = { ...message, message: newMessage };
    io.emit('message edited', updatedMessage);
    res.send(updatedMessage);
  } catch (err) {
    console.error('Error editing message:', err);
    res.status(500).send('Server error');
  }
});

app.delete('/messages/:id', async (req, res) => {
  const { id } = req.params;
  const { username } = req.body;

  try {
    const message = await messagesCollection.findOne({ _id: new ObjectId(id) });
    if (!message) return res.status(404).send('Message not found');
    if (message.username !== username) return res.status(403).send('Forbidden: Not your message');

    await messagesCollection.deleteOne({ _id: new ObjectId(id) });

    io.emit('message deleted', id);
    res.send({ success: true });
  } catch (err) {
    console.error('Error deleting message:', err);
    res.status(500).send('Server error');
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/home.html'));
});

app.get('/app', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public/app.html'));
})

app.use(express.static(path.join(__dirname, 'public')));

const wrap = (mw) => (socket, next) => mw(socket.request, {}, next);
io.use(wrap(sessionMiddleware));
io.use(wrap(passport.initialize()));
io.use(wrap(passport.session()));

io.use((socket, next) => {
  if (socket.request.user) next();
  else next(new Error('unauthorized'));
});

io.on('connection', async (socket) => {
  const username = socket.request.user?.username;
  if (!username) return;

  const recentMessages = await messagesCollection
    .find({})
    .sort({ timestamp: -1 })
    .limit(50)
    .toArray();

  socket.emit('chat history', recentMessages.reverse());

  const joinMsg = {
    username: null,
    message: `${username} joined the chat`,
    type: 'status',
    timestamp: new Date()
  };
  await messagesCollection.insertOne(joinMsg);

  socket.broadcast.emit('user connected', username);
  io.emit('chat message', joinMsg);

  socket.on('chat message', async (data) => {
    const messageDoc = {
      username,
      message: data.message,
      type: 'chat',
      timestamp: new Date()
    };
    await messagesCollection.insertOne(messageDoc);
    io.emit('chat message', messageDoc);
  });

  socket.on('disconnect', async () => {
    const leaveMsg = {
      username: null,
      message: `${username} left the chat`,
      type: 'status',
      timestamp: new Date()
    };
    await messagesCollection.insertOne(leaveMsg);

    socket.broadcast.emit('user disconnected', username);
    io.emit('chat message', leaveMsg);
  });
});

server.listen(3000, () =>
  console.log('Server running on http://localhost:3000')
);