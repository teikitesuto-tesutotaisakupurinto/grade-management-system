
const firebaseConfig = {
  apiKey: "AIzaSyByt8kGALyS8AU8SRP6zWFEPXfgHY5iynk",
  authDomain: "studychat-1b39d.firebaseapp.com",
  projectId: "studychat-1b39d",
  storageBucket: "studychat-1b39d.firebasestorage.app",
  messagingSenderId: "982302014286",
  appId: "1:982302014286:web:abf319aadb1ed919727c1f"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const gradeAuth = firebase.auth();
