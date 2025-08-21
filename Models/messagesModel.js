// models/messagesModel.js
const pool = require("../database");

exports.sendMessage = async (senderId, receiverId, content) => {
  const result = await pool.query(
    "INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING *",
    [senderId, receiverId, content]
  );
  return result.rows[0];
};

exports.getMessagesByUser = async (userId) => {
  const result = await pool.query(
    "SELECT * FROM messages WHERE sender_id = $1 OR receiver_id = $1 ORDER BY created_at ASC",
    [userId]
  );
  return result.rows;
};
