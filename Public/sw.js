self.addEventListener('push', event => {
    const data = event.data.json();
    console.log('Push recebido:', data);

    const options = {
        body: data.body,
        icon: '/icon.png', // opcional
        badge: '/badge.png' // opcional
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/') // abre a página principal ao clicar
    );
});
