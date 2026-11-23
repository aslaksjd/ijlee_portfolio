(function () {
  "use strict";

  var SETTINGS_KEY = "portfolio_admin_settings_v1";
  var CONTENT_PATH = "public/content/content.json";

  var state = {
    profile: { name: "", role: "", headline: "", subhead: "", photo: "assets/img/profile/me.jpg", photoFallback: "assets/img/profile/placeholder.svg" },
    about: { name: "", birth: "", address: "", email: "", education: "", company: "", bio: "" },
    changelog: [],
    aiSkills: []
  };

  var pendingProfilePhoto = null; // File
  var uid = 0;
  function nextId(prefix) { uid += 1; return prefix + "-" + Date.now().toString(36) + "-" + uid; }

  function slugify(str, fallback) {
    var s = (str || "").toString().trim().toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return s || fallback;
  }

  function extOf(filename) {
    var m = /\.([a-zA-Z0-9]+)$/.exec(filename || "");
    return m ? m[1].toLowerCase() : "png";
  }

  /* ---------------- settings ---------------- */

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function saveSettingsToStorage(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  function getSettings() {
    return {
      project: document.getElementById("set-project").value.trim(),
      branch: document.getElementById("set-branch").value.trim() || "main",
      token: document.getElementById("set-token").value.trim()
    };
  }

  function setStatus(elId, msg, kind) {
    var node = document.getElementById(elId);
    node.textContent = msg;
    node.className = "admin-status" + (kind ? " " + kind : "");
  }

  /* ---------------- GitHub Contents API ---------------- */
  // shortcut: each file is PUT individually (no atomic multi-file commit like
  // GitLab's commits API) — if that's ever needed, move to the Git Data API
  // (blobs + tree + commit + ref update).

  function apiRepoBase(s) {
    return "https://api.github.com/repos/" + s.project.split("/").map(encodeURIComponent).join("/");
  }

  function encodePath(filePath) {
    return filePath.split("/").map(encodeURIComponent).join("/");
  }

  function ghHeaders(s) {
    return { "Authorization": "Bearer " + s.token, "Accept": "application/vnd.github+json" };
  }

  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(str);
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function b64ToUtf8(b64) {
    var binary = atob(b64.replace(/\n/g, ""));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }

  function getFileMeta(s, filePath) {
    var url = apiRepoBase(s) + "/contents/" + encodePath(filePath) + "?ref=" + encodeURIComponent(s.branch);
    return fetch(url, { headers: ghHeaders(s) }).then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("조회 실패 (" + res.status + ")");
      return res.json();
    });
  }

  function getRawFile(s, filePath) {
    return getFileMeta(s, filePath).then(function (meta) {
      if (!meta) throw new Error("파일을 찾을 수 없습니다 (404)");
      return b64ToUtf8(meta.content);
    });
  }

  function putFile(s, filePath, base64Content, message, sha) {
    var url = apiRepoBase(s) + "/contents/" + encodePath(filePath);
    var body = { message: message, content: base64Content, branch: s.branch };
    if (sha) body.sha = sha;
    return fetch(url, {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders(s)),
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          throw new Error((body && body.message) || ("커밋 실패 (" + res.status + ")"));
        });
      }
      return res.json();
    });
  }

  function commitFiles(s, actions, message) {
    return actions.reduce(function (p, action) {
      return p.then(function () {
        return getFileMeta(s, action.filePath).then(function (meta) {
          return putFile(s, action.filePath, action.base64, message, meta && meta.sha);
        });
      });
    }, Promise.resolve());
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = reader.result;
        var comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* ---------------- form <-> state binding ---------------- */

  function bindSimpleForm(formId, target) {
    var form = document.getElementById(formId);
    form.querySelectorAll("[data-field]").forEach(function (input) {
      input.value = target[input.dataset.field] || "";
      input.addEventListener("input", function () {
        target[input.dataset.field] = input.value;
      });
    });
  }

  /* ---------------- changelog editor ---------------- */

  function changelogEntryTemplate() {
    return { id: nextId("cl"), date: "", title: "", org: "", summary: "", tags: [], images: [], _pending: [] };
  }

  function renderChangelogEditor() {
    var root = document.getElementById("changelog-editor");
    root.innerHTML = "";
    state.changelog.forEach(function (entry, idx) {
      root.appendChild(buildChangelogCard(entry, idx));
    });
  }

  function buildChangelogCard(entry) {
    var card = document.createElement("div");
    card.className = "entry-card";

    var grid = document.createElement("div");
    grid.className = "admin-grid";
    grid.innerHTML =
      '<label>날짜 <input data-f="date" type="text" placeholder="2023.05"></label>' +
      '<label>소속/조직 <input data-f="org" type="text"></label>' +
      '<label class="span-2">제목 <input data-f="title" type="text"></label>' +
      '<label class="span-2">설명 <textarea data-f="summary" rows="3"></textarea></label>' +
      '<label class="span-2">태그 (쉼표로 구분) <input data-f="tags" type="text" placeholder="FortiGate, 자동화"></label>';
    card.appendChild(grid);

    ["date", "org", "title", "summary"].forEach(function (f) {
      var input = grid.querySelector('[data-f="' + f + '"]');
      input.value = entry[f] || "";
      input.addEventListener("input", function () { entry[f] = input.value; });
    });
    var tagsInput = grid.querySelector('[data-f="tags"]');
    tagsInput.value = (entry.tags || []).join(", ");
    tagsInput.addEventListener("input", function () {
      entry.tags = tagsInput.value.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
    });

    var thumbs = document.createElement("div");
    thumbs.className = "entry-thumbs";
    card.appendChild(thumbs);

    function renderThumbs() {
      thumbs.innerHTML = "";
      (entry.images || []).forEach(function (path, i) {
        var img = document.createElement("img");
        img.src = "../" + path;
        img.alt = "";
        img.title = "클릭하여 제거";
        img.addEventListener("click", function () {
          entry.images.splice(i, 1);
          renderThumbs();
        });
        thumbs.appendChild(img);
      });
      (entry._pending || []).forEach(function (p, i) {
        var img = document.createElement("img");
        img.src = p.previewUrl;
        img.title = "업로드 예정 (클릭하여 취소)";
        img.style.outline = "1px dashed var(--flag)";
        img.addEventListener("click", function () {
          entry._pending.splice(i, 1);
          renderThumbs();
        });
        thumbs.appendChild(img);
      });
    }
    renderThumbs();

    var fileField = document.createElement("label");
    fileField.className = "field-block";
    fileField.innerHTML = '스크린샷 추가 <input type="file" accept="image/*" multiple>';
    var fileInput = fileField.querySelector("input");
    fileInput.addEventListener("change", function () {
      Array.prototype.forEach.call(fileInput.files, function (file) {
        entry._pending.push({ file: file, previewUrl: URL.createObjectURL(file) });
      });
      fileInput.value = "";
      renderThumbs();
    });
    card.appendChild(fileField);

    var foot = document.createElement("div");
    foot.className = "entry-card-foot";
    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-danger";
    removeBtn.textContent = "항목 삭제";
    removeBtn.addEventListener("click", function () {
      var idx = state.changelog.indexOf(entry);
      if (idx >= 0) state.changelog.splice(idx, 1);
      renderChangelogEditor();
    });
    foot.appendChild(removeBtn);
    card.appendChild(foot);

    return card;
  }

  /* ---------------- ai skill editor ---------------- */

  function skillEntryTemplate() {
    return { id: nextId("skill"), title: "", summary: "", description: "", modules: [], tags: [], images: [], _pending: [] };
  }

  function renderSkillEditor() {
    var root = document.getElementById("skill-editor");
    root.innerHTML = "";
    state.aiSkills.forEach(function (entry) {
      root.appendChild(buildSkillCard(entry));
    });
  }

  function buildSkillCard(entry) {
    var card = document.createElement("div");
    card.className = "entry-card";

    var grid = document.createElement("div");
    grid.className = "admin-grid";
    grid.innerHTML =
      '<label class="span-2">제목 <input data-f="title" type="text"></label>' +
      '<label class="span-2">한 줄 요약 <input data-f="summary" type="text"></label>' +
      '<label class="span-2">상세 설명 <textarea data-f="description" rows="3"></textarea></label>' +
      '<label class="span-2">구성 모듈 (줄바꿈으로 구분) <textarea data-f="modules" rows="3"></textarea></label>' +
      '<label class="span-2">태그 (쉼표로 구분) <input data-f="tags" type="text"></label>';
    card.appendChild(grid);

    ["title", "summary", "description"].forEach(function (f) {
      var input = grid.querySelector('[data-f="' + f + '"]');
      input.value = entry[f] || "";
      input.addEventListener("input", function () { entry[f] = input.value; });
    });
    var modulesInput = grid.querySelector('[data-f="modules"]');
    modulesInput.value = (entry.modules || []).join("\n");
    modulesInput.addEventListener("input", function () {
      entry.modules = modulesInput.value.split("\n").map(function (m) { return m.trim(); }).filter(Boolean);
    });
    var tagsInput = grid.querySelector('[data-f="tags"]');
    tagsInput.value = (entry.tags || []).join(", ");
    tagsInput.addEventListener("input", function () {
      entry.tags = tagsInput.value.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
    });

    var thumbs = document.createElement("div");
    thumbs.className = "entry-thumbs";
    card.appendChild(thumbs);

    function renderThumbs() {
      thumbs.innerHTML = "";
      (entry.images || []).forEach(function (path, i) {
        var img = document.createElement("img");
        img.src = "../" + path;
        img.title = "클릭하여 제거 (민감정보 노출 여부를 반드시 확인하세요)";
        img.addEventListener("click", function () {
          entry.images.splice(i, 1);
          renderThumbs();
        });
        thumbs.appendChild(img);
      });
      (entry._pending || []).forEach(function (p, i) {
        var img = document.createElement("img");
        img.src = p.previewUrl;
        img.style.outline = "1px dashed var(--flag)";
        img.title = "업로드 예정 (클릭하여 취소)";
        img.addEventListener("click", function () {
          entry._pending.splice(i, 1);
          renderThumbs();
        });
        thumbs.appendChild(img);
      });
    }
    renderThumbs();

    var fileField = document.createElement("label");
    fileField.className = "field-block";
    fileField.innerHTML = '스크린샷 추가 <input type="file" accept="image/*" multiple>';
    var fileInput = fileField.querySelector("input");
    fileInput.addEventListener("change", function () {
      Array.prototype.forEach.call(fileInput.files, function (file) {
        entry._pending.push({ file: file, previewUrl: URL.createObjectURL(file) });
      });
      fileInput.value = "";
      renderThumbs();
    });
    card.appendChild(fileField);
    card.appendChild(makeHint("업로드 전에 IP, 사내 시스템명 등 민감정보가 찍혀 있지 않은지 직접 확인하세요."));

    var foot = document.createElement("div");
    foot.className = "entry-card-foot";
    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-danger";
    removeBtn.textContent = "항목 삭제";
    removeBtn.addEventListener("click", function () {
      var idx = state.aiSkills.indexOf(entry);
      if (idx >= 0) state.aiSkills.splice(idx, 1);
      renderSkillEditor();
    });
    foot.appendChild(removeBtn);
    card.appendChild(foot);

    return card;
  }

  function makeHint(msg) {
    var p = document.createElement("p");
    p.className = "admin-hint";
    p.style.marginTop = "8px";
    p.textContent = msg;
    return p;
  }

  /* ---------------- load from repo ---------------- */

  function populateAllForms() {
    bindSimpleForm("about-form", state.about);
    bindSimpleForm("profile-form", state.profile);
    renderChangelogEditor();
    renderSkillEditor();
  }

  function loadFromRepo() {
    var s = getSettings();
    if (!s.project || !s.token) {
      setStatus("settings-status", "프로젝트 경로와 토큰을 먼저 입력하세요.", "err");
      return;
    }
    setStatus("settings-status", "불러오는 중…");
    getRawFile(s, CONTENT_PATH)
      .then(function (text) {
        var data = JSON.parse(text);
        state.profile = Object.assign(state.profile, data.profile || {});
        state.about = Object.assign(state.about, data.about || {});
        state.changelog = (data.changelog || []).map(function (e) {
          return Object.assign({ id: nextId("cl"), tags: [], images: [], _pending: [] }, e);
        });
        state.aiSkills = (data.aiSkills || []).map(function (e) {
          return Object.assign({ id: nextId("skill"), tags: [], images: [], modules: [], _pending: [] }, e);
        });
        populateAllForms();
        setStatus("settings-status", "불러오기 완료.", "ok");
      })
      .catch(function (err) {
        setStatus("settings-status", "불러오기 실패: " + err.message, "err");
      });
  }

  /* ---------------- save / commit ---------------- */

  function collectActions(s) {
    var actions = [];
    var imageChecks = [];

    function queueImages(entry, baseDir) {
      var slug = slugify(entry.title, entry.id);
      (entry._pending || []).forEach(function (p, i) {
        var filePath = "assets/img/" + baseDir + "/" + slug + "/" + Date.now().toString(36) + "-" + i + "." + extOf(p.file.name);
        imageChecks.push(
          fileToBase64(p.file).then(function (b64) {
            actions.push({ filePath: "public/" + filePath, base64: b64 });
            entry.images = entry.images || [];
            entry.images.push(filePath);
          })
        );
      });
      entry._pending = [];
    }

    state.changelog.forEach(function (entry) { queueImages(entry, "changelog"); });
    state.aiSkills.forEach(function (entry) { queueImages(entry, "aiskill"); });

    var profilePhotoPromise = Promise.resolve();
    if (pendingProfilePhoto) {
      profilePhotoPromise = fileToBase64(pendingProfilePhoto).then(function (b64) {
        var filePath = "assets/img/profile/me." + extOf(pendingProfilePhoto.name);
        state.profile.photo = filePath;
        actions.push({ filePath: "public/" + filePath, base64: b64 });
      });
    }

    return Promise.all(imageChecks.concat([profilePhotoPromise])).then(function () {
      return actions;
    });
  }

  function buildContentJson() {
    function clean(entry) {
      var copy = {};
      Object.keys(entry).forEach(function (k) {
        if (k === "_pending" || k === "id") return;
        copy[k] = entry[k];
      });
      return copy;
    }
    return JSON.stringify({
      profile: state.profile,
      about: state.about,
      changelog: state.changelog.map(clean),
      aiSkills: state.aiSkills.map(clean)
    }, null, 2);
  }

  function saveAll() {
    var s = getSettings();
    if (!s.project || !s.token) {
      setStatus("save-status", "GitHub 설정(저장소, 토큰)을 먼저 입력하고 저장하세요.", "err");
      return;
    }
    setStatus("save-status", "이미지 업로드 준비 중…");

    collectActions(s).then(function (actions) {
      var contentJson = buildContentJson();
      actions.push({ filePath: CONTENT_PATH, base64: utf8ToB64(contentJson) });
      setStatus("save-status", "커밋하는 중…");
      return commitFiles(s, actions, "portfolio: 콘텐츠 업데이트 (" + new Date().toISOString() + ")");
    }).then(function () {
      setStatus("save-status", "저장 완료. 약 1~2분 뒤 사이트에 반영됩니다.", "ok");
      renderChangelogEditor();
      renderSkillEditor();
    }).catch(function (err) {
      setStatus("save-status", "저장 실패: " + err.message + " — 아래 'content.json 복사' 버튼으로 내용을 복사해 직접 커밋할 수 있습니다.", "err");
    });
  }

  function copyJsonFallback() {
    var json = buildContentJson();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(function () {
        setStatus("save-status", "content.json 내용을 클립보드에 복사했습니다.", "ok");
      }).catch(function () {
        window.prompt("아래 내용을 복사하세요:", json);
      });
    } else {
      window.prompt("아래 내용을 복사하세요:", json);
    }
  }

  /* ---------------- init ---------------- */

  function init() {
    var saved = loadSettings();
    document.getElementById("set-project").value = saved.project || "";
    document.getElementById("set-branch").value = saved.branch || "main";
    document.getElementById("set-token").value = saved.token || "";

    if (state.changelog.length === 0) state.changelog.push(changelogEntryTemplate());
    if (state.aiSkills.length === 0) {
      var fspm = skillEntryTemplate();
      fspm.title = "FortiGate 정책 자동화 도구";
      state.aiSkills.push(fspm);
    }
    populateAllForms();

    document.getElementById("btn-save-settings").addEventListener("click", function () {
      var s = getSettings();
      saveSettingsToStorage(s);
      setStatus("settings-status", "설정을 저장했습니다.", "ok");
    });
    document.getElementById("btn-load-content").addEventListener("click", loadFromRepo);
    document.getElementById("btn-clear-token").addEventListener("click", function () {
      document.getElementById("set-token").value = "";
      var s = getSettings();
      s.token = "";
      saveSettingsToStorage(s);
      setStatus("settings-status", "토큰을 지웠습니다.", "ok");
    });
    document.getElementById("btn-add-changelog").addEventListener("click", function () {
      state.changelog.push(changelogEntryTemplate());
      renderChangelogEditor();
    });
    document.getElementById("btn-add-skill").addEventListener("click", function () {
      state.aiSkills.push(skillEntryTemplate());
      renderSkillEditor();
    });
    document.getElementById("profile-photo-input").addEventListener("change", function (e) {
      pendingProfilePhoto = e.target.files[0] || null;
    });
    document.getElementById("btn-save-all").addEventListener("click", saveAll);
    document.getElementById("btn-copy-json").addEventListener("click", copyJsonFallback);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
