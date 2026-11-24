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

    entries.forEach(function (entry, idx) {
      var li = el("li", { class: "changelog-entry reveal" });
      li.style.setProperty("--i", idx);

      var head = el("button", { class: "changelog-head", type: "button", "aria-expanded": "false" });
      var headLeft = el("div");

      var meta = el("div", { class: "changelog-meta" });
      if (hasText(entry.date)) meta.appendChild(text("span", "changelog-date", entry.date));
      if (hasText(entry.org)) meta.appendChild(text("span", "changelog-org", entry.org));
      headLeft.appendChild(meta);

      if (hasText(entry.title)) headLeft.appendChild(text("h3", "changelog-title", entry.title));

      var toggle = text("span", "changelog-toggle", "펼치기");

      head.appendChild(headLeft);
      head.appendChild(toggle);
      li.appendChild(head);

      var body = el("div", { class: "changelog-body" });

      if (hasText(entry.summary)) body.appendChild(text("p", "changelog-summary", entry.summary));

      if (entry.tags && entry.tags.length) {
        var tagWrap = el("div", { class: "changelog-tags" });
        entry.tags.forEach(function (t) { tagWrap.appendChild(text("span", "tag", t)); });
        body.appendChild(tagWrap);
      }

      var sections = (entry.sections || []).filter(function (s) {
        return s && ((s.images && s.images.length) || hasText(s.title));
      });

      if (sections.length) {
        sections.forEach(function (section) {
          if (hasText(section.title)) body.appendChild(text("h4", "content-section-title", section.title));
          if (section.images && section.images.length) {
            var sectionImgWrap = el("div", { class: "changelog-images" });
            section.images.forEach(function (src) {
              sectionImgWrap.appendChild(el("img", { src: src, alt: section.title || entry.title || "프로젝트 화면", loading: "lazy" }));
            });
            body.appendChild(sectionImgWrap);
          }
        });
      } else if (entry.images && entry.images.length) {
        // legacy flat image list (pre-sections data)
        var imgWrap = el("div", { class: "changelog-images" });
        entry.images.forEach(function (src) {
          imgWrap.appendChild(el("img", { src: src, alt: entry.title || "프로젝트 화면", loading: "lazy" }));
        });
        body.appendChild(imgWrap);
      }

      li.appendChild(body);

      head.addEventListener("click", function () {
        var open = !li.classList.contains("open");
        li.classList.toggle("open", open);
        head.setAttribute("aria-expanded", open ? "true" : "false");
        toggle.textContent = open ? "접기" : "펼치기";
        body.style.maxHeight = open ? body.scrollHeight + "px" : "0px";
      });

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
      var panel = el("div", { class: "skill-panel reveal" });
      panel.style.setProperty("--i", idx);
      var btn = el("button", { class: "skill-head", type: "button", "aria-expanded": "false" });

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

      var sections = (skill.sections || []).filter(function (s) {
        return s && ((s.images && s.images.length) || hasText(s.title));
      });

      if (sections.length) {
        sections.forEach(function (section) {
          if (hasText(section.title)) body.appendChild(text("h4", "content-section-title", section.title));
          if (section.images && section.images.length) {
            var sectionImgWrap = el("div", { class: "skill-images" });
            section.images.forEach(function (src) {
              sectionImgWrap.appendChild(el("img", { src: src, alt: section.title || skill.title, loading: "lazy" }));
            });
            body.appendChild(sectionImgWrap);
          }
        });
      } else {
        var imgWrap = el("div", { class: "skill-images" });
        if (skill.images && skill.images.length) {
          // legacy flat image list (pre-sections data)
          skill.images.forEach(function (src) {
            imgWrap.appendChild(el("img", { src: src, alt: skill.title, loading: "lazy" }));
          });
        } else {
          imgWrap.appendChild(el("img", { src: "assets/img/aiskill/placeholder.svg", alt: "화면 캡처 준비 중" }));
        }
        body.appendChild(imgWrap);
      }

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

  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (n) { n.classList.add("in-view"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in-view");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    items.forEach(function (n) { io.observe(n); });
  }

  function render(data) {
    renderProfile(data.profile);
    renderAbout(data.about);
    renderChangelog(data.changelog);
    renderSkills(data.aiSkills);
    renderFooter(data.about);
    initReveal();
  }

  function initTabs() {
    var links = document.querySelectorAll(".main-nav a");
    var blocks = document.querySelectorAll(".block");
    var animating = false;

    function showBlock(next, id) {
      for (var i = 0; i < blocks.length; i++) {
        blocks[i].classList.toggle("is-hidden", blocks[i] !== next);
      }
      for (var j = 0; j < links.length; j++) {
        links[j].classList.toggle("is-active", links[j].getAttribute("href") === "#" + id);
      }
      // skill/changelog panels measure scrollHeight on render; re-measure open
      // ones now that this block is no longer display:none (hidden blocks
      // measure 0).
      var openBodies = document.querySelectorAll(
        "#" + id + " .skill-panel.open .skill-body, #" + id + " .changelog-entry.open .changelog-body"
      );
      for (var m = 0; m < openBodies.length; m++) {
        openBodies[m].style.maxHeight = openBodies[m].scrollHeight + "px";
      }
    }

    function activate(id, animate) {
      if (animating) return;
      document.body.classList.toggle("is-about", id === "about");
      var next = document.getElementById(id);
      var current = document.querySelector(".block:not(.is-hidden)");

      if (!animate || !current || current === next) {
        showBlock(next, id);
        return;
      }

      animating = true;
      current.classList.add("is-folding-close");
      current.addEventListener("animationend", function onCloseEnd() {
        current.removeEventListener("animationend", onCloseEnd);
        current.classList.remove("is-folding-close");
        showBlock(next, id);
        next.classList.add("is-folding-open");
        next.addEventListener("animationend", function onOpenEnd() {
          next.removeEventListener("animationend", onOpenEnd);
          next.classList.remove("is-folding-open");
          animating = false;
        });
      });
    }

    for (var k = 0; k < links.length; k++) {
      links[k].addEventListener("click", function (e) {
        e.preventDefault();
        var id = this.getAttribute("href").slice(1);
        activate(id, true);
        history.replaceState(null, "", "#" + id);
      });
    }

    var initial = (location.hash || "#about").slice(1);
    if (!document.getElementById(initial)) initial = "about";
    activate(initial, false);
  }

  function initLightbox() {
    var lightbox = document.getElementById("lightbox");
    var lightboxImg = document.getElementById("lightbox-img");
    if (!lightbox || !lightboxImg) return;

    function close() {
      lightbox.classList.remove("is-open");
      lightbox.setAttribute("aria-hidden", "true");
      lightboxImg.src = "";
    }

    document.addEventListener("click", function (e) {
      var img = e.target.closest(".changelog-images img, .skill-images img");
      if (img) {
        lightboxImg.src = img.src;
        lightboxImg.alt = img.alt || "";
        lightbox.classList.add("is-open");
        lightbox.setAttribute("aria-hidden", "false");
        return;
      }
      if (e.target === lightbox || e.target.closest(".lightbox-close")) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
  }

  function initIntro() {
    var header = document.querySelector(".site-header");
    if (!header) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.body.classList.add("intro-done");
      return;
    }

    var rect = header.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    header.style.setProperty("--intro-dx", (cx - window.innerWidth / 2) + "px");
    header.style.setProperty("--intro-dy", (cy - window.innerHeight / 2) + "px");

    document.body.classList.add("intro-playing");

    setTimeout(function () {
      document.body.classList.add("intro-glide");
    }, 1500);

    setTimeout(function () {
      document.body.classList.remove("intro-playing", "intro-glide");
      document.body.classList.add("intro-done");
      header.style.removeProperty("--intro-dx");
      header.style.removeProperty("--intro-dy");
    }, 2600);
  }

  initIntro();
  initTabs();
  initLightbox();

  fetch("content/content.json", { cache: "no-store" })
    .then(function (res) { return res.json(); })
    .then(render)
    .catch(function (err) {
      console.error("콘텐츠를 불러오지 못했습니다.", err);
    });
})();
