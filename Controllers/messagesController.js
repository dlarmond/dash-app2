// controllers/messagesController.js
const messagesModel = require("../models/messagesModel");

exports.sendMessage = async (req, res) => {
  try {
    const { senderId, receiverId, content } = req.body;
    if (!senderId || !receiverId || !content) {
      return res.status(400).json({ error: "Campos obrigatórios: senderId, receiverId, content" });
    }
    const newMessage = await messagesModel.sendMessage(senderId, receiverId, content);
    res.status(201).json(newMessage);
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err);
    res.status(500).json({ error: "Erro interno" });
  }
};

exports.getMessagesByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const messages = await messagesModel.getMessagesByUser(userId);
    res.json(messages);
  } catch (err) {
    console.error("Erro ao buscar mensagens:", err);
    res.status(500).json({ error: "Erro interno" });
  }
};
