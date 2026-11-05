
"use strict";

function pageContent(html) {
  document.getElementById("pageContent").innerHTML = html;
}

function showMessage(message, type = "info") {
  const area = document.getElementById("pageMessage");
  if (!area) return;

  area.textContent = message;
  area.style.color = type === "error" ? "#c62828" : "#2563eb";
}

function tableHTML(headers, rows) {
  return `
    <div class="panel table-wrap">
      <table>
        <thead><tr>${headers.map(h => `<th>${escapeHTML(h)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.length
            ? rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")
            : `<tr><td colspan="${headers.length}">データがありません。</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function numberCard(label, value, note = "") {
  return `
    <section class="stat-card">
      <div class="stat-label">${escapeHTML(label)}</div>
      <div class="stat-value">${escapeHTML(value)}</div>
      <div class="stat-note">${escapeHTML(note)}</div>
    </section>
  `;
}

async function loadScores() {
  return (await apiRequest("/api/scores")).scores;
}

async function loadStudents() {
  return (await apiRequest("/api/students")).students;
}

async function loadTests() {
  return (await apiRequest("/api/tests")).tests;
}

/* ダッシュボード */

window.render_dashboard = async function () {
  const [scores, students, tests] = await Promise.all([
    loadScores(),
    loadStudents(),
    loadTests()
  ]);

  const present = scores.filter(s => s.status === "present");
  const average = present.length
    ? present.reduce((sum, s) => sum + Number(s.score), 0) / present.length
    : 0;

  const best = present.length
    ? Math.max(...present.map(s => Number(s.score)))
    : 0;

  pageContent(`
    <div class="card-grid">
      ${numberCard("登録生徒数", students.length, "登録済み生徒")}
      ${numberCard("登録テスト数", tests.length, "登録済みテスト")}
      ${numberCard("成績登録件数", scores.length, "欠席記録を含む")}
      ${numberCard("成績平均点", present.length ? average.toFixed(1) : "-", "登録済み成績の平均")}
    </div>

    <div class="content-grid">
      <section class="panel">
        <h2 class="section-title">最近の成績登録</h2>
        <div id="recentScores"></div>
      </section>
      <section class="panel">
        <h2 class="section-title">BEST</h2>
        <p>登録された成績の最高点</p>
        <div class="stat-value">${present.length ? best + "点" : "-"}</div>
        <p class="muted">現在登録されている成績の最高点です。</p>
      </section>
    </div>
  `);

  const recent = [...scores].slice(-10).reverse();

  document.getElementById("recentScores").innerHTML = tableHTML(
    ["生徒ID", "教科", "点数", "満点"],
    recent.map(s => [
      escapeHTML(s.studentId),
      escapeHTML(s.subject),
      s.status === "absent" ? "欠席" : escapeHTML(s.score),
      escapeHTML(s.maxScore)
    ])
  );
};

/* 成績一覧 */

window.render_scores = async function () {
  const scores = await loadScores();

  pageContent(`
    <section class="panel">
      <h2 class="section-title">成績データ</h2>
      <div id="scoreTable"></div>
    </section>
  `);

  document.getElementById("scoreTable").innerHTML = tableHTML(
    ["生徒ID", "テストID", "教科", "点数", "満点", "状態", "BEST"],
    scores.map(s => [
      escapeHTML(s.studentId),
      escapeHTML(s.testId),
      escapeHTML(s.subject),
      s.status === "absent" ? "-" : escapeHTML(s.score),
      escapeHTML(s.maxScore),
      s.status === "absent" ? "欠席" : "受験",
      ""
    ])
  );
};

/* 個人成績入力 */

window.render_score_submit = async function () {
  const [students, tests] = await Promise.all([
    loadStudents(),
    loadTests()
  ]);

  pageContent(`
    <section class="panel">
      <h2 class="section-title">成績登録</h2>
      <form id="scoreForm">
        <div class="form-grid">
          <div>
            <label>テスト</label>
            <select id="testId" required>
              <option value="">選択してください</option>
              ${tests.map(t => `<option value="${escapeHTML(t.id)}">${escapeHTML(t.name)}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>生徒</label>
            <select id="studentId" required>
              <option value="">選択してください</option>
              ${students.map(s => `<option value="${escapeHTML(s.id)}">${escapeHTML(s.name)}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>教科</label>
            <input id="subject" required placeholder="例：数学">
          </div>
          <div>
            <label>点数</label>
            <input id="score" type="number" min="0" required>
          </div>
          <div>
            <label>満点</label>
            <input id="maxScore" type="number" min="1" value="100" required>
          </div>
        </div>
        <p id="pageMessage" class="status-message"></p>
        <button class="btn btn-primary" type="submit">成績を登録</button>
      </form>
    </section>
  `);

  document.getElementById("scoreForm").addEventListener("submit", async event => {
    event.preventDefault();

    const button = event.submitter;
    button.disabled = true;

    try {
      await apiRequest("/api/scores", {
        method: "POST",
        body: JSON.stringify({
          testId: document.getElementById("testId").value,
          studentId: document.getElementById("studentId").value,
          subject: document.getElementById("subject").value,
          score: Number(document.getElementById("score").value),
          maxScore: Number(document.getElementById("maxScore").value)
        })
      });

      showMessage("成績を登録しました。");
      event.target.reset();
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });
};

/* クラス一括入力 */

window.render_score_bulk = async function () {
  const [students, tests] = await Promise.all([
    loadStudents(),
    loadTests()
  ]);

  pageContent(`
    <section class="panel">
      <h2 class="section-title">一括成績入力</h2>
      <div class="form-grid">
        <div>
          <label>テスト</label>
          <select id="bulkTest">
            <option value="">選択してください</option>
            ${tests.map(t => `<option value="${escapeHTML(t.id)}">${escapeHTML(t.name)}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>教科</label>
          <input id="bulkSubject" placeholder="例：数学">
        </div>
        <div>
          <label>満点</label>
          <input id="bulkMax" type="number" min="1" value="100">
        </div>
      </div>
      <div class="table-wrap" style="margin-top:20px">
        <table>
          <thead><tr><th>生徒名</th><th>点数</th><th>欠席</th></tr></thead>
          <tbody>
            ${students.map(s => `
              <tr data-student="${escapeHTML(s.id)}">
                <td>${escapeHTML(s.name)}</td>
                <td><input class="bulk-score" type="number" min="0" style="max-width:120px"></td>
                <td><input class="bulk-absent" type="checkbox"></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <p id="pageMessage" class="status-message"></p>
      <button id="bulkSubmit" class="btn btn-primary">一括登録</button>
    </section>
  `);

  document.getElementById("bulkSubmit").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;

    try {
      const rows = [...document.querySelectorAll("tbody tr[data-student]")];

      const scores = rows.map(row => ({
        studentId: row.dataset.student,
        score: row.querySelector(".bulk-score").value,
        status: row.querySelector(".bulk-absent").checked ? "absent" : "present"
      })).filter(item =>
        item.status === "absent" || item.score !== ""
      );

      const result = await apiRequest("/api/scores/bulk", {
        method: "POST",
        body: JSON.stringify({
          testId: document.getElementById("bulkTest").value,
          subject: document.getElementById("bulkSubject").value,
          maxScore: Number(document.getElementById("bulkMax").value),
          scores
        })
      });

      showMessage(`${result.count}件の成績を登録しました。`);
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });
};

/* 生徒管理 */

window.render_students = async function () {
  const students = await loadStudents();

  pageContent(`
    <section class="panel">
      <h2 class="section-title">生徒登録</h2>
      <form id="studentForm">
        <div class="form-grid">
          <div>
            <label>生徒氏名</label>
            <input id="studentName" required>
          </div>
          <div>
            <label>学校ID</label>
            <input id="schoolId">
          </div>
          <div>
            <label>市区町村ID</label>
            <input id="municipalityId">
          </div>
        </div>
        <p id="pageMessage" class="status-message"></p>
        <button class="btn btn-primary">生徒を登録</button>
      </form>
    </section>
    <section class="panel" style="margin-top:20px">
      <h2 class="section-title">登録生徒一覧</h2>
      <div id="studentTable"></div>
    </section>
  `);

  document.getElementById("studentTable").innerHTML = tableHTML(
    ["生徒名", "学校ID", "市区町村ID"],
    students.map(s => [
      escapeHTML(s.name),
      escapeHTML(s.schoolId || "-"),
      escapeHTML(s.municipalityId || "-")
    ])
  );

  document.getElementById("studentForm").addEventListener("submit", async event => {
    event.preventDefault();

    try {
      await apiRequest("/api/students", {
        method: "POST",
        body: JSON.stringify({
          name: document.getElementById("studentName").value,
          schoolId: document.getElementById("schoolId").value,
          municipalityId: document.getElementById("municipalityId").value
        })
      });

      showMessage("生徒を登録しました。");
      await window.render_students();
    } catch (error) {
      showMessage(error.message, "error");
    }
  });
};

/* テスト管理 */

window.render_tests = async function () {
  const tests = await loadTests();

  pageContent(`
    <section class="panel">
      <h2 class="section-title">テスト登録</h2>
      <form id="testForm">
        <div class="form-grid">
          <div>
            <label>テスト名</label>
            <input id="testName" required placeholder="例：2学期期末テスト">
          </div>
          <div>
            <label>実施日</label>
            <input id="testDate" type="date" required>
          </div>
          <div>
            <label>教科</label>
            <input id="testSubjects" required placeholder="国語,数学,英語,理科,社会">
          </div>
          <div>
            <label>各教科の満点</label>
            <input id="testMax" type="number" min="1" value="100">
          </div>
        </div>
        <p id="pageMessage" class="status-message"></p>
        <button class="btn btn-primary">テストを登録</button>
      </form>
    </section>
    <section class="panel" style="margin-top:20px">
      <h2 class="section-title">登録済みテスト</h2>
      <div id="testTable"></div>
    </section>
  `);

  document.getElementById("testTable").innerHTML = tableHTML(
    ["テスト名", "実施日", "教科"],
    tests.map(t => [
      escapeHTML(t.name),
      escapeHTML(t.date),
      escapeHTML((t.subjects || []).map(s => s.name).join("・"))
    ])
  );

  document.getElementById("testForm").addEventListener("submit", async event => {
    event.preventDefault();

    try {
      const names = document.getElementById("testSubjects").value
        .split(",")
        .map(value => value.trim())
        .filter(Boolean);

      await apiRequest("/api/tests", {
        method: "POST",
        body: JSON.stringify({
          name: document.getElementById("testName").value,
          date: document.getElementById("testDate").value,
          subjects: names.map(name => ({
            name,
            maxScore: Number(document.getElementById("testMax").value)
          }))
        })
      });

      showMessage("テストを登録しました。");
      await window.render_tests();
    } catch (error) {
      showMessage(error.message, "error");
    }
  });
};

/* 成績分析 */

window.render_analytics = async function () {
  const tests = await loadTests();

  pageContent(`
    <section class="panel">
      <h2 class="section-title">成績分析</h2>
      <div class="form-grid">
        <div>
          <label>テスト</label>
          <select id="analysisTest">
            <option value="">選択してください</option>
            ${tests.map(t => `<option value="${escapeHTML(t.id)}">${escapeHTML(t.name)}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>教科</label>
          <input id="analysisSubject" placeholder="例：数学">
        </div>
      </div>
      <button id="analysisButton" class="btn btn-primary" style="margin-top:20px">分析する</button>
      <p id="pageMessage" class="status-message"></p>
    </section>
    <div id="analysisResult" style="margin-top:20px"></div>
  `);

  document.getElementById("analysisButton").addEventListener("click", async () => {
    try {
      const testId = document.getElementById("analysisTest").value;
      const subject = document.getElementById("analysisSubject").value;

      const result = await apiRequest(
        `/api/analytics?testId=${encodeURIComponent(testId)}&subject=${encodeURIComponent(subject)}`
      );

      const stats = result.overall;

      document.getElementById("analysisResult").innerHTML = stats
        ? `
          <div class="card-grid">
            ${numberCard("受験者数", stats.count + "人")}
            ${numberCard("平均点", stats.average.toFixed(1) + "点")}
            ${numberCard("最高点", stats.highest + "点")}
            ${numberCard("最低点", stats.lowest + "点")}
          </div>
          <section class="panel" style="margin-top:20px">
            <h2 class="section-title">市区町村別・学校別集計</h2>
            <p>市区町村別：${Object.keys(result.municipalities).length}地域</p>
            <p>学校別：${Object.keys(result.schools).length}校</p>
            <p class="muted">偏差値は受験者数・標準偏差の条件を満たす場合に表示します。</p>
          </section>
        `
        : `<section class="panel">集計できる成績がありません。</section>`;
    } catch (error) {
      showMessage(error.message, "error");
    }
  });
};

/* ランキング */

window.render_rankings = async function () {
  const scores = await loadScores();

  const ranking = scores
    .filter(s => s.status === "present")
    .sort((a, b) => Number(b.score) / Number(b.maxScore) -
                    Number(a.score) / Number(a.maxScore));

  pageContent(`
    <section class="panel">
      <h2 class="section-title">成績ランキング</h2>
      <div id="rankingTable"></div>
    </section>
  `);

  document.getElementById("rankingTable").innerHTML = tableHTML(
    ["順位", "生徒ID", "テストID", "教科", "点数", "得点率"],
    ranking.map((s, index) => [
      index + 1,
      escapeHTML(s.studentId),
      escapeHTML(s.testId),
      escapeHTML(s.subject),
      `${escapeHTML(s.score)} / ${escapeHTML(s.maxScore)}`,
      `${(Number(s.score) / Number(s.maxScore) * 100).toFixed(1)}%`
    ])
  );
};

/* 管理系ページ */

async function renderManagement(type, title, fields) {
  const result = await apiRequest(`/api/manage/${type}`);

  pageContent(`
    <section class="panel">
      <h2 class="section-title">${title}</h2>
      <p class="muted">登録済みデータを確認できます。</p>
      <div id="managementTable"></div>
    </section>
  `);

  document.getElementById("managementTable").innerHTML = tableHTML(
    ["ID", ...fields],
    result.items.map(item => [
      escapeHTML(item.id),
      ...fields.map(field => escapeHTML(item[field] ?? "-"))
    ])
  );
}

window.render_schools = () =>
  renderManagement("schools", "学校一覧", ["name", "municipalityId"]);

window.render_municipalities = () =>
  renderManagement("municipalities", "市区町村一覧", ["name", "prefecture"]);

window.render_users = () =>
  renderManagement("users", "ユーザー一覧", ["name", "email", "role", "status"]);

window.render_settings = async function () {
  pageContent(`
    <section class="panel">
      <h2 class="section-title">システム設定</h2>
      <p>成績管理システムの基本設定を行います。</p>
      <p class="muted">設定の変更機能は管理者向け設定APIの実装後に有効になります。</p>
    </section>
  `);
};
