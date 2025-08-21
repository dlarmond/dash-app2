require('dotenv').config();
const express = require('express');
const http = require('http' );
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Certifique-se de que este arquivo existe e exporta a função query
// Exemplo: const { Pool } = require('pg'); const pool = new Pool(...); module.exports = { query: (text, params) => pool.query(text, params) };
const db = require('./database.js');

// ------------------------------ Config ------------------------------
const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key'; // Use uma chave segura em produção
const CORS_ORIGIN = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : '*';

if (JWT_SECRET === 'dev-secret-key') {
  console.warn('[WARN] JWT_SECRET não definido no .env. Usando valor padrão (inseguro para produção).');
}

// AWS S3 (opcional, mantenha se usar)
const s3Client = new S3Client({
  region: process.env.AWS_BUCKET_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function generateUploadURL(fileType = 'image/jpeg') {
  const objectKey = crypto.randomBytes(16).toString('hex');
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: objectKey,
    ContentType: fileType,
  });
  return await getSignedUrl(s3Client, command, { expiresIn: 60 });
}

// ------------------------------ App/Server ------------------------------
const app = express();
const server = http.createServer(app );

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ------------------------------ Auth helpers ------------------------------
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Token de autenticação ausente.' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token inválido ou expirado.' });
    req.user = user; // { id, username }
    next();
  });
}

// ------------------------------ Rotas REST ------------------------------
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ message: 'Usuário e senha são obrigatórios.' });

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    await db.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [username, password_hash]);

    return res.status(201).json({ message: 'Usuário registrado com sucesso!' });
  } catch (error) {
    if (error && error.code === '23505') { // Código de violação de unicidade do PostgreSQL
      return res.status(409).json({ message: 'Este nome de usuário já está em uso.' });
    }
    console.error('[ERRO] /api/register:', error);
    return res.status(500).json({ message: 'Erro interno no servidor ao registrar.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ message: 'Usuário e senha são obrigatórios.' });

    const result = await db.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ message: 'Usuário ou senha inválidos.' });

    const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordCorrect) return res.status(401).json({ message: 'Usuário ou senha inválidos.' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ message: 'Login bem-sucedido!', token, username: user.username });
  } catch (error) {
    console.error('[ERRO] /api/login:', error);
    return res.status(500).json({ message: 'Erro interno no servidor ao fazer login.' });
  }
});

app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const result = await db.query('SELECT username, avatar_url FROM users ORDER BY username ASC');
    return res.json(result.rows);
  } catch (error) {
    console.error('[ERRO] /api/users:', error);
    return res.status(500).json({ message: 'Erro ao buscar usuários.' });
  }
});

// ------------------------------ Socket.IO ------------------------------
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN },
});

const socketsToUsers = {}; // socket.id -> username
const usersToSockets = {}; // username -> socket.id

function emitOnlineUsers() {
  const onlineUsers = Object.values(socketsToUsers).filter(Boolean).sort();
  io.emit('update user list', onlineUsers);
}

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Autenticação falhou: token ausente.'));
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error('Token inválido.'));
      socket.username = decoded.username;
      next();
    });
  } catch (err) {
    next(new Error('Falha geral de autenticação.'));
  }
});

io.on('connection', (socket) => {
  const username = socket.username;
  console.log(`[SOCKET] Conectado: ${username} (${socket.id})`);

  socketsToUsers[socket.id] = username;
  usersToSockets[username] = socket.id;
  emitOnlineUsers();

  socket.on('disconnect', () => {
    const disconnectedUser = socketsToUsers[socket.id];
    if (disconnectedUser) {
      delete socketsToUsers[socket.id];
      if (usersToSockets[disconnectedUser] === socket.id) {
        delete usersToSockets[disconnectedUser];
      }
    }
    emitOnlineUsers();
    console.log(`[SOCKET] Desconectado: ${username} (${socket.id})`);
  });

  socket.on('join room', async (room) => {
    try {
      if (!room || typeof room !== 'string') return;
      socket.join(room);
      const result = await db.query(
        'SELECT id, room, author, message, type, timestamp FROM messages WHERE room = $1 ORDER BY timestamp ASC',
        [room]
      );
      socket.emit('chat history', result.rows);
    } catch (e) {
      console.error(`[ERRO] join room (${room}):`, e);
    }
  });

  socket.on('chat message', async (data) => {
    try {
      if (!data || typeof data !== 'object') return;
      const { room, message, type = 'text' } = data;

      if (!socket.username || !room || !message) {
        return;
      }

      const insertResult = await db.query(
        'INSERT INTO messages (room, author, message, type) VALUES ($1, $2, $3, $4) RETURNING id, timestamp',
        [room, socket.username, message, type]
      );

      const new_message = {
        id: insertResult.rows[0].id,
        author: socket.username,
        message,
        timestamp: insertResult.rows[0].timestamp,
        room,
        type,
      };

      io.to(room).emit('chat message', new_message);
    } catch (e) {
      console.error(`[ERRO] chat message (${data.room}):`, e);
    }
  });

  socket.on('user typing start', (data) => {
    if (data && data.room) {
      socket.to(data.room).emit('user typing start', { username: socket.username });
    }
  });

  socket.on('user typing stop', (data) => {
    if (data && data.room) {
      socket.to(data.room).emit('user typing stop', { username: socket.username });
    }
  });
});

// ------------------------------ Start ------------------------------
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}` );
});
