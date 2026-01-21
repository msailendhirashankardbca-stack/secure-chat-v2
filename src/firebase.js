import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDaWAiAaOjRsyt2XtQKThsDx2X2yT7pac0",
  authDomain: "chatapp-624dd.firebaseapp.com",
  databaseURL: "https://chatapp-624dd-default-rtdb.firebaseio.com/",
  projectId: "chatapp-624dd",
  storageBucket: "chatapp-624dd.firebasestorage.app",
  messagingSenderId: "170246375686",
  appId: "1:170246375686:web:e477b25cf3c84323ffb687"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { database };
