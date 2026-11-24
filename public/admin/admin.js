(function () {
  "use strict";

  var SETTINGS_KEY = "portfolio_admin_settings_v1";
  var CONTENT_PATH = "public/content/content.json";

  var state = {
    profile: { name: "", role: "", headline: "", subhead: "", photo: "assets/img/profile/me.jpg", photoFallback: "assets/img/profile/placeholder.svg" },
    about: { name: "", birth: "", address: "", email: "", education: [], career: [] },
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

  /* ---------------- about: education / career rows ---------------- */

  // [key, label, placeholder, wide?, kind?]   kind: "full" = whole row, "rich" = whole row + formatting textarea
  var EDUCATION_FIELDS = [
    ["type", "구분", "대학교(학사)"],
    ["start", "입학년월", "2016.03"],
    ["end", "졸업년월", "2022.07"],
    ["school", "학교명", "", true],
    ["major", "전공", "정보보호학 학사"],
    ["status", "졸업구분", "졸업"],
    ["location", "소재지", "서울"]
  ];
  var CAREER_FIELDS = [
    ["start", "입사", "2023.08"],
    ["end", "퇴사", "재직 중"],
    ["position", "직위", "선임"],
    ["company", "회사명", "", true],
    ["dept", "부서", "서비스보안운영팀"],
    ["role", "직무 (한 줄 요약)", "인프라보안 운영 (보안, 네트워크, 서버, Cloud)", false, "full"],
    ["detail", "세부 경력 (사이트에서 '세부 경력' 접기/열기로 표시)", "담당 업무, 성과 등을 경력기술서처럼 자세히 적어주세요.", false, "rich"]
  ];

  // wrap the selection / prefix the selected lines so the markup stays plain text in content.json
  function applyRichFormat(ta, kind) {
    var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    if (kind === "bold") {
      var sel = v.slice(s, e);
      var wrapped = /^\*\*[\s\S]*\*\*$/.test(sel) && sel.length >= 4 ? sel.slice(2, -2) : "**" + (sel || "굵게") + "**";
      ta.value = v.slice(0, s) + wrapped + v.slice(e);
      ta.setSelectionRange(s, s + wrapped.length);
    } else {
      var prefix = { h1: "# ", h2: "## ", ul: "- " }[kind];
      var from = v.lastIndexOf("\n", s - 1) + 1;
      var to = v.indexOf("\n", e);
      if (to < 0) to = v.length;
      var lines = v.slice(from, to).split("\n");
      var allHave = lines.every(function (l) { return l.indexOf(prefix) === 0; });
      var out = lines.map(function (l) {
        var bare = l.replace(/^(#{1,2}\s+|[-*]\s+)/, "");
        return allHave ? bare : prefix + bare;
      }).join("\n");
      ta.value = v.slice(0, from) + out + v.slice(to);
      ta.setSelectionRange(from, from + out.length);
    }
    ta.focus();
    ta.dispatchEvent(new Event("input"));
  }

  function buildRichField(row, f) {
    var wrap = document.createElement("div");
    wrap.className = "span-2 span-full rich-field";
    var cap = document.createElement("span");
    cap.className = "rich-caption";
    cap.textContent = f[1];
    wrap.appendChild(cap);

    var bar = document.createElement("div");
    bar.className = "rich-toolbar";
    var ta = document.createElement("textarea");
    ta.rows = 7;
    ta.placeholder = f[2];
    ta.value = row[f[0]] || "";
    ta.addEventListener("input", function () { row[f[0]] = ta.value; });
    [["B", "bold", "굵게"], ["제목", "h1", "큰 글씨 제목"], ["소제목", "h2", "작은 제목"], ["• 목록", "ul", "글머리 목록"]].forEach(function (b) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-sm btn-ghost";
      btn.textContent = b[0];
      btn.title = b[2];
      if (b[1] === "bold") btn.style.fontWeight = "700";
      btn.addEventListener("click", function () { applyRichFormat(ta, b[1]); });
      bar.appendChild(btn);
    });
    wrap.appendChild(bar);
    wrap.appendChild(ta);

    var hint = document.createElement("p");
    hint.className = "admin-hint";
    hint.textContent = "서식: **굵게** · 줄 맨 앞 '# ' 큰 제목 · '## ' 소제목 · '- ' 목록 · 빈 줄은 문단 구분. 버튼으로 선택한 글/줄에 적용할 수 있습니다.";
    wrap.appendChild(hint);
    return wrap;
  }

  function renderRowEditor(rootId, list, fields) {
    var root = document.getElementById(rootId);
    root.innerHTML = "";
    list.forEach(function (row, idx) {
      var card = document.createElement("div");
      card.className = "row-card";
      var grid = document.createElement("div");
      grid.className = "admin-grid";
      fields.forEach(function (f) {
        if (f[4] === "rich") {
          grid.appendChild(buildRichField(row, f));
          return;
        }
        var label = document.createElement("label");
        if (f[4] === "full") label.className = "span-full";
        else if (f[3]) label.className = "span-wide";
        label.textContent = f[1] + " ";
        var input = document.createElement("input");
        input.type = "text";
        input.placeholder = f[2] ? "예) " + f[2] : "";
        input.value = row[f[0]] || "";
        input.addEventListener("input", function () { row[f[0]] = input.value; });
        label.appendChild(input);
        grid.appendChild(label);
      });
      card.appendChild(grid);

      var foot = document.createElement("div");
      foot.className = "row-card-foot";
      function btn(label, cls, onClick) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn-sm " + cls;
        b.textContent = label;
        b.addEventListener("click", onClick);
        foot.appendChild(b);
      }
      btn("삭제", "btn-danger", function () {
        list.splice(idx, 1);
        renderRowEditor(rootId, list, fields);
      });
      card.appendChild(foot);
      root.appendChild(card);
    });
  }

  function renderAboutLists() {
    renderRowEditor("education-editor", state.about.education, EDUCATION_FIELDS);
    renderRowEditor("career-editor", state.about.career, CAREER_FIELDS);
  }

  // older content.json stored education/company as one string and had a `bio` line
  function normalizeAbout(a) {
    function toRows(v, key) {
      if (Array.isArray(v)) return v;
      if (typeof v === "string" && v.trim()) { var r = {}; r[key] = v.trim(); return [r]; }
      return [];
    }
    a.education = toRows(a.education, "school");
    a.career = toRows(a.career !== undefined ? a.career : a.company, "company");
    delete a.company;
    delete a.bio;
    return a;
  }

  /* ---------------- changelog editor ---------------- */

  function sectionTemplate() {
    return { id: nextId("sec"), title: "", images: [], _pending: [] };
  }

  function changelogEntryTemplate() {
    return { id: nextId("cl"), date: "", title: "", org: "", summary: "", tags: [], sections: [sectionTemplate()] };
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
      '<label class="span-2">태그 (쉼표로 구분) <input data-f="tags" type="text" placeholder="FortiGate, 자동화"></label>';
    card.appendChild(grid);

    ["date", "org", "title"].forEach(function (f) {
      var input = grid.querySelector('[data-f="' + f + '"]');
      input.value = entry[f] || "";
      input.addEventListener("input", function () { entry[f] = input.value; });
    });
    var tagsInput = grid.querySelector('[data-f="tags"]');
    grid.insertBefore(buildRichField(entry, ["summary", "설명", "프로젝트 설명을 자유롭게 적어주세요."]), tagsInput.parentNode);
    tagsInput.value = (entry.tags || []).join(", ");
    tagsInput.addEventListener("input", function () {
      entry.tags = tagsInput.value.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
    });

    var sectionsWrap = document.createElement("div");
    sectionsWrap.className = "entry-sections";
    card.appendChild(sectionsWrap);

    var addSectionBtn = document.createElement("button");
    addSectionBtn.type = "button";
    addSectionBtn.className = "btn btn-ghost";
    addSectionBtn.textContent = "+ 섹션(메뉴) 추가";
    addSectionBtn.addEventListener("click", function () {
      entry.sections = entry.sections || [];
      entry.sections.push(sectionTemplate());
      renderSections();
    });

    function renderSections() {
      sectionsWrap.innerHTML = "";
      entry.sections = entry.sections || [];
      entry.sections.forEach(function (section) {
        sectionsWrap.appendChild(buildSectionBlock(entry, section, renderSections));
      });
      sectionsWrap.appendChild(addSectionBtn);
    }
    renderSections();

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

  function buildSectionBlock(entry, section, rerenderSections) {
    var box = document.createElement("div");
    box.className = "section-card";

    var titleField = document.createElement("label");
    titleField.className = "field-block";
    titleField.innerHTML = '섹션 제목 (예: 1. 대시보드 / 정책 조회) <input type="text">';
    var titleInput = titleField.querySelector("input");
    titleInput.value = section.title || "";
    titleInput.addEventListener("input", function () { section.title = titleInput.value; });
    box.appendChild(titleField);

    var thumbs = document.createElement("div");
    thumbs.className = "entry-thumbs";
    box.appendChild(thumbs);

    function renderThumbs() {
      thumbs.innerHTML = "";
      (section.images || []).forEach(function (path, i) {
        var img = document.createElement("img");
        img.src = "../" + path;
        img.alt = "";
        img.title = "클릭하여 제거";
        img.addEventListener("click", function () {
          section.images.splice(i, 1);
          renderThumbs();
        });
        thumbs.appendChild(img);
      });
      (section._pending || []).forEach(function (p, i) {
        var img = document.createElement("img");
        img.src = p.previewUrl;
        img.title = "업로드 예정 (클릭하여 취소)";
        img.style.outline = "1px dashed var(--flag)";
        img.addEventListener("click", function () {
          section._pending.splice(i, 1);
          renderThumbs();
        });
        thumbs.appendChild(img);
      });
    }
    renderThumbs();

    var fileField = document.createElement("label");
    fileField.className = "field-block";
    fileField.innerHTML = '이미지 추가 <input type="file" accept="image/*" multiple>';
    var fileInput = fileField.querySelector("input");
    fileInput.addEventListener("change", function () {
      section._pending = section._pending || [];
      Array.prototype.forEach.call(fileInput.files, function (file) {
        section._pending.push({ file: file, previewUrl: URL.createObjectURL(file) });
      });
      fileInput.value = "";
      renderThumbs();
    });
    box.appendChild(fileField);

    var sectionFoot = document.createElement("div");
    sectionFoot.className = "section-card-foot";
    var removeSectionBtn = document.createElement("button");
    removeSectionBtn.type = "button";
    removeSectionBtn.className = "btn btn-danger btn-sm";
    removeSectionBtn.textContent = "섹션 삭제";
    removeSectionBtn.addEventListener("click", function () {
      var idx = entry.sections.indexOf(section);
      if (idx >= 0) entry.sections.splice(idx, 1);
      rerenderSections();
    });
    sectionFoot.appendChild(removeSectionBtn);
    box.appendChild(sectionFoot);

    return box;
  }

  /* ---------------- ai skill editor ---------------- */

  function skillEntryTemplate() {
    return { id: nextId("skill"), title: "", summary: "", description: "", modules: [], tags: [], sections: [sectionTemplate()] };
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
      '<label class="span-2">구성 모듈 (줄바꿈으로 구분) <textarea data-f="modules" rows="3"></textarea></label>' +
      '<label class="span-2">태그 (쉼표로 구분) <input data-f="tags" type="text"></label>';
    card.appendChild(grid);

    ["title", "summary"].forEach(function (f) {
      var input = grid.querySelector('[data-f="' + f + '"]');
      input.value = entry[f] || "";
      input.addEventListener("input", function () { entry[f] = input.value; });
    });
    var modulesInput = grid.querySelector('[data-f="modules"]');
    grid.insertBefore(buildRichField(entry, ["description", "상세 설명", "제작 배경, 구성, 효과 등을 자유롭게 적어주세요."]), modulesInput.parentNode);
    modulesInput.value = (entry.modules || []).join("\n");
    modulesInput.addEventListener("input", function () {
      entry.modules = modulesInput.value.split("\n").map(function (m) { return m.trim(); }).filter(Boolean);
    });
    var tagsInput = grid.querySelector('[data-f="tags"]');
    tagsInput.value = (entry.tags || []).join(", ");
    tagsInput.addEventListener("input", function () {
      entry.tags = tagsInput.value.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
    });

    card.appendChild(makeHint("업로드 전에 IP, 사내 시스템명 등 민감정보가 찍혀 있지 않은지 직접 확인하세요."));

    var sectionsWrap = document.createElement("div");
    sectionsWrap.className = "entry-sections";
    card.appendChild(sectionsWrap);

    var addSectionBtn = document.createElement("button");
    addSectionBtn.type = "button";
    addSectionBtn.className = "btn btn-ghost";
    addSectionBtn.textContent = "+ 섹션(메뉴) 추가";
    addSectionBtn.addEventListener("click", function () {
      entry.sections = entry.sections || [];
      entry.sections.push(sectionTemplate());
      renderSections();
    });

    function renderSections() {
      sectionsWrap.innerHTML = "";
      entry.sections = entry.sections || [];
      entry.sections.forEach(function (section) {
        sectionsWrap.appendChild(buildSectionBlock(entry, section, renderSections));
      });
      sectionsWrap.appendChild(addSectionBtn);
    }
    renderSections();

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
    renderAboutLists();
    bindSimpleForm("profile-form", state.profile);
    renderChangelogEditor();
    renderSkillEditor();
  }

  // migrate an entry (changelog or aiSkill) to the sections-based image format,
  // folding any legacy flat `images` array into one unnamed section
  function migrateToSections(e, idPrefix) {
    var entry = Object.assign({ id: nextId(idPrefix), tags: [] }, e);
    if (entry.sections && entry.sections.length) {
      entry.sections = entry.sections.map(function (sec) {
        return Object.assign({ id: nextId("sec"), images: [], _pending: [] }, sec);
      });
    } else if (entry.images && entry.images.length) {
      entry.sections = [{ id: nextId("sec"), title: "", images: entry.images.slice(), _pending: [] }];
    } else {
      entry.sections = [sectionTemplate()];
    }
    delete entry.images;
    return entry;
  }

  var contentLoaded = false;

  function applyContent(data) {
    state.profile = Object.assign(state.profile, data.profile || {});
    state.about = normalizeAbout(Object.assign(state.about, data.about || {}));
    state.changelog = (data.changelog || []).map(function (e) { return migrateToSections(e, "cl"); });
    state.aiSkills = (data.aiSkills || []).map(function (e) {
      var entry = migrateToSections(e, "skill");
      entry.modules = entry.modules || [];
      return entry;
    });
    contentLoaded = true;
    populateAllForms();
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
        applyContent(JSON.parse(text));
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

    function queueSectionImages(entry, baseDir) {
      var entrySlug = slugify(entry.title, entry.id);
      (entry.sections || []).forEach(function (section, si) {
        var sectionSlug = slugify(section.title, "section-" + si);
        (section._pending || []).forEach(function (p, i) {
          var filePath = "assets/img/" + baseDir + "/" + entrySlug + "/" + sectionSlug + "/" + Date.now().toString(36) + "-" + i + "." + extOf(p.file.name);
          imageChecks.push(
            fileToBase64(p.file).then(function (b64) {
              actions.push({ filePath: "public/" + filePath, base64: b64 });
              section.images = section.images || [];
              section.images.push(filePath);
            })
          );
        });
        section._pending = [];
      });
    }

    state.changelog.forEach(function (entry) { queueSectionImages(entry, "changelog"); });
    state.aiSkills.forEach(function (entry) { queueSectionImages(entry, "aiskill"); });

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
        if (k === "sections") {
          copy.sections = (entry.sections || []).map(clean);
          return;
        }
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
    if (!contentLoaded) {
      setStatus("save-status", "기존 내용을 아직 불러오지 못했습니다. 저장하면 기존 내용이 지워지므로, 위의 '저장소에서 불러오기'를 먼저 누르세요.", "err");
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

    populateAllForms();

    // the deployed content.json is public and same-origin, so no token is needed to read it
    fetch("../content/content.json", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .then(function (data) {
        applyContent(data);
        setStatus("settings-status", "현재 사이트의 내용을 불러왔습니다.", "ok");
      })
      .catch(function () {
        setStatus("settings-status", "현재 내용을 자동으로 불러오지 못했습니다. '저장소에서 불러오기'를 눌러주세요.", "err");
      });

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
    document.getElementById("btn-add-education").addEventListener("click", function () {
      state.about.education.push({});
      renderAboutLists();
    });
    document.getElementById("btn-add-career").addEventListener("click", function () {
      state.about.career.push({});
      renderAboutLists();
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
