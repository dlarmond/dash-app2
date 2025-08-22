// ==========================
// 1. IMPORTAÇÕES
// ==========================
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const db = require('./database.js');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const crypto = require('crypto');

// ==========================
// 2. CONFIGURAÇÃO INICIAL
// ==========================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Permite conexões de qualquer origem.
    }
});

const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET;

// ==========================
// 3. MIDDLEWARES DO EXPRESS
// ==========================
// Serve os arquivos estáticos (index.html, css, etc.) da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));
// Permite que o servidor entenda JSON no corpo das requisições
app.use(express.json());

// ==========================
// 4. CONFIGURAÇÃO AWS S3
// ==========================
const s3Client = new S3Client({
    region: process.env.AWS_BUCKET_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

async function generateUploadURL(fileType = 'image/jpeg') {
    const rawBytes = await crypto.randomBytes(16);
    const objectKey = rawBytes.toString('hex');
    const command = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: objectKey,
        ContentType: fileType
    });
    return await getSignedUrl(s3Client, command, { expiresIn: 60 });
}

// ==========================
// 5. MIDDLEWARE DE AUTENTICAÇÃO
// ==========================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token de autenticação ausente.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Token inválido ou expirado.' });
        req.user = user;
        next();
    });
}

// ==========================
// 6. ROTAS DA API
// ==========================
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ message: 'Usuário e senha são obrigatórios.' });
        const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
        await db.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [username, password_hash]);
        res.status(201).json({ message: 'Usuário registrado com sucesso!' });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ message: 'Nome de usuário já existe.' });
        console.error("Erro no Registro:", error);
        res.status(500).json({ message: 'Erro interno no servidor ao registrar.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ message: 'Usuário e senha são obrigatórios.' });
        const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];
        const passwordMatch = user ? await bcrypt.compare(password, user.password_hash) : false;
        if (!user || !passwordMatch) {
            return res.status(401).json({ message: 'Usuário ou senha inválidos.' });
        }
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ message: 'Login bem-sucedido!', token, username: user.username });
    } catch (error) {
        console.error("Erro no Login:", error);
        res.status(500).json({ message: 'Erro interno no servidor ao fazer login.' });
    }
});

app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const result = await db.query('SELECT username, avatar_url FROM users');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Erro ao buscar usuários."});
    }
});

app.post('/api/profile/avatar', authenticateToken, async (req, res) => {
    try {
        const { fileType } = req.body;
        const presignedUrl = await generateUploadURL(fileType);
        const avatar_url = presignedUrl.split('?')[0];
        await db.query('UPDATE users SET avatar_url = $1 WHERE username = $2', [avatar_url, req.user.username]);
        res.json({ message: 'URL de upload pronta!', presignedUrl, avatar_url });
    } catch (error) {
        res.status(500).json({ message: "Erro ao preparar upload." });
    }
});

app.post('/api/upload', authenticateToken, async (req, res) => {
    try {
        const { fileType } = req.body;
        const presignedUrl = await generateUploadURL(fileType);
        const fileUrl = presignedUrl.split('?')[0];
        res.json({ presignedUrl, fileUrl });
    } catch (error) {
        console.error("Erro ao gerar URL de upload:", error);
        res.status(500).json({ message: "Erro ao preparar upload." });
    }
});

// ==========================
// 7. LÓGICA DO SOCKET.IO
// ==========================
let onlineUsers = {}; // Mapa de socket.id -> username
let userSockets = {}; // Mapa de username -> socket.id

function updateUsers() {
    const users = Object.values(onlineUsers);
    io.emit('update user list', users);
}

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Autenticação falhou.'));
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error('Token inválido.'));
        socket.username = decoded.username;
        next();
    });
});

io.on('connection', (socket) => {
    onlineUsers[socket.id] = socket.username;
    userSockets[socket.username] = socket.id;
    updateUsers();

    socket.emit('connection success', { username: socket.username });

    socket.on('disconnect', () => {
        const username = onlineUsers[socket.id];
        if (username) {
            delete onlineUsers[socket.id];
            delete userSockets[username];
            updateUsers();
        }
    });

    socket.on('join room', async (room) => {
        socket.join(room);
        try {
            const result = await db.query(`SELECT * FROM messages WHERE room = $1 ORDER BY timestamp ASC`, [room]);
            socket.emit('chat history', result.rows);
        } catch (e) {
            console.error(e);
        }
    });

    socket.on('chat message', async (data) => {
        if (!socket.username || !data.room) return;
        const messageType = data.type || 'text';
        try {
            const result = await db.query(`INSERT INTO messages (room, author, message, type) VALUES ($1, $2, $3, $4) RETURNING id, timestamp`, [data.room, socket.username, data.message, messageType]);
            const finalMessageData = {
                id: result.rows[0].id,
                author: socket.username,
                message: data.message,
                timestamp: result.rows[0].timestamp,
                room: data.room,
                type: messageType
            };
            io.to(data.room).emit('chat message', finalMessageData);
        } catch(e) {
            console.error(e);
        }
    });
});

// ==========================
// 8. INICIALIZAÇÃO DO SERVIDOR
// ==========================
async function startServer() {
    // Primeiro, garante que o banco de dados está pronto
    await db.initializeDatabase();

    // Só então, o servidor começa a ouvir por conexões
    server.listen(PORT, () => {
        console.log(`Servidor rodando na porta ${PORT}`);
    });
}

startServer();