// database.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => {
  console.log('Conectado ao banco de dados PostgreSQL com sucesso.');
});

pool.on('error', (err) => {
  console.error('Erro inesperado no cliente do banco de dados', err);
  process.exit(-1);
});

const createTables = async () => {
  const usersTable = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(255) DEFAULT '/default-avatar.png'
  )`;

  const messagesTable = `
  CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    room VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'text',
    status VARCHAR(50) NOT NULL DEFAULT 'sent',
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`;

  try {
    await pool.query(usersTable);
    console.log('Tabela "users" pronta.');
    await pool.query(messagesTable);
    console.log('Tabela "messages" pronta.');
  } catch (err) {
    console.error('Erro ao criar tabelas:', err.stack);
  }
};

createTables();

module.exports = {
  query: (text, params) => pool.query(text, params),
};