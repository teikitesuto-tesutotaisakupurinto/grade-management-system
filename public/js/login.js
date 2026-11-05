
"use strict";

const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const loginError = document.getElementById("loginError");

loginForm.addEventListener("submit", async event => {
  event.preventDefault();

  loginError.textContent = "";
  loginButton.disabled = true;
  loginButton.textContent = "ログイン中...";

  try {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    const credential = await gradeAuth.signInWithEmailAndPassword(
      email,
      password
    );

    const idToken = await credential.user.getIdToken(true);

    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "same-origin",
      body: JSON.stringify({ idToken })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      await gradeAuth.signOut();
      throw new Error(result.message || "ログインに失敗しました。");
    }

    location.replace("/dashboard.html");
  } catch (error) {
    loginError.textContent =
      error.message === "Firebase: Error (auth/invalid-credential)."
        ? "メールアドレスまたはパスワードが正しくありません。"
        : error.message || "ログインできませんでした。";
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "ログイン";
  }
});
