
"use strict";

const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const path = require("path");
const crypto = require("crypto");

const { admin, db, auth } = require("./firebase-admin");

const app = express();
const PORT = process.env.PORT || 10000;

const SESSION_COOKIE = "grade_session";
const SESSION_EXPIRES_MS = 5 * 24 * 60 * 60 * 1000;

app.disable("x-powered-by");

app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const publicDir = path.join(__dirname, "public");

const PAGE_ROLES = {
  "/dashboard.html": [
    "superAdmin", "organizationAdmin", "teacher", "student"
  ],
  "/scores.html": [
    "superAdmin", "organizationAdmin", "teacher", "student"
  ],
  "/score-submit.html": [
    "superAdmin", "organizationAdmin", "teacher"
  ],
  "/score-bulk.html": [
    "superAdmin", "organizationAdmin", "teacher"
  ],
  "/students.html": [
    "superAdmin", "organizationAdmin", "teacher"
  ],
  "/schools.html": [
    "superAdmin", "organizationAdmin"
  ],
  "/municipalities.html": [
    "superAdmin", "organizationAdmin"
  ],
  "/tests.html": [
    "superAdmin", "organizationAdmin", "teacher"
  ],
  "/analytics.html": [
    "superAdmin", "organizationAdmin", "teacher"
  ],
  "/rankings.html": [
    "superAdmin", "organizationAdmin", "teacher", "student"
  ],
  "/users.html": [
    "superAdmin", "organizationAdmin"
  ],
  "/settings.html": [
    "superAdmin", "organizationAdmin"
  ]
};

const PAGE_TITLES = {
  "/dashboard.html": "ダッシュボード",
  "/scores.html": "成績一覧",
  "/score-submit.html": "個人成績入力",
  "/score-bulk.html": "クラス一括入力",
  "/students.html": "生徒管理",
  "/schools.html": "学校管理",
  "/municipalities.html": "市区町村管理",
  "/tests.html": "テスト管理",
  "/analytics.html": "成績分析",
  "/rankings.html": "ランキング",
  "/users.html": "ユーザー管理",
  "/settings.html": "システム設定"
};

function sendError(res, status, message) {
  return res.status(status).json({
    success: false,
    message
  });
}

async function requireUser(req, res, next) {
  try {
    const sessionCookie = req.cookies[SESSION_COOKIE];

    if (!sessionCookie) {
      return sendError(res, 401, "ログインが必要です。");
    }

    const decoded = await auth.verifySessionCookie(
      sessionCookie,
      true
    );

    const userDoc = await db
      .collection("gradeUsers")
      .doc(decoded.uid)
      .get();

    if (!userDoc.exists) {
      return sendError(
        res,
        403,
        "このアカウントは成績管理システムに登録されていません。"
      );
    }

    const user = userDoc.data();

    if (user.status !== "active") {
      return sendError(res, 403, "このアカウントは利用停止中です。");
    }

    req.user = {
      uid: decoded.uid,
      email: decoded.email || "",
      ...user
    };

    next();
  } catch (error) {
    return sendError(res, 401, "ログインセッションが無効です。");
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return sendError(res, 403, "この操作を行う権限がありません。");
    }

    next();
  };
}

function requireOrganizationAccess(req, res, next) {
  const requestedOrganizationId =
    req.body.organizationId ||
    req.query.organizationId;

  if (req.user.role === "superAdmin") {
    return next();
  }

  if (
    requestedOrganizationId &&
    requestedOrganizationId !== req.user.organizationId
  ) {
    return sendError(res, 403, "別の組織にはアクセスできません。");
  }

  next();
}

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    system: "Grade Management System"
  });
});

/* =========================
   ログインセッション
========================= */

app.post("/api/auth/session", async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return sendError(res, 400, "IDトークンがありません。");
    }

    const decoded = await auth.verifyIdToken(idToken);

    const userDoc = await db
      .collection("gradeUsers")
      .doc(decoded.uid)
      .get();

    if (!userDoc.exists) {
      return sendError(
        res,
        403,
        "このアカウントは成績管理システムに登録されていません。"
      );
    }

    if (userDoc.data().status !== "active") {
      return sendError(res, 403, "このアカウントは利用停止中です。");
    }

    const sessionCookie = await auth.createSessionCookie(
      idToken,
      { expiresIn: SESSION_EXPIRES_MS }
    );

    res.cookie(SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_EXPIRES_MS,
      path: "/"
    });

    return res.json({
      success: true,
      user: {
        uid: decoded.uid,
        email: decoded.email,
        ...userDoc.data()
      }
    });
  } catch (error) {
    console.error("Session creation error:", error);
    return sendError(res, 401, "ログイン認証に失敗しました。");
  }
});

app.get("/api/auth/me", requireUser, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });

  res.json({ success: true });
});

/* =========================
   ページアクセス制御
========================= */

app.get("/", (req, res) => {
  res.redirect("/login.html");
});

app.get("/login.html", (req, res) => {
  res.sendFile(path.join(publicDir, "login.html"));
});

app.get("/access-denied.html", (req, res) => {
  res.status(403).send(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>アクセス権限がありません</title>
      <link rel="stylesheet" href="/css/style.css">
    </head>
    <body class="error-page">
      <main class="error-panel">
        <h1>アクセス権限がありません</h1>
        <p>このページを利用する権限がありません。</p>
        <a href="/dashboard.html" class="btn btn-primary">
          ダッシュボードへ戻る
        </a>
      </main>
    </body>
    </html>
  `);
});

app.get(Object.keys(PAGE_ROLES), requireUser, (req, res, next) => {
  const page = req.path;
  const allowedRoles = PAGE_ROLES[page];

  if (!allowedRoles || !allowedRoles.includes(req.user.role)) {
    return res.redirect("/access-denied.html");
  }

  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(publicDir, page));
});

/* =========================
   テスト管理
========================= */

app.get(
  "/api/tests",
  requireUser,
  async (req, res) => {
    try {
      let query = db.collection("gradeTests");

      if (req.user.role !== "superAdmin") {
        query = query.where(
          "organizationId",
          "==",
          req.user.organizationId
        );
      }

      const snapshot = await query.get();

      const tests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      res.json({ success: true, tests });
    } catch (error) {
      console.error(error);
      sendError(res, 500, "テスト一覧を取得できませんでした。");
    }
  }
);

app.post(
  "/api/tests",
  requireUser,
  requireRole("superAdmin", "organizationAdmin", "teacher"),
  async (req, res) => {
    try {
      const {
        name,
        date,
        subjects,
        organizationId
      } = req.body;

      if (!name || !date || !Array.isArray(subjects) || subjects.length === 0) {
        return sendError(res, 400, "必須項目を入力してください。");
      }

      const targetOrganization =
        req.user.role === "superAdmin"
          ? organizationId
          : req.user.organizationId;

      if (!targetOrganization) {
        return sendError(res, 400, "組織を指定してください。");
      }

      const doc = await db.collection("gradeTests").add({
        name: String(name).trim(),
        date,
        subjects: subjects.map(subject => ({
          name: String(subject.name).trim(),
          maxScore: Number(subject.maxScore)
        })),
        organizationId: targetOrganization,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: req.user.uid
      });

      res.json({
        success: true,
        id: doc.id
      });
    } catch (error) {
      console.error(error);
      sendError(res, 500, "テストを登録できませんでした。");
    }
  }
);

/* =========================
   成績登録
========================= */

app.post(
  "/api/scores",
  requireUser,
  requireRole("superAdmin", "organizationAdmin", "teacher"),
  async (req, res) => {
    try {
      const {
        testId,
        studentId,
        subject,
        score,
        maxScore,
        organizationId
      } = req.body;

      if (
        !testId ||
        !studentId ||
        !subject ||
        !Number.isFinite(Number(score)) ||
        !Number.isFinite(Number(maxScore))
      ) {
        return sendError(res, 400, "成績情報が不足しています。");
      }

      const numericScore = Number(score);
      const numericMax = Number(maxScore);

      if (
        numericMax <= 0 ||
        numericScore < 0 ||
        numericScore > numericMax
      ) {
        return sendError(res, 400, "点数または満点が不正です。");
      }

      const studentDoc = await db
        .collection("gradeStudents")
        .doc(studentId)
        .get();

      if (!studentDoc.exists) {
        return sendError(res, 404, "生徒が見つかりません。");
      }

      const student = studentDoc.data();

      if (
        req.user.role !== "superAdmin" &&
        student.organizationId !== req.user.organizationId
      ) {
        return sendError(res, 403, "この生徒の成績を登録する権限がありません。");
      }

      const targetOrganization =
        req.user.role === "superAdmin"
          ? organizationId || student.organizationId
          : req.user.organizationId;

      const doc = await db.collection("gradeScores").add({
        testId,
        studentId,
        subject: String(subject).trim(),
        score: numericScore,
        maxScore: numericMax,
        organizationId: targetOrganization,
        municipalityId: student.municipalityId || null,
        schoolId: student.schoolId || null,
        status: "present",
        createdBy: req.user.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      res.json({
        success: true,
        id: doc.id
      });
    } catch (error) {
      console.error(error);
      sendError(res, 500, "成績を登録できませんでした。");
    }
  }
);

/* =========================
   クラス一括成績登録
========================= */

app.post(
  "/api/scores/bulk",
  requireUser,
  requireRole("superAdmin", "organizationAdmin", "teacher"),
  async (req, res) => {
    try {
      const { testId, subject, maxScore, scores } = req.body;

      if (
        !testId ||
        !subject ||
        !Array.isArray(scores) ||
        scores.length === 0
      ) {
        return sendError(res, 400, "一括登録データが不正です。");
      }

      const numericMax = Number(maxScore);

      if (!Number.isFinite(numericMax) || numericMax <= 0) {
        return sendError(res, 400, "満点が不正です。");
      }

      const studentIds = [...new Set(
        scores.map(item => item.studentId).filter(Boolean)
      )];

      const studentDocs = await Promise.all(
        studentIds.map(id =>
          db.collection("gradeStudents").doc(id).get()
        )
      );

      const studentMap = new Map();

      studentDocs.forEach(doc => {
        if (doc.exists) studentMap.set(doc.id, doc.data());
      });

      const batch = db.batch();
      let count = 0;

      for (const item of scores) {
        if (!item.studentId) continue;

        const student = studentMap.get(item.studentId);

        if (!student) continue;

        if (
          req.user.role !== "superAdmin" &&
          student.organizationId !== req.user.organizationId
        ) {
          continue;
        }

        const absent = item.status === "absent";
        const numericScore = Number(item.score);

        if (
          !absent &&
          (!Number.isFinite(numericScore) ||
           numericScore < 0 ||
           numericScore > numericMax)
        ) {
          continue;
        }

        const ref = db.collection("gradeScores").doc();

        batch.set(ref, {
          testId,
          studentId: item.studentId,
          subject: String(subject).trim(),
          score: absent ? null : numericScore,
          maxScore: numericMax,
          status: absent ? "absent" : "present",
          organizationId: student.organizationId,
          municipalityId: student.municipalityId || null,
          schoolId: student.schoolId || null,
          createdBy: req.user.uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        count++;
      }

      if (count === 0) {
        return sendError(res, 400, "登録できる成績がありません。");
      }

      await batch.commit();

      res.json({
        success: true,
        count
      });
    } catch (error) {
      console.error(error);
      sendError(res, 500, "一括登録に失敗しました。");
    }
  }
);

/* =========================
   偏差値・成績分析
========================= */

function calculateStatistics(records) {
  const scores = records
    .filter(record =>
      record.status === "present" &&
      Number.isFinite(record.score)
    )
    .map(record => record.score);

  if (scores.length === 0) {
    return null;
  }

  const count = scores.length;
  const total = scores.reduce((sum, score) => sum + score, 0);
  const average = total / count;
  const variance = scores.reduce(
    (sum, score) => sum + Math.pow(score - average, 2),
    0
  ) / count;

  const standardDeviation = Math.sqrt(variance);

  return {
    count,
    average,
    highest: Math.max(...scores),
    lowest: Math.min(...scores),
    standardDeviation
  };
}

function calculateDeviationScore(score, statistics) {
  if (!statistics || statistics.count < 5) return null;
  if (statistics.standardDeviation === 0) return null;

  return Math.round(
    50 +
    10 * (score - statistics.average) /
    statistics.standardDeviation
  );
}

app.get(
  "/api/analytics",
  requireUser,
  async (req, res) => {
    try {
      const { testId, subject } = req.query;

      if (!testId || !subject) {
        return sendError(res, 400, "テストと教科を指定してください。");
      }

      let query = db.collection("gradeScores")
        .where("testId", "==", testId)
        .where("subject", "==", subject);

      if (req.user.role !== "superAdmin") {
        query = query.where(
          "organizationId",
          "==",
          req.user.organizationId
        );
      }

      const snapshot = await query.get();

      const records = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const overall = calculateStatistics(records);

      const groups = {
        municipality: {},
        school: {}
      };

      for (const record of records) {
        if (record.status !== "present") continue;

        const municipalityId = record.municipalityId;
        const schoolId = record.schoolId;

        if (municipalityId) {
          if (!groups.municipality[municipalityId]) {
            groups.municipality[municipalityId] = [];
          }

          groups.municipality[municipalityId].push(record);
        }

        if (schoolId) {
          if (!groups.school[schoolId]) {
            groups.school[schoolId] = [];
          }

          groups.school[schoolId].push(record);
        }
      }

      const summarizeGroups = source => {
        const result = {};

        for (const [id, groupRecords] of Object.entries(source)) {
          result[id] = calculateStatistics(groupRecords);
        }

        return result;
      };

      res.json({
        success: true,
        overall,
        municipalities: summarizeGroups(groups.municipality),
        schools: summarizeGroups(groups.school),
        records: records.map(record => ({
          ...record,
          deviationOverall:
            record.status === "present"
              ? calculateDeviationScore(record.score, overall)
              : null
        }))
      });
    } catch (error) {
      console.error(error);
      sendError(res, 500, "成績分析を取得できませんでした。");
    }
  }
);

/* =========================
   成績一覧
========================= */

app.get(
  "/api/scores",
  requireUser,
  async (req, res) => {
    try {
      let query = db.collection("gradeScores");

      if (req.user.role !== "superAdmin") {
        query = query.where(
          "organizationId",
          "==",
          req.user.organizationId
        );
      }

      const snapshot = await query.get();

      res.json({
        success: true,
        scores: snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
      });
    } catch (error) {
      console.error(error);
      sendError(res, 500, "成績一覧を取得できませんでした。");
    }
  }
);

/* =========================
   生徒管理
========================= */

app.get(
  "/api/students",
  requireUser,
  async (req, res) => {
    try {
      let query = db.collection("gradeStudents");

      if (req.user.role !== "superAdmin") {
        query = query.where(
          "organizationId",
          "==",
          req.user.organizationId
        );
      }

      const snapshot = await query.get();

      res.json({
        success: true,
        students: snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
      });
    } catch (error) {
      console.error(error);
      sendError(res, 500, "生徒一覧を取得できませんでした。");
    }
  }
);

app.post(
  "/api/students",
  requireUser,
  requireRole("superAdmin", "organizationAdmin", "teacher"),
  async (req, res) => {
    try {
      const {
        name,
        schoolId,
        municipalityId
      } = req.body;

      if (!name) {
        return sendError(res, 400, "生徒名を入力してください。");
      }

      const organizationId =
        req.user.role === "superAdmin"
          ? req.body.organizationId
          : req.user.organizationId;

      if (!organizationId) {
        return sendError(res, 400, "組織を指定してください。");
      }

      const ref = await db.collection("gradeStudents").add({
        name: String(name).trim(),
        schoolId: schoolId || null,
        municipalityId: municipalityId || null,
        organizationId,
        status: "active",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      res.json({
        success: true,
        id: ref.id
      });
    } catch (error) {
      console.error(error);
      sendError(res, 500, "生徒を登録できませんでした。");
    }
  }
);

/* =========================
   管理用データ一覧
========================= */

const COLLECTIONS = {
  organizations: "gradeOrganizations",
  municipalities: "gradeMunicipalities",
  schools: "gradeSchools",
  users: "gradeUsers"
};

app.get(
  "/api/manage/:type",
  requireUser,
  requireRole("superAdmin", "organizationAdmin"),
  async (req, res) => {
    try {
      const collection = COLLECTIONS[req.params.type];

      if (!collection) {
        return sendError(res, 404, "対象のデータがありません。");
      }

      let query = db.collection(collection);

      if (
        req.user.role !== "superAdmin" &&
        req.params.type !== "organizations" &&
        req.params.type !== "municipalities"
      ) {
        query = query.where(
          "organizationId",
          "==",
          req.user.organizationId
        );
      }

      const snapshot = await query.get();

      res.json({
        success: true,
        items: snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
      });
    } catch (error) {
      console.error(error);
      sendError(res, 500, "管理データを取得できませんでした。");
    }
  }
);

/* =========================
   未登録ページ・静的ファイル
========================= */

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return sendError(res, 404, "APIが見つかりません。");
  }

  next();
});

app.use(express.static(publicDir));

app.use((req, res) => {
  res.status(404).send("ページが見つかりません。");
});

/* =========================
   起動
========================= */

app.listen(PORT, () => {
  console.log(`Grade Management System: port ${PORT}`);
});
