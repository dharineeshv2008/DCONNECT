// Firebase Cloud Messaging Service Worker for D-Connect
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCCYfw_0JfzFKdRWkstVhHpFoBf7omeViU",
  authDomain: "disasterconnect-b1861.firebaseapp.com",
  projectId: "disasterconnect-b1861",
  storageBucket: "disasterconnect-b1861.firebasestorage.app",
  messagingSenderId: "454830688911",
  appId: "1:454830688911:web:7f61c3a1059f81d6862708"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);
  
  const title = payload.notification?.title || payload.data?.title || '🚨 D-Connect Emergency Alert';
  const options = {
    body: payload.notification?.body || payload.data?.body || 'Emergency notification received.',
    icon: '/assets/icon-192.png',
    badge: '/assets/icon-192.png',
    vibrate: [200, 100, 200],
    data: payload.data || {}
  };

  self.registration.showNotification(title, options);
});
