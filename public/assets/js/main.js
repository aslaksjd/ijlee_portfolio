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
    ["email", "이메일"]
  ];

  function joinText(parts, sep) {
    return parts.filter(hasText).join(sep);
  }

  // each row → { period, title, sub, meta } for the timeline list
  var ABOUT_LISTS = [
    ["education", "학력", function (r) {
      return {
        period: joinText([r.start, r.end], " — "),
        title: r.school,
        sub: r.type,
        meta: joinText([r.major, r.status, r.location], " · ")
      };
    }],
    ["career", "경력", function (r) {
      return {
        period: joinText([r.start, r.end], " — "),
        title: r.company,
        dept: r.dept,
        sub: r.position,
        meta: r.role,
        detail: r.detail
      };
    }]
  ];

  // "2023.08.08" / "2023.08" / "2023-08-08" → Date; a month-only end date means the last day of that month
  function parseYMD(s, isEnd) {
    var m = /^(\d{4})[.\-\/](\d{1,2})(?:[.\-\/](\d{1,2}))?/.exec(hasText(s) ? s.trim() : "");
    if (!m) return null;
    var day = m[3] ? +m[3] : (isEnd ? new Date(+m[1], +m[2], 0).getDate() : 1);
    return new Date(+m[1], +m[2] - 1, day);
  }

  // whole months + leftover days from a (inclusive) to b (exclusive)
  function monthsAndDays(a, b) {
    var months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
    var days = b.getDate() - a.getDate();
    if (days < 0) {
      months -= 1;
      days += new Date(b.getFullYear(), b.getMonth(), 0).getDate();
    }
    return { months: months, days: days };
  }

  // total career length across rows; overlapping periods are counted once, an unparseable end means "still working"
  function careerTenure(rows, now) {
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var spans = [];
    rows.forEach(function (r) {
      var s = parseYMD(r.start, false);
      if (!s) return;
      var e = parseYMD(r.end, true) || today;
      e = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1);
      if (e > s) spans.push([s, e]);
    });
    spans.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [];
    spans.forEach(function (sp) {
      var last = merged[merged.length - 1];
      if (last && sp[0] <= last[1]) { if (sp[1] > last[1]) last[1] = sp[1]; }
      else merged.push([sp[0], sp[1]]);
    });
    var months = 0, days = 0;
    merged.forEach(function (sp) {
      var md = monthsAndDays(sp[0], sp[1]);
      months += md.months;
      days += md.days;
    });
    months += Math.floor(days / 30);
    if (!merged.length) return null;
    return { years: Math.floor(months / 12), months: months % 12 };
  }

  // tiny, DOM-built markup (no innerHTML): "# 큰 제목", "## 소제목", "- 목록", "**굵게**", blank line = new paragraph
  function inlineRich(parent, str) {
    str.split(/\*\*(.+?)\*\*/).forEach(function (part, i) {
      if (!part) return;
      parent.appendChild(i % 2 ? text("strong", null, part) : document.createTextNode(part));
    });
  }

  function renderRich(str) {
    var root = el("div", { class: "rich" });
    var ul = null, para = null;
    String(str).split(/\r?\n/).forEach(function (raw) {
      var line = raw.replace(/\s+$/, "");
      var m;
      if (!line.trim()) { ul = null; para = null; return; }
      if ((m = /^##\s+(.*)$/.exec(line))) {
        ul = para = null;
        var h2 = el("h5", { class: "rich-h2" }); inlineRich(h2, m[1]); root.appendChild(h2);
      } else if ((m = /^#\s+(.*)$/.exec(line))) {
        ul = para = null;
        var h1 = el("h5", { class: "rich-h1" }); inlineRich(h1, m[1]); root.appendChild(h1);
      } else if ((m = /^[-*]\s+(.*)$/.exec(line))) {
        para = null;
        if (!ul) { ul = el("ul"); root.appendChild(ul); }
        var li = el("li"); inlineRich(li, m[1]); ul.appendChild(li);
      } else {
        ul = null;
        if (!para) { para = el("p"); root.appendChild(para); }
        else para.appendChild(el("br"));
        inlineRich(para, line);
      }
    });
    return root;
  }

  var detailSeq = 0;
  function buildDetailToggle(detail) {
    var id = "career-detail-" + (++detailSeq);
    var btn = el("button", { class: "spec-toggle", type: "button", "aria-expanded": "false", "aria-controls": id });
    btn.appendChild(text("span", null, "세부 경력"));
    btn.appendChild(el("span", { class: "spec-toggle-chev", "aria-hidden": "true" }));
    var panel = el("div", { class: "spec-detail", id: id }, [
      el("div", { class: "spec-detail-clip" }, [
        el("div", { class: "spec-detail-body" }, [renderRich(detail)])
      ])
    ]);
    btn.addEventListener("click", function () {
      var open = panel.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    return { btn: btn, panel: panel };
  }

  // oldest first; "2016.03" < "2016.03.05" < "2016.04" compare correctly as plain strings,
  // rows without a start date go last
  function byStart(a, b) {
    var x = hasText(a.start) ? a.start.trim() : "￿";
    var y = hasText(b.start) ? b.start.trim() : "￿";
    return x < y ? -1 : x > y ? 1 : 0;
  }

  function rowsOf(value) {
    if (Array.isArray(value)) {
      return value
        .filter(function (r) { return r && Object.keys(r).some(function (k) { return hasText(r[k]); }); })
        .sort(byStart);
    }
    return hasText(value) ? value : []; // legacy plain-text value
  }

  function renderAbout(about) {
    var sheet = document.getElementById("about-sheet");
    sheet.innerHTML = "";
    about = about || {};

    var any = ABOUT_FIELDS.some(function (f) { return hasText(about[f[0]]); }) ||
      ABOUT_LISTS.some(function (l) { return rowsOf(about[l[0]]).length > 0; });
    if (!any) {
      sheet.appendChild(el("div", { class: "changelog-empty", style: "grid-column: 1 / -1;" }, [
        text("span", null, "아직 입력된 소개가 없습니다. 관리자 패널에서 채워 보세요.")
      ]));
      return;
    }

    function emptyDd() {
      return el("dd", { class: "empty" }, [text("span", null, "—")]);
    }

    ABOUT_FIELDS.forEach(function (f) {
      var value = about[f[0]];
      sheet.appendChild(text("dt", null, f[1]));
      sheet.appendChild(hasText(value) ? text("dd", null, value) : emptyDd());
    });

    ABOUT_LISTS.forEach(function (l, i) {
      var rows = rowsOf(about[l[0]]);
      if (i > 0) sheet.appendChild(el("div", { class: "spec-divider", "aria-hidden": "true" }));
      var dt = text("dt", null, l[1]);
      if (l[0] === "career" && Array.isArray(rows)) {
        var tenure = careerTenure(rows, new Date());
        if (tenure) {
          dt.appendChild(text("span", "spec-tenure", tenure.years + "년차"));
          dt.appendChild(text("span", "spec-tenure-sub",
            tenure.years + "년" + (tenure.months ? " " + tenure.months + "개월" : "")));
        }
      }
      sheet.appendChild(dt);
      if (typeof rows === "string") {
        sheet.appendChild(text("dd", null, rows));
        return;
      }
      if (!rows.length) {
        sheet.appendChild(emptyDd());
        return;
      }
      var list = el("ol", { class: "spec-list" });
      rows.forEach(function (r) {
        var v = l[2](r);
        var title = text("span", "spec-item-title", v.title || "");
        if (hasText(v.dept)) title.appendChild(text("span", "spec-dept", v.dept));
        if (hasText(v.sub)) title.appendChild(text("span", "spec-sub", v.sub));
        var toggle = hasText(v.detail) ? buildDetailToggle(v.detail) : null;
        var main = el("div", { class: "spec-main" }, [
          hasText(v.period) ? text("span", "spec-period", v.period) : null,
          title,
          hasText(v.meta) ? text("span", "spec-meta", v.meta) : null
        ]);
        list.appendChild(el("li", null, [
          el("div", { class: "spec-row" }, [main, toggle && toggle.btn]),
          toggle && toggle.panel
        ]));
      });
      sheet.appendChild(el("dd", null, [list]));
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
      window.dispatchEvent(new Event("scroll")); // re-evaluate nav stuck state now the header is back in flow
    }, 2600);
  }

  function initNavStuck() {
    var nav = document.querySelector(".main-nav");
    if (!nav) return;
    function update() {
      nav.classList.toggle("is-stuck", nav.getBoundingClientRect().top <= 0);
    }
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  function initBackground() {
    var canvas = document.getElementById("bg-net");
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var LINK = 150;
    var w, h, raf;

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    var nodes = [];
    var count = Math.min(90, Math.round((w * h) / 16000));
    for (var i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.4 + 0.6
      });
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < nodes.length; i++) {
        var a = nodes[i];
        for (var j = i + 1; j < nodes.length; j++) {
          var b = nodes[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          var d2 = dx * dx + dy * dy;
          if (d2 < LINK * LINK) {
            ctx.strokeStyle = "rgba(255, 153, 0, " + (1 - Math.sqrt(d2) / LINK) * 0.16 + ")";
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      ctx.fillStyle = "rgba(255, 186, 102, 0.45)";
      nodes.forEach(function (n) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    function step() {
      nodes.forEach(function (n) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      });
      draw();
      raf = requestAnimationFrame(step);
    }

    window.addEventListener("resize", function () {
      resize();
      if (reduce) draw();
    });

    if (reduce) {
      draw();
      return;
    }
    raf = requestAnimationFrame(step);
    document.addEventListener("visibilitychange", function () {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(step);
    });
  }

  initBackground();
  initIntro();
  initNavStuck();
  initTabs();
  initLightbox();

  fetch("content/content.json", { cache: "no-store" })
    .then(function (res) { return res.json(); })
    .then(render)
    .catch(function (err) {
      console.error("콘텐츠를 불러오지 못했습니다.", err);
    });
})();
