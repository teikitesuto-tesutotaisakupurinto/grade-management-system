
"use strict";

const PAGE_INFO = {
  "dashboard.html": ["ダッシュボード", "成績管理システムの概要"],
  "scores.html": ["成績一覧", "登録されたテスト成績を確認します。"],
  "score-submit.html": ["個人成績入力", "生徒1名の成績を登録します。"],
  "score-bulk.html": ["クラス一括入力", "複数の生徒の成績をまとめて登録します。"],
  "students.html": ["生徒管理", "生徒情報を管理します。"],
  "schools.html": ["学校管理", "学校情報を管理します。"],
  "municipalities.html": ["市区町村管理", "地域情報を管理します。"],
  "tests.html": ["テスト管理", "テストと教科・満点を管理します。"],
  "analytics.html": ["成績分析", "平均点・偏差値などを分析します。"],
  "rankings.html": ["ランキング", "テストの順位を確認します。"],
  "users.html": ["ユーザー管理", "システム利用者を管理します。"],
  "settings.html": ["システム設定", "システムの設定を管理します。"]
};

const NAV_ITEMS = [
  { href: "/dashboard.html", label: "ダッシュボード", roles: ["superAdmin", "organizationAdmin", "teacher", "student"] },
  { href: "/scores.html", label: "成績一覧", roles: ["superAdmin", "organizationAdmin", "teacher", "student"] },
  { href: "/score-submit.html", label: "個人成績入力", roles: ["superAdmin", "organizationAdmin", "teacher"] },
  { href: "/score-bulk.html", label: "一括入力", roles: ["superAdmin", "organizationAdmin", "teacher"] },
  { href: "/students.html", label: "生徒管理", roles: ["superAdmin", "organizationAdmin", "teacher"] },
  { href: "/schools.html", label: "学校管理", roles: ["superAdmin", "organizationAdmin"] },
  { href: "/municipalities.html", label: "市区町村", roles: ["superAdmin", "organizationAdmin"] },
  { href: "/tests.html", label: "テスト管理", roles: ["superAdmin", "organizationAdmin", "teacher"] },
  { href: "/analytics.html", label: "成績分析", roles: ["superAdmin", "organizationAdmin", "teacher"] },
  { href: "/rankings.html", label: "ランキング", roles: ["superAdmin", "organizationAdmin", "teacher", "student"] },
  { href: "/users.html", label: "ユーザー管理", roles: ["superAdmin", "organizationAdmin"] },
  { href: "/settings.html", label: "設定", roles: ["superAdmin", "organizationAdmin"] }
];

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const result = await response.json().catch(() => ({}));

  if (response.status === 401) {
    location.replace("/login.html");
    throw new Error("ログインしてください。");
  }

  if (!response.ok || result.success === false) {
    throw new Error(result.message || "処理に失敗しました。");
  }

  return result;
}

async function logout() {
  try {
    await apiRequest("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({})
    });
  } finally {
    location.replace("/login.html");
  }
}

async function initializePage() {
  const response = await apiRequest("/api/auth/me");
  const user = response.user;

  const currentFile = location.pathname.split("/").pop();
  const pageInfo = PAGE_INFO[currentFile] || ["管理画面", ""];

  document.title = `${pageInfo[0]} | 成績管理システム`;

  const nav = NAV_ITEMS
    .filter(item => item.roles.includes(user.role))
    .map(item => {
      const active = item.href.endsWith(currentFile) ? "active" : "";
      return `<a class="${active}" href="${item.href}">${item.label}</a>`;
    })
    .join("");

  document.getElementById("appHeader").innerHTML = `
    <header class="top-header">
      <a class="header-brand" href="/dashboard.html">成績管理システム</a>
      <div class="header-user">
        <span>${escapeHTML(user.name || user.email || "ユーザー")}</span>
        <button class="logout-button" id="logoutButton">ログアウト</button>
      </div>
    </header>
    <nav class="top-nav">${nav}</nav>
  `;

  document.getElementById("logoutButton")
    .addEventListener("click", logout);

  document.getElementById("pageHeading").innerHTML = `
    <div class="page-heading">
      <div>
        <h1>${pageInfo[0]}</h1>
        <p>${pageInfo[1]}</p>
      </div>
    </div>
  `;

  document.getElementById("appFooter").innerHTML =
    "© 2026 成績管理システム. All Rights Reserved.";

  const page = document.body.dataset.page;
  if (typeof window[`render_${page}`] === "function") {
    await window[`render_${page}`](user);
  }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initializePage();
  } catch (error) {
    console.error(error);
    if (error.message !== "ログインしてください。") {
      document.getElementById("pageContent").innerHTML =
        `<div class="panel">${escapeHTML(error.message)}</div>`;
    }
  }
});
