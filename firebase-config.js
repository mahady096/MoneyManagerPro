const firebaseConfig = {
  apiKey: "AIzaSyD270ztR27nGQphS4__1RY9DRw6auYXpv0",
  authDomain: "pro-wallet-7b19a.firebaseapp.com",
  projectId: "pro-wallet-7b19a",
  storageBucket: "pro-wallet-7b19a.firebasestorage.app",
  messagingSenderId: "674235026651",
  appId: "1:674235026651:web:2393c7a8ce943c43c990fe",
  measurementId: "G-RN3T34K22L"

};

// ফায়ারবেস ইনিশিয়ালাইজ করা (এটি না থাকলে এরর আসবে)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();