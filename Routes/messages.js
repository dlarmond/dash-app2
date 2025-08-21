// routes/messages.js
const express = require("express");
const router = express.Router();
const messagesController = require("../controllers/messagesController");

// Enviar mensagem
router.post("/", messagesController.sendMessage);

// Listar mensagens de um usuário
router.get("/:userId", messagesController.getMessagesByUser);

module.exports = router;
