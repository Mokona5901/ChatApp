require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const MongoStore = require('connect-mongo');
const imgbbUploader = require('imgbb-uploader');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use((req, res, next) => {
  next();
});

app.use(cors());

const client = new MongoClient(process.env.URI);
let usersCollection, messagesCollection;

async function connectMongo() {
  await client.connect();
  const db = client.db('chatapp');
  usersCollection = db.collection('users');
  messagesCollection = db.collection('messages');
}
connectMongo().catch(console.error);

passport.use(new LocalStrategy(async (username, password, done) => {
  try {
    const user = await usersCollection.findOne({ username });
    if (!user) return done(null, false);
    const match = await bcrypt.compare(password, user.hash);
    return match ? done(null, user) : done(null, false);
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

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '50mb' }));

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.URI }),
});
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

app.post('/api/upload-image', async (req, res) => {
  try {
    console.log('Upload route hit');
    const { image } = req.body;
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ success: false, message: 'Image data missing or invalid.' });
    }

    const matches = image.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ success: false, message: 'Invalid image format.' });
    }

    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > 32 * 1024 * 1024) {
      return res.status(413).json({ success: false, message: 'Image too large.' });
    }

    if (!process.env.IMG_API) {
      console.error('Missing IMG_API key');
      return res.status(500).json({ success: false, message: 'Server misconfigured: missing API key.' });
    }

    const response = await imgbbUploader({
      apiKey: process.env.IMG_API,
      base64string: base64Data,
    });
    console.log('ImgBB response:', response);
    if (response?.url) {
      res.json({ success: true, url: response.url });
    } else {
      console.error('Unexpected ImgBB response:', response);
      res.status(502).json({ success: false, message: 'Unexpected response from ImgBB.' });
    }
  } catch (error) {
    console.error('Upload error:', error);
    const msg = error?.response?.data?.error?.message || error.message || 'Unknown error';
    res.status(500).json({ success: false, message: `Upload failed: ${msg}` });
  }
});

app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public/register.html')));
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const existing = await usersCollection.findOne({ username });
    if (existing) return res.send('Username already exists.');
    const hash = await bcrypt.hash(password, 10);
    await usersCollection.insertOne({ username, hash });
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.status(500).send('Registration error');
  }
});

app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user) => {
    if (err || !user) return res.status(401).send('Login failed');
    req.logIn(user, (err) => {
      if (err) return res.status(500).send('Login error');
      res.json({ success: true, username: user.username });
    });
  })(req, res, next);
});

app.get('/messages', async (req, res) => {
  const skip = parseInt(req.query.skip) || 0;
  const channel = req.query.channel || 'general';
  try {
    const msgs = await messagesCollection.find({ channel }).sort({ timestamp: -1 }).skip(skip).limit(50).toArray();
    res.json(msgs.reverse());
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load messages');
  }
});

app.put('/messages/:id', async (req, res) => {
  const { id } = req.params;
  const { username, newMessage } = req.body;
  try {
    const msg = await messagesCollection.findOne({ _id: new ObjectId(id) });
    if (!msg) return res.status(404).send('Message not found');
    if (msg.username !== username) return res.status(403).send('Forbidden');
    await messagesCollection.updateOne({ _id: new ObjectId(id) }, { $set: { message: newMessage } });
    const updated = { ...msg, message: newMessage };
    io.emit('message edited', updated);
    res.send(updated);
  } catch (err) {
    console.error(err);
    res.status(500).send('Edit error');
  }
});

app.delete('/messages/:id', async (req, res) => {
  const { id } = req.params;
  const { username } = req.body;
  try {
    const msg = await messagesCollection.findOne({ _id: new ObjectId(id) });
    if (!msg) return res.status(404).send('Message not found');
    if (msg.username !== username) return res.status(403).send('Forbidden');
    await messagesCollection.deleteOne({ _id: new ObjectId(id) });
    io.emit('message deleted', id);
    res.send({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send('Delete error');
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/home.html')));
app.get('/app', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public/app.html'));
});

const onlineUsers = new Set();

const wrap = (mw) => (socket, next) => mw(socket.request, {}, next);
io.use(wrap(sessionMiddleware));
io.use(wrap(passport.initialize()));
io.use(wrap(passport.session()));
io.use((socket, next) => socket.request.user ? next() : next(new Error('unauthorized')));

io.on('connection', async (socket) => {
  const username = socket.request.user?.username;
  if (!username) return;

  socket.channel = 'general';
  socket.join('general');

  onlineUsers.add(username);
  io.emit('online users', Array.from(onlineUsers));

  const history = await messagesCollection.find({ channel: 'general' }).sort({ timestamp: -1 }).limit(50).toArray();
  socket.emit('chat history', history.reverse());

  socket.on('join channel', (channel) => {
    socket.leave(socket.channel);
    socket.join(channel);
    socket.channel = channel;
    messagesCollection.find({ channel }).sort({ timestamp: -1 }).limit(50).toArray().then(history => {
      socket.emit('chat history', history.reverse());
    });
  });

  socket.on('chat message', async (data) => {
    const msg = {
      username,
      message: data.message,
      imageUrl: data.imageUrl,
      type: data.type || 'chat',
      timestamp: new Date(),
      replyTo: data.replyTo,
      channel: socket.channel
    };
    await messagesCollection.insertOne(msg);
    io.to(socket.channel).emit('chat message', msg);
  });

  socket.on('disconnect', () => {
    setTimeout(() => {
      onlineUsers.delete(username);
      io.emit('online users', Array.from(onlineUsers));
    }, 10000);
  });
});

process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', (reason, promise) => console.error('Unhandled Rejection at:', promise, 'reason:', reason));

server.listen(3000, () => console.log('Server running on http://localhost:3000'));
