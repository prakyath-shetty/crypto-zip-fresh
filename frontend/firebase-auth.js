import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  projectId: "__FIREBASE_PROJECT_ID__",
  storageBucket: "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_APP_ID__",
  measurementId: "__FIREBASE_MEASUREMENT_ID__"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

async function completeBackendGoogleLogin(apiBase, email, name) {
  const res = await fetch(`${apiBase}/auth/google-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name })
  });

  return res.json();
}

window.FirebaseGoogleAuth = {
  async signIn({ apiBase, onStart, onSuccess, onError }) {
    try {
      if (typeof onStart === "function") onStart();
      await signOut(auth).catch(() => {});
      const result = await signInWithPopup(auth, provider);
      const email = result.user?.email;
      const name = result.user?.displayName || (email ? email.split("@")[0] : "Google User");

      if (!email) {
        throw new Error("Google account email was not available.");
      }

      const data = await completeBackendGoogleLogin(apiBase, email, name);

      if (!data.success) {
        throw new Error(data.message || "Google login failed");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      if (typeof onSuccess === "function") onSuccess(data);
    } catch (error) {
      if (typeof onError === "function") onError(error);
    }
  }
};
