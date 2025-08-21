// controllers/usersController.js
const usersModel = require("../models/usersModel");

exports.createUser = async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: "Nome e telefone são obrigatórios" });
    }
    const newUser = await usersModel.createUser(name, phone);
    res.status(201).json(newUser);
  } catch (err) {
    console.error("Erro ao criar usuário:", err);
    res.status(500).json({ error: "Erro interno" });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await usersModel.getAllUsers();
    res.json(users);
  } catch (err) {
    console.error("Erro ao buscar usuários:", err);
    res.status(500).json({ error: "Erro interno" });
  }
};
