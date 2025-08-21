// models/usersModel.js
const pool = require("../database");

exports.createUser = async (name, phone) => {
  const result = await pool.query(
    "INSERT INTO users (name, phone) VALUES ($1, $2) RETURNING *",
    [name, phone]
  );
  return result.rows[0];
};

exports.getAllUsers = async () => {
  const result = await pool.query("SELECT * FROM users ORDER BY id ASC");
  return result.rows;
};
