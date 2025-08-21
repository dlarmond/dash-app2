// routes/users.js
const express = require("express");
const router = express.Router();
const usersController = require("../controllers/usersController");

// Criar usuário
router.post("/", usersController.createUser);

// Listar todos usuários
router.get("/", usersController.getAllUsers);

module.exports = router;
