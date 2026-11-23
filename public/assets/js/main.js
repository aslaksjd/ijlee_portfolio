(function () {
  "use strict";

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === "class") node.className = props[k];
        else if (k === "html") node.innerHTML = props[k];
        else node.setAttribute(k, props[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c) node.appendChild(c);
    });
    return node;
  }

  function text(tag, cls, str) {
    var node = el(tag, cls ? { class: cls } : null);
    node.textContent = str;
    return node;
  }

  function hasText(v) {
    return typeof v === "string" && v.trim().length > 0;
  }

  function renderProfile(p) {
    if (!p) return;
    if (hasText(p.role)) document.getElementById("profile-role").textContent = p.role;
    if (hasText(p.name)) {
      document.getElementById("profile-name").textContent = p.name;
      document.title = p.name + " — " + (p.role || "포트폴리오");
    }
    if (hasText(p.headline)) document.getElementById("profile-headline").textContent = p.headline;
    if (hasText(p.subhead)) document.getElementById("profile-subhead").textContent = p.subhead;

    var img = document.getElementById("profile-photo");
    var primary = p.photo || "assets/img/profile/me.jpg";
    var fallback = p.photoFallback || "assets/img/profile/placeholder.svg";
    img.src = primary;
    img.onerror = function () {
      img.onerror = null;
      img.src = fallback;
    };
  }

  var ABOUT_FIELDS = [
    ["name", "이름"],
    ["birth", "생년월일"],
    ["address", "주소"],
    ["email", "이메일"],
    ["education", "학력"],
    ["company", "회사"],
    ["bio", "한 줄 이력"]
  ];

  function renderAbout(about) {
    var sheet = document.getElementById("about-sheet");
    sheet.innerHTML = "";
    about = about || {};

    var any = ABOUT_FIELDS.some(function (f) { return hasText(about[f[0]]); });
    if (!any) {
      sheet.appendChild(el("div", { class: "changelog-empty", style: "grid-column: 1 / -1;" }, [
        text("span", null, "아직 입력된 소개가 없습니다. 관리자 패널에서 채워 보세요.")
      ]));
      return;
    }

    ABOUT_FIELDS.forEach(function (f) {
      var key = f[0], label = f[1];
      var value = about[key];
      sheet.appendChild(text("dt", null, label));
      if (hasText(value)) {
        sheet.appendChild(text("dd", null, value));
      } else {
        sheet.appendChild(el("dd", { class: "empty" }, [text("span", null, "—")]));
      }
    });
  }

  function renderChangelog(entries) {
    var list = document.getElementById("changelog-list");
    list.innerHTML = "";
    entries = (entries || []).filter(function (e) {
      return e && (hasText(e.title) || hasText(e.summary));
    });

    if (entries.length === 0) {
      list.appendChild(el("li", { class: "changelog-empty" }, [
        text("span", null, "아직 기록된 경력이 없습니다. 관리자 패널에서 첫 항목을 추가해 보세요.")
      ]));
      return;
    }

    entries.forEach(function (entry) {
      var li = el("li", { class: "changelog-entry" });

      var meta = el("div", { class: "changelog-meta" });
      if (hasText(entry.date)) meta.appendChild(text("span", "changelog-date", entry.date));
      if (hasText(entry.org)) meta.appendChild(text("span", "changelog-org", entry.org));
      li.appendChild(meta);

      if (hasText(entry.title)) li.appendChild(text("h3", "changelog-title", entry.title));
      if (hasText(entry.summary)) li.appendChild(text("p", "changelog-summary", entry.summary));

      if (entry.tags && entry.tags.length) {
        var tagWrap = el("div", { class: "changelog-tags" });
        entry.tags.forEach(function (t) { tagWrap.appendChild(text("span", "tag", t)); });
        li.appendChild(tagWrap);
      }

      if (entry.images && entry.images.length) {
        var imgWrap = el("div", { class: "changelog-images" });
        entry.images.forEach(function (src) {
          imgWrap.appendChild(el("img", { src: src, alt: entry.title || "프로젝트 화면", loading: "lazy" }));
        });
        li.appendChild(imgWrap);
      }

      list.appendChild(li);
    });
  }

  function renderSkills(skills) {
    var wrap = document.getElementById("skill-list");
    wrap.innerHTML = "";
    skills = (skills || []).filter(function (s) { return s && hasText(s.title); });

    if (skills.length === 0) {
      wrap.appendChild(el("div", { class: "skill-empty" }, [
        text("span", null, "아직 등록된 AI 도구가 없습니다. 관리자 패널에서 추가해 보세요.")
      ]));
      return;
    }

    skills.forEach(function (skill, idx) {
      var panel = el("div", { class: "skill-panel" + (idx === 0 ? " open" : "") });
      var btn = el("button", { class: "skill-head", type: "button", "aria-expanded": idx === 0 ? "true" : "false" });

      var left = el("div");
      left.appendChild(text("h3", "skill-title", skill.title));
      if (hasText(skill.summary)) left.appendChild(text("p", "skill-summary", skill.summary));

      var toggle = text("span", "skill-toggle", panel.classList.contains("open") ? "접기" : "펼치기");

      btn.appendChild(left);
      btn.appendChild(toggle);
      panel.appendChild(btn);

      if (skill.tags && skill.tags.length) {
        var tagWrap = el("div", { class: "skill-tags" });
        skill.tags.forEach(function (t) { tagWrap.appendChild(text("span", "tag", t)); });
        panel.appendChild(tagWrap);
      }

      var body = el("div", { class: "skill-body" });

      if (skill.modules && skill.modules.length) {
        var modList = el("ul", { class: "skill-modules" });
        skill.modules.forEach(function (m) { modList.appendChild(el("li", null, [document.createTextNode(m)])); });
        body.appendChild(modList);
      }

      if (hasText(skill.description)) {
        body.appendChild(text("p", "skill-description", skill.description));
      }

      var imgWrap = el("div", { class: "skill-images" });
      if (skill.images && skill.images.length) {
        skill.images.forEach(function (src) {
          imgWrap.appendChild(el("img", { src: src, alt: skill.title, loading: "lazy" }));
        });
      } else {
        imgWrap.appendChild(el("img", { src: "assets/img/aiskill/placeholder.svg", alt: "화면 캡처 준비 중" }));
      }
      body.appendChild(imgWrap);

      panel.appendChild(body);

      function setOpen(open) {
        panel.classList.toggle("open", open);
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        toggle.textContent = open ? "접기" : "펼치기";
        body.style.maxHeight = open ? body.scrollHeight + "px" : "0px";
      }

      btn.addEventListener("click", function () {
        setOpen(!panel.classList.contains("open"));
      });

      // set initial measured height after insertion
      requestAnimationFrame(function () {
        if (panel.classList.contains("open")) body.style.maxHeight = body.scrollHeight + "px";
      });

      wrap.appendChild(panel);
    });
  }

  function renderFooter(about) {
    var wrap = document.getElementById("footer-email-wrap");
    if (about && hasText(about.email)) {
      var link = el("a", { href: "mailto:" + about.email });
      link.textContent = about.email;
      wrap.appendChild(link);
    } else {
      wrap.textContent = "";
    }
  }

  function render(data) {
    renderProfile(data.profile);
    renderAbout(data.about);
    renderChangelog(data.changelog);
    renderSkills(data.aiSkills);
    renderFooter(data.about);
  }

  function initTabs() {
    var links = document.querySelectorAll(".main-nav a");
    var blocks = document.querySelectorAll(".block");

    function activate(id) {
      document.body.classList.toggle("is-about", id === "about");
      for (var i = 0; i < blocks.length; i++) {
        blocks[i].classList.toggle("is-hidden", blocks[i].id !== id);
      }
      for (var j = 0; j < links.length; j++) {
        links[j].classList.toggle("is-active", links[j].getAttribute("href") === "#" + id);
      }
      // skill panels measure scrollHeight on render; re-measure open ones now
      // that this block is no longer display:none (hidden blocks measure 0).
      var openBodies = document.querySelectorAll("#" + id + " .skill-panel.open .skill-body");
      for (var m = 0; m < openBodies.length; m++) {
        openBodies[m].style.maxHeight = openBodies[m].scrollHeight + "px";
      }
    }

    for (var k = 0; k < links.length; k++) {
      links[k].addEventListener("click", function (e) {
        e.preventDefault();
        var id = this.getAttribute("href").slice(1);
        activate(id);
        history.replaceState(null, "", "#" + id);
      });
    }

    var initial = (location.hash || "#about").slice(1);
    if (!document.getElementById(initial)) initial = "about";
    activate(initial);
  }

  initTabs();

  fetch("content/content.json", { cache: "no-store" })
    .then(function (res) { return res.json(); })
    .then(render)
    .catch(function (err) {
      console.error("콘텐츠를 불러오지 못했습니다.", err);
    });
})();
