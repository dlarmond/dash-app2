const webpush = require('web-push');

// Gera as chaves VAPID
const vapidKeys = webpush.generateVAPIDKeys();

console.log("Chave pública VAPID:", vapidKeys.publicKey);
console.log("Chave privada VAPID:", vapidKeys.privateKey);
