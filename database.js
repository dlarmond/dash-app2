// database.js (VERSÃO CORRIGIDA)
const { Pool } = require('pg');

// A linha abaixo só é necessária se você não a tiver como a primeira linha do server.js
// require('dotenv').config(); 

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// A função foi renomeada de createTables para initializeDatabase
const initializeDatabase = async () => {
  try {
    const client = await pool.connect();
    console.log('Conectado ao banco de dados PostgreSQL com sucesso.');

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

    await client.query(usersTable);
    console.log('Tabela "users" pronta.');
    await client.query(messagesTable);
    console.log('Tabela "messages" pronta.');

    client.release(); // Libera o cliente de volta para o pool

  } catch (err) {
    console.error('Falha na inicialização do banco de dados:', err);
    process.exit(1);
  }
};

// A chamada direta da função foi removida daqui

module.exports = {
  query: (text, params) => pool.query(text, params),
  initializeDatabase, // A nova função agora é exportada para o server.js usar
};
