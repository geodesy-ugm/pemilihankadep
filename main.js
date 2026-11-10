/* =====================================================================
   Pemilihan Kadep DTGD — main.js
   - Halaman pemilih (tanpa login, 1 suara per putaran per browser)
   - Panel admin (kelola putaran, hasil live, penetapan & tahap opsional)
   - Backend: Google Apps Script + Spreadsheet (lihat apps-script/Code.gs)
     atau MODE DEMO (localStorage) bila CONFIG.API_URL kosong.
   ===================================================================== */
(() => {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Konfigurasi & konstanta                                             */
  /* ------------------------------------------------------------------ */
  const CFG = window.APP_CONFIG || {};
  const DEMO = !CFG.API_URL;
  const MEDIA = CFG.MEDIA_DIR || "media/";
  const DOSEN = CFG.CANDIDATES || [];
  const DOSEN_MAP = new Map(DOSEN.map((d) => [d.id, d]));
  const VOTER_MS = CFG.REFRESH_VOTER_MS || 10000;
  const ADMIN_MS = CFG.REFRESH_ADMIN_MS || 5000;

  const STAGES = {
    tahap1: { label: "Tahap 1", name: "Tahap 1 — Penjaringan 3 Besar", position: "Ketua Departemen", seats: 3 },
    tahap2: { label: "Tahap 2", name: "Tahap 2 — Pemilihan Ketua Departemen", position: "Ketua Departemen", seats: 1 },
    opsA:   { label: "Opsional A", name: "Opsional A — Pemilihan Sekretaris Departemen", position: "Sekretaris Departemen", seats: 1 },
    opsC:   { label: "Opsional C", name: "Opsional C — Pemilihan Kaprodi Magister/Doktor", position: "Ketua Program Studi Magister/Doktor", seats: 1 },
    opsD:   { label: "Opsional D", name: "Opsional D — Pemilihan Koordinator KBK", position: "Koordinator KBK Teknik Geoinformatika", seats: 1 },
    lain:   { label: "Putaran", name: "Putaran Tambahan", position: "", seats: 1 }
  };

  /* Aturan tahap opsional bila yang ditetapkan sedang menjabat */
  const JABATAN = {
    "sekdep": {
      label: "Sekretaris Departemen", opt: "A",
      text: "Ketua Sidang mempersilakan Kadep terpilih <strong>mengusulkan 3 nama Sekdep</strong> untuk dipilih secara daring."
    },
    "kaprodi-s1": {
      label: "Kaprodi Sarjana", opt: "B",
      text: "<strong>Sekprodi otomatis menjadi Kaprodi Sarjana.</strong>"
    },
    "sekprodi-s1": {
      label: "Sekprodi", opt: "",
      text: "Jabatan Sekprodi yang ditinggalkan perlu <strong>dipilih penggantinya</strong>."
    },
    "kaprodi-s2s3": {
      label: "Kaprodi Magister/Doktor", opt: "C",
      text: "Ketua Sidang mempersilakan Kadep terpilih <strong>mengusulkan Kaprodi</strong> Magister/Doktor."
    },
    "koord-kbk": {
      label: "Koordinator KBK", opt: "D",
      text: "Ketua Sidang mempersilakan <strong>Komunitas KBK mengusulkan Koordinator</strong> pengganti."
    }
  };

  const PALETTE = ["#1352a8", "#d4a72c", "#2a9d8f", "#7b61ff", "#e76f51", "#4a8be0", "#0a2a5c",
    "#8ab17d", "#c2363a", "#6c8ead", "#f4a261", "#264653", "#b5179e", "#9aa9bd", "#3d5a80", "#e9c46a"];

  /* ------------------------------------------------------------------ */
  /* Utilitas                                                            */
  /* ------------------------------------------------------------------ */
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fmtTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const store = {
    get(k, s = localStorage) { try { return s.getItem(k); } catch { return null; } },
    set(k, v, s = localStorage) { try { s.setItem(k, v); } catch { /* storage diblokir */ } },
    del(k, s = localStorage) { try { s.removeItem(k); } catch { /* */ } }
  };

  function shortName(c) {
    const d = DOSEN_MAP.get(c.id);
    if (d && d.short) return d.short;
    return String(c.name || "").replace(/,.*$/, "").replace(/^((Prof|Dr|Ir|Dr\.Eng)\.?\s*)+/gi, "").trim() || c.name;
  }
  function initials(c) {
    const parts = shortName(c).split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
    return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }
  function photoUrl(c) {
    const d = DOSEN_MAP.get(c.id);
    return d && d.photo ? MEDIA + d.photo : "";
  }
  /** HTML foto + fallback inisial bila file foto tidak ada */
  function photoHtml(c) {
    const url = photoUrl(c);
    const ini = `<div class="card__initials">${esc(initials(c))}</div>`;
    if (!url) return ini;
    // inisial tampil di belakang; foto menutupinya bila berhasil dimuat
    return ini + `<img class="photo-img" src="${esc(url)}" alt="${esc(c.name)}" loading="lazy" onerror="this.remove()">`;
  }

  let toastTimer;
  function toast(msg, isError = false) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("is-error", isError);
    t.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-show"), 3600);
  }

  /* ------------------------------------------------------------------ */
  /* Modal                                                               */
  /* ------------------------------------------------------------------ */
  function syncScrollLock() {
    const any = $$(".modal.is-open").length > 0 || !$("#adminPanel").hidden;
    document.body.classList.toggle("no-scroll", any);
  }
  function openModal(id) { $("#" + id).classList.add("is-open"); syncScrollLock(); }
  function closeModal(id) { $("#" + id).classList.remove("is-open"); syncScrollLock(); }
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-close]");
    if (btn) closeModal(btn.closest(".modal").id);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = $$(".modal.is-open").filter((m) => m.id !== "welcomeModal");
    if (open.length && !submitting) closeModal(open[open.length - 1].id);
  });

  /* ------------------------------------------------------------------ */
  /* Backend: Remote (Apps Script) & Demo (localStorage)                 */
  /* ------------------------------------------------------------------ */
  const Remote = {
    async state() {
      const r = await fetch(`${CFG.API_URL}?action=state&t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error("Server tidak merespons (" + r.status + ")");
      const j = await r.json();
      if (!j.ok) throw Object.assign(new Error(j.error || "Gagal"), { code: j.code });
      return j;
    },
    async call(body) {
      // text/plain → tanpa preflight CORS (cara yang didukung Apps Script)
      const r = await fetch(CFG.API_URL, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body), redirect: "follow"
      });
      if (!r.ok) throw new Error("Server tidak merespons (" + r.status + ")");
      const j = await r.json();
      if (!j.ok) throw Object.assign(new Error(j.error || "Gagal"), { code: j.code });
      return j;
    }
  };

  /* Demo: meniru logika Code.gs, data disimpan di localStorage browser ini */
  const Demo = {
    KEY: "dtgd-demo-db",
    PASSWORD: "admin",
    load() {
      const raw = store.get(this.KEY);
      if (raw) { try { return JSON.parse(raw); } catch { /* */ } }
      return { rounds: [], votes: [], announcements: [], settings: { totalDosen: DOSEN.length } };
    },
    save(db) { store.set(this.KEY, JSON.stringify(db)); },
    fail(msg, code) { throw Object.assign(new Error(msg), { code }); },
    async state() { await sleep(120); return this.publicState(this.load()); },
    publicState(db) {
      const open = db.rounds.find((r) => r.status === "open") || null;
      return {
        ok: true, serverTime: new Date().toISOString(),
        activeRound: open && { id: open.id, stage: open.stage, name: open.name, position: open.position, seats: open.seats, candidates: open.candidates },
        rounds: db.rounds.map((r) => ({ id: r.id, stage: r.stage, name: r.name, status: r.status })),
        announcements: db.announcements
      };
    },
    async call(body) {
      await sleep(250);
      const db = this.load();
      const a = body.action;
      if (a === "vote") {
        const r = db.rounds.find((x) => x.id === body.roundId);
        if (!r || r.status !== "open") this.fail("Putaran ini sudah ditutup atau belum dibuka.", "ROUND_CLOSED");
        const c = r.candidates.find((x) => x.id === body.candidateId);
        if (!c) this.fail("Calon tidak ditemukan pada putaran ini.", "BAD_CANDIDATE");
        db.votes.push({ timestamp: new Date().toISOString(), roundId: r.id, candidateId: c.id, candidateName: c.name });
        this.save(db);
        return { ok: true };
      }
      if (body.password !== this.PASSWORD) this.fail("Password admin salah.", "UNAUTHORIZED");
      const round = (id) => db.rounds.find((x) => x.id === id) || this.fail("Putaran tidak ditemukan.", "NOT_FOUND");
      switch (a) {
        case "login": return { ok: true };
        case "getAll": break;
        case "createRound": {
          const r = Object.assign({}, body.round, { id: uid("R"), status: "draft", createdAt: new Date().toISOString(), openedAt: "", closedAt: "" });
          db.rounds.push(r);
          if (body.openNow) this.setStatus(db, r.id, "open");
          this.save(db);
          return { ok: true, id: r.id };
        }
        case "setStatus": round(body.roundId); this.setStatus(db, body.roundId, body.status); this.save(db); break;
        case "deleteRound": {
          const r = round(body.roundId);
          if (r.status === "open") this.fail("Tutup putaran terlebih dahulu.");
          if (db.votes.some((v) => v.roundId === r.id)) this.fail("Putaran yang sudah memiliki suara tidak dapat dihapus.");
          db.rounds = db.rounds.filter((x) => x.id !== r.id);
          this.save(db); break;
        }
        case "saveSettings": db.settings = Object.assign(db.settings, body.settings); this.save(db); break;
        case "announce": db.announcements.push(Object.assign({}, body.announcement, { id: uid("A"), at: new Date().toISOString() })); this.save(db); break;
        case "removeAnnouncement": db.announcements = db.announcements.filter((x) => x.id !== body.id); this.save(db); break;
        default: this.fail("Aksi tidak dikenal.");
      }
      return this.adminState(db);
    },
    setStatus(db, id, status) {
      const now = new Date().toISOString();
      if (status === "open") db.rounds.forEach((r) => { if (r.status === "open" && r.id !== id) { r.status = "closed"; r.closedAt = now; } });
      const r = db.rounds.find((x) => x.id === id);
      r.status = status;
      if (status === "open") r.openedAt = now;
      if (status === "closed") r.closedAt = now;
    },
    adminState(db) {
      const tallies = {};
      db.votes.forEach((v) => {
        tallies[v.roundId] = tallies[v.roundId] || {};
        tallies[v.roundId][v.candidateId] = (tallies[v.roundId][v.candidateId] || 0) + 1;
      });
      return {
        ok: true, serverTime: new Date().toISOString(),
        rounds: db.rounds.map((r) => Object.assign({}, r, { tally: tallies[r.id] || {} })),
        announcements: db.announcements, settings: db.settings
      };
    }
  };

  const api = DEMO ? Demo : Remote;

  /* ------------------------------------------------------------------ */
  /* Kunci 1 suara per putaran (localStorage + cookie cadangan)          */
  /* Hanya menyimpan penanda "sudah memilih", BUKAN pilihannya.          */
  /* ------------------------------------------------------------------ */
  const lockKey = (roundId) => "dtgd-voted-" + roundId;
  function hasVoted(roundId) {
    if (store.get(lockKey(roundId))) return true;
    return document.cookie.split("; ").some((c) => c.startsWith(lockKey(roundId) + "="));
  }
  function markVoted(roundId) {
    store.set(lockKey(roundId), "1");
    document.cookie = `${lockKey(roundId)}=1; max-age=${60 * 60 * 24 * 60}; path=/; SameSite=Lax`;
  }

  /* ------------------------------------------------------------------ */
  /* UI umum: navbar, tab dasar hukum, welcome                           */
  /* ------------------------------------------------------------------ */
  const nav = $("#nav");
  window.addEventListener("scroll", () => nav.classList.toggle("is-scrolled", window.scrollY > 10), { passive: true });
  $("#navToggle").addEventListener("click", () => $("#navLinks").classList.toggle("is-open"));
  $$("#navLinks a").forEach((a) => a.addEventListener("click", () => $("#navLinks").classList.remove("is-open")));

  $$(".law__tabs button").forEach((b) => b.addEventListener("click", () => {
    $$(".law__tabs button").forEach((x) => x.classList.toggle("is-active", x === b));
    $$(".law__panel").forEach((p) => p.classList.toggle("is-active", p.dataset.panel === b.dataset.tab));
  }));

  /* ---------- Scrollspy navbar & tombol mengambang ---------- */
  const spyLinks = $$("#navLinks a[data-spy]");
  const spySections = spyLinks.map((a) => document.getElementById(a.dataset.spy)).filter(Boolean);
  const fab = $("#fab"), fabVote = $("#fabVote"), ballotSec = $("#bilik-suara");
  let spyTick = false;
  function updateSpy() {
    spyTick = false;
    const line = window.scrollY + nav.offsetHeight + window.innerHeight * 0.3;
    let current = spySections[0].id;
    spySections.forEach((s) => { if (s.offsetTop <= line) current = s.id; });
    spyLinks.forEach((a) => a.classList.toggle("is-active", a.dataset.spy === current));
    fab.classList.toggle("is-show", window.scrollY > 400);
    const b = ballotSec.getBoundingClientRect();
    fabVote.classList.toggle("is-hidden", b.top < window.innerHeight * 0.6); // sudah di/lewat bilik suara
  }
  const onScrollSpy = () => { if (!spyTick) { spyTick = true; requestAnimationFrame(updateSpy); } };
  window.addEventListener("scroll", onScrollSpy, { passive: true });
  window.addEventListener("resize", onScrollSpy);
  updateSpy();

  if (!store.get("dtgd-agreed", sessionStorage)) openModal("welcomeModal");
  $("#agreeBtn").addEventListener("click", () => {
    store.set("dtgd-agreed", "1", sessionStorage);
    closeModal("welcomeModal");
  });
  $("#reopenRules").addEventListener("click", () => openModal("welcomeModal"));

  /* ------------------------------------------------------------------ */
  /* Halaman pemilih                                                     */
  /* ------------------------------------------------------------------ */
  const voter = { round: null, rounds: [], announcements: [], error: null, sig: "" };

  async function loadState() {
    try {
      const s = await api.state();
      voter.round = s.activeRound || null;
      voter.rounds = s.rounds || [];
      voter.announcements = s.announcements || [];
      voter.error = null;
    } catch (err) {
      voter.error = err;
    }
    renderStatus();
    renderBallot();
    renderAnnouncements();
  }

  function renderStatus() {
    const pill = $("#statusPill"), h = $("#statusRound"), d = $("#statusDesc");
    const setPill = (cls, txt) => { pill.className = "status__pill status__pill--" + cls; pill.querySelector("span").textContent = txt; };
    const r = voter.round;
    if (voter.error && !r) {
      setPill("error", "Tidak terhubung");
      h.textContent = "Server pemilihan tidak dapat dihubungi";
      d.textContent = "Periksa koneksi internet Anda. Halaman akan mencoba lagi secara otomatis.";
    } else if (r) {
      setPill("open", "Pemungutan suara dibuka");
      h.textContent = r.name;
      d.textContent = hasVoted(r.id)
        ? "Suara Anda untuk putaran ini telah tercatat. Terima kasih."
        : `Memilih ${r.position}. Pilih 1 nama dari ${r.candidates.length} calon.`;
    } else if (voter.rounds.length) {
      const last = voter.rounds[voter.rounds.length - 1];
      setPill("closed", "Pemungutan suara ditutup");
      h.textContent = last.name;
      d.textContent = "Penghitungan suara oleh Ketua Sidang. Silakan menunggu putaran atau pengumuman berikutnya.";
    } else {
      setPill("idle", "Belum dimulai");
      h.textContent = "Menunggu pembukaan putaran";
      d.textContent = "Ketua Sidang akan membuka pemungutan suara Tahap 1 dalam rapat.";
    }

    // progres tahap 1 → 2 → 3
    const hasKadep = voter.announcements.some((a) => /ketua departemen/i.test(a.position || ""));
    const stages = voter.rounds.map((x) => x.stage);
    let cur = "";
    if (hasKadep) cur = "tahap3";
    else if (stages.includes("tahap2")) cur = "tahap2";
    else if (stages.includes("tahap1")) cur = "tahap1";
    const order = ["tahap1", "tahap2", "tahap3"];
    const ci = order.indexOf(cur);
    $$("#statusSteps li").forEach((li) => {
      const i = order.indexOf(li.dataset.stage);
      li.classList.toggle("is-done", ci > -1 && (i < ci || (cur === "tahap3" && i === ci)));
      li.classList.toggle("is-current", ci > -1 && i === ci && cur !== "tahap3");
    });
  }

  function noticeHtml(kind, title, text) {
    const icons = {
      info: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm1 8h-2v7h2v-7Zm0-4h-2v2h2V6Z"/></svg>',
      ok: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm4.3 6.3L10.5 14l-2.8-2.8-1.4 1.4 4.2 4.2 7.2-7.1-1.4-1.4Z"/></svg>',
      warn: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M1 21 12 2l11 19H1Zm12-3v-2h-2v2h2Zm0-4V9h-2v5h2Z"/></svg>'
    };
    return `<div class="notice__icon">${icons[kind]}</div><div><h4>${esc(title)}</h4><p>${text}</p></div>`;
  }

  function renderBallot() {
    const r = voter.round;
    const voted = r ? hasVoted(r.id) : false;
    const sig = JSON.stringify([r && r.id, voted, r && r.candidates.length, !!voter.error, voter.rounds.length]);
    if (sig === voter.sig) return; // tidak ada perubahan → jangan ganggu tampilan
    voter.sig = sig;

    const grid = $("#candidateGrid"), notice = $("#ballotNotice"), bar = $("#ballotBar");
    $("#searchInput").value = "";
    const setNotice = (kind, title, text) => {
      notice.hidden = !kind;
      if (kind) { notice.className = "notice notice--" + kind; notice.innerHTML = noticeHtml(kind, title, text); }
    };

    let list;
    if (r) {
      const pos = r.position || "Calon";
      $("#ballotTitle").textContent = /^ketua departemen$/i.test(pos) ? "Pilih Calon Kadep DTGD" : "Pilih Calon " + pos;
      $("#ballotSub").textContent = voted
        ? "Suara Anda untuk putaran ini sudah tercatat."
        : "Klik kartu salah satu calon untuk memberikan suara. Anda akan diminta mengonfirmasi pilihan sebanyak dua kali.";
      bar.hidden = false;
      $("#ballotStage").textContent = (STAGES[r.stage] || STAGES.lain).label;
      $("#ballotRoundName").textContent = r.name;
      $("#ballotRule").textContent = r.seats > 1
        ? `Pilih 1 nama · ${r.seats} nama dengan suara terbanyak akan dijaring`
        : `Pilih 1 nama dari ${r.candidates.length} calon`;
      if (voted) setNotice("ok", "Terima kasih, suara Anda telah tercatat", "Setiap pemilih hanya dapat memberikan satu suara pada setiap putaran. Silakan menunggu hasil atau putaran berikutnya.");
      else setNotice(null);
      list = r.candidates;
    } else {
      bar.hidden = true;
      $("#ballotTitle").textContent = "Pilih Calon Kadep DTGD";
      $("#ballotSub").textContent = "Daftar dosen yang eligible sebagai calon Ketua Departemen.";
      if (voter.error) setNotice("warn", "Tidak dapat terhubung ke server pemilihan", "Halaman akan mencoba menghubungkan kembali secara otomatis.");
      else setNotice("info", "Bilik suara belum dibuka", voter.rounds.length
        ? "Putaran sebelumnya telah ditutup. Kartu calon akan aktif kembali saat Ketua Sidang membuka putaran berikutnya — halaman ini diperbarui otomatis."
        : "Kartu calon akan aktif saat Ketua Sidang membuka pemungutan suara. Halaman ini diperbarui otomatis.");
      list = DOSEN;
    }

    const locked = !r || voted;
    grid.classList.toggle("is-locked", locked);
    grid.classList.toggle("grid--three", !!r && r.candidates.length <= 3);
    grid.innerHTML = list.map((c, i) => `
      <button class="card" type="button" data-id="${esc(c.id)}" data-name="${esc((c.name + " " + shortName(c)).toLowerCase())}" ${locked ? "disabled" : ""}
        aria-label="${esc(locked ? c.name : "Pilih " + c.name)}">
        <div class="card__photo">${photoHtml(c)}<span class="card__no">${String(i + 1).padStart(2, "0")}</span></div>
        <div class="card__body">
          <span class="card__name">${esc(c.name)}</span>
          <span class="card__cta">Pilih calon ini</span>
        </div>
      </button>`).join("") || `<p class="grid__empty">Belum ada calon.</p>`;
  }

  $("#searchInput").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    $$("#candidateGrid .card").forEach((c) => { c.hidden = q && !c.dataset.name.includes(q); });
  });

  $("#candidateGrid").addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (!card || card.disabled || !voter.round) return;
    const c = voter.round.candidates.find((x) => x.id === card.dataset.id);
    if (c) openConfirm(c);
  });

  function renderAnnouncements() {
    const sec = $("#penetapan"), list = voter.announcements;
    sec.hidden = !list.length;
    if (!list.length) return;
    $("#announceList").innerHTML = list.map((a) => {
      const c = { id: a.candidateId, name: a.name };
      return `<article class="announce__card">
        <div class="announce__photo">${photoHtml(c)}</div>
        <div><small>${esc(a.position)}</small><h4>${esc(a.name)}</h4><p>${esc(a.note || "Ditetapkan dalam Rapat Departemen Khusus")}</p></div>
      </article>`;
    }).join("");
  }

  /* ---------------------- Konfirmasi 2 langkah ----------------------- */
  let pending = null, confirmStep = 1, submitting = false;

  function openConfirm(c) {
    pending = c; confirmStep = 1;
    const url = photoUrl(c), img = $("#confirmPhoto"), ini = $("#confirmInitials");
    ini.textContent = initials(c);
    if (url) {
      img.hidden = false; ini.hidden = true; img.src = url; img.alt = c.name;
      img.onerror = () => { img.hidden = true; ini.hidden = false; };
    } else { img.hidden = true; ini.hidden = false; }
    renderConfirm();
    openModal("confirmModal");
  }

  function renderConfirm() {
    const r = voter.round, pos = r.position || "calon";
    $("#cStep1").classList.add("is-on");
    $("#cStep2").classList.toggle("is-on", confirmStep === 2);
    $("#confirmWarn").hidden = confirmStep === 1;
    if (confirmStep === 1) {
      $("#confirmTitle").textContent = "Konfirmasi Pilihan (1/2)";
      $("#confirmText").innerHTML = `Apakah Anda yakin memilih <strong>${esc(pending.name)}</strong> sebagai ${esc(r.seats > 1 ? "calon " + pos : pos)}?`;
      $("#confirmOk").textContent = "Ya, saya yakin";
      $("#confirmCancel").textContent = "Batal";
    } else {
      $("#confirmTitle").textContent = "Konfirmasi Terakhir (2/2)";
      $("#confirmText").innerHTML = `Apakah Anda benar-benar yakin memilih <strong>${esc(pending.name)}</strong> sebagai ${esc(r.seats > 1 ? "calon " + pos : pos)} pada <em>${esc(r.name)}</em>?`;
      $("#confirmOk").textContent = "Kirim Suara";
      $("#confirmCancel").textContent = "Batal";
    }
    $("#confirmOk").disabled = false;
  }

  $("#confirmCancel").addEventListener("click", () => { if (!submitting) { closeModal("confirmModal"); pending = null; } });
  $("#confirmOk").addEventListener("click", async () => {
    if (!pending || submitting) return;
    if (confirmStep === 1) { confirmStep = 2; renderConfirm(); return; }
    const r = voter.round;
    if (hasVoted(r.id)) { closeModal("confirmModal"); toast("Anda sudah memberikan suara pada putaran ini.", true); return; }
    submitting = true;
    const ok = $("#confirmOk");
    ok.disabled = true; ok.textContent = "Mengirim…";
    try {
      await api.call({ action: "vote", roundId: r.id, candidateId: pending.id });
      markVoted(r.id);
      closeModal("confirmModal");
      $("#successText").innerHTML = `Suara Anda pada <strong>${esc(r.name)}</strong> telah tercatat secara anonim.`;
      openModal("successModal");
      voter.sig = "";
      renderStatus(); renderBallot();
    } catch (err) {
      closeModal("confirmModal");
      toast(err.message || "Gagal mengirim suara. Coba lagi.", true);
      voter.sig = "";
      loadState();
    } finally {
      submitting = false; pending = null;
    }
  });

  /* ------------------------------------------------------------------ */
  /* Admin                                                               */
  /* ------------------------------------------------------------------ */
  const PW_KEY = "dtgd-admin-pw";
  const admin = { pw: "", data: null, selected: "", timer: null, rf: null, af: null };

  $("#demoHint").hidden = !DEMO;

  $("#adminBtn").addEventListener("click", async () => {
    const saved = store.get(PW_KEY, sessionStorage);
    if (saved) {
      try { await api.call({ action: "login", password: saved }); admin.pw = saved; return openAdmin(); }
      catch { store.del(PW_KEY, sessionStorage); }
    }
    $("#loginError").hidden = true;
    $("#loginPassword").value = "";
    openModal("loginModal");
    setTimeout(() => $("#loginPassword").focus(), 50);
  });

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = $("#loginPassword").value, btn = $("#loginSubmit");
    btn.disabled = true; btn.textContent = "Memeriksa…";
    try {
      await api.call({ action: "login", password: pw });
      admin.pw = pw;
      store.set(PW_KEY, pw, sessionStorage);
      closeModal("loginModal");
      openAdmin();
    } catch (err) {
      $("#loginError").textContent = err.message || "Login gagal.";
      $("#loginError").hidden = false;
    } finally { btn.disabled = false; btn.textContent = "Masuk"; }
  });

  function openAdmin() {
    $("#adminPanel").hidden = false;
    syncScrollLock();
    refreshAdmin();
    clearInterval(admin.timer);
    admin.timer = setInterval(refreshAdmin, ADMIN_MS);
  }
  function closeAdmin() {
    $("#adminPanel").hidden = true;
    clearInterval(admin.timer);
    syncScrollLock();
    voter.sig = ""; loadState();
  }
  $("#adminClose").addEventListener("click", closeAdmin);
  $("#logoutBtn").addEventListener("click", () => {
    store.del(PW_KEY, sessionStorage); admin.pw = ""; admin.data = null; closeAdmin();
    toast("Anda telah keluar dari panel admin.");
  });

  async function adminCall(body) {
    const res = await api.call(Object.assign({ password: admin.pw }, body));
    if (res.rounds) { admin.data = res; renderAdmin(); }
    return res;
  }

  async function refreshAdmin() {
    try {
      await adminCall({ action: "getAll" });
      $("#liveDot").classList.remove("is-err");
      $("#liveDot").textContent = "Live";
      $("#lastSync").textContent = "Diperbarui " + new Date().toLocaleTimeString("id-ID");
    } catch (err) {
      $("#liveDot").classList.add("is-err");
      $("#liveDot").textContent = "Terputus";
      if (err.code === "UNAUTHORIZED") { store.del(PW_KEY, sessionStorage); closeAdmin(); toast("Sesi admin berakhir. Silakan login kembali.", true); }
    }
  }

  async function adminAction(body, okMsg) {
    try {
      const res = await adminCall(body);
      if (okMsg) toast(okMsg);
      return res;
    } catch (err) { toast(err.message || "Gagal.", true); throw err; }
  }

  /* ---------------------------- Analisis ----------------------------- */
  function analyze(r) {
    const tally = r.tally || {};
    const rows = r.candidates.map((c, i) => ({ ...c, color: PALETTE[i % PALETTE.length], votes: Number(tally[c.id] || 0) }))
      .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
    const total = rows.reduce((s, x) => s + x.votes, 0);
    const k = Math.min(Number(r.seats) || 1, rows.length);
    const res = { rows, total, k, kind: "empty", winners: [], tied: [], above: [], needed: 0 };
    if (!total || !k) return res;
    const cut = rows[k - 1].votes;
    const above = rows.filter((x) => x.votes > cut);
    const atCut = rows.filter((x) => x.votes === cut);
    const needed = k - above.length;
    if (atCut.length > needed) Object.assign(res, { kind: "tie", above, tied: atCut, needed, cut });
    else Object.assign(res, { kind: "clear", winners: rows.slice(0, k) });
    return res;
  }

  /* ------------------------------ Render ----------------------------- */
  function renderAdmin() {
    const d = admin.data;
    if (!d) return;
    const rounds = d.rounds.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (!rounds.find((r) => r.id === admin.selected)) {
      admin.selected = (rounds.find((r) => r.status === "open") || rounds[0] || {}).id || "";
    }
    $("#roundList").innerHTML = rounds.map((r) => {
      const total = r.candidates.reduce((s, c) => s + Number((r.tally || {})[c.id] || 0), 0);
      return `<button class="round-item ${r.id === admin.selected ? "is-active" : ""}" data-round="${esc(r.id)}" type="button">
        <div class="round-item__top"><strong>${esc(r.name)}</strong><span class="badge badge--${r.status}">${statusLabel(r.status)}</span></div>
        <small>${esc(r.position)} · ${r.candidates.length} calon · ${total} suara</small>
      </button>`;
    }).join("") || `<p class="muted small">Belum ada putaran. Klik <b>+ Buat Putaran</b> untuk memulai Tahap 1.</p>`;

    $("#adminAnnounceList").innerHTML = (d.announcements || []).map((a) => `
      <div class="mini-announce__item"><div><strong>${esc(shortName({ id: a.candidateId, name: a.name }))}</strong><small>${esc(a.position)}</small></div>
      <button type="button" data-unannounce="${esc(a.id)}" title="Batalkan penetapan">×</button></div>`).join("")
      || `<p class="muted small">Belum ada penetapan.</p>`;

    const r = rounds.find((x) => x.id === admin.selected);
    $("#adminMain").innerHTML = r ? roundDetailHtml(r, d) : `
      <div class="empty-state">
        <h3>Mulai pemilihan</h3>
        <p>Buat putaran <b>Tahap 1 — Penjaringan 3 Besar</b> dengan seluruh dosen eligible sebagai calon.</p>
        <button class="btn btn--primary" type="button" data-act="new-tahap1">+ Buat Putaran Tahap 1</button>
      </div>`;
  }

  const statusLabel = (s) => ({ open: "Dibuka", closed: "Ditutup", draft: "Draf" }[s] || s);

  function roundDetailHtml(r, d) {
    const a = analyze(r);
    const totalDosen = Number(d.settings && d.settings.totalDosen) || 0;
    const quorum = totalDosen ? Math.floor((2 * totalDosen) / 3) + 1 : 0;
    const part = totalDosen ? Math.round((a.total / totalDosen) * 100) : null;
    const ann = (d.announcements || []).find((x) => x.roundId === r.id);
    const hasVotes = a.total > 0;

    const actions = [];
    if (r.status === "open") actions.push(`<button class="btn btn--danger-ghost btn--sm" data-act="close">Tutup Putaran</button>`);
    else actions.push(`<button class="btn btn--success btn--sm" data-act="open">${r.status === "draft" ? "Buka Putaran" : "Buka Kembali"}</button>`);
    if (r.status !== "open" && !hasVotes) actions.push(`<button class="btn btn--ghost btn--sm" data-act="delete">Hapus</button>`);

    return `
      <div class="rd-head">
        <div>
          <h2>${esc(r.name)}</h2>
          <p>Memilih <b>${esc(r.position)}</b> · ${r.seats > 1 ? `menjaring ${r.seats} besar` : "1 terpilih"} · ${r.candidates.length} calon
          ${r.openedAt ? " · dibuka " + esc(fmtTime(r.openedAt)) : ""}${r.closedAt && r.status === "closed" ? " · ditutup " + esc(fmtTime(r.closedAt)) : ""}</p>
        </div>
        <div class="rd-actions">${actions.join("")}</div>
      </div>

      <div class="kpis">
        <div class="kpi"><span>Total suara</span><strong>${a.total}</strong><small>${r.status === "open" ? "terus diperbarui" : "final putaran ini"}</small></div>
        <div class="kpi ${totalDosen && a.total > totalDosen ? "kpi--danger" : quorum && a.total >= quorum ? "kpi--ok" : quorum ? "kpi--warn" : ""}"><span>Partisipasi</span>
          <strong>${part === null ? "—" : part + "%"}</strong><small>${!totalDosen ? "atur jumlah dosen di Pengaturan"
            : a.total > totalDosen ? `⚠ ${a.total} suara melebihi ${totalDosen} dosen — periksa suara ganda` : `${a.total} dari ${totalDosen} dosen`}</small></div>
        <div class="kpi"><span>Kuorum &gt; 2/3</span><strong>${quorum || "—"}</strong><small>${quorum ? "minimal kehadiran dosen" : "atur di Pengaturan"}</small></div>
        <div class="kpi"><span>Status</span><strong style="font-size:1.3rem">${statusLabel(r.status)}</strong><small>${esc((STAGES[r.stage] || STAGES.lain).label)}</small></div>
      </div>

      ${verdictHtml(r, a, ann)}

      <div class="charts">
        <div class="panel"><h4>Perolehan suara ${r.status === "open" ? "(sementara)" : ""}</h4>${barsHtml(a)}</div>
        <div class="panel"><h4>Komposisi suara</h4>${donutHtml(a)}</div>
      </div>
      ${r.carry && r.carry.length ? `<div class="panel"><h4>Lolos dari putaran sebelumnya</h4><p style="margin:0">${r.carry.map((c) => esc(c.name)).join("<br>")}</p></div>` : ""}
      ${DEMO ? `<p class="muted small">Mode demo — data tersimpan di browser ini. Isi <code>API_URL</code> di config.js untuk menyambungkan ke Google Spreadsheet.</p>` : `<p class="muted small">Setiap suara tercatat di sheet <b>Votes</b> pada spreadsheet (waktu, putaran, calon — tanpa identitas pemilih).</p>`}
    `;
  }

  function verdictHtml(r, a, ann) {
    const names = (list) => list.map((x) => `<b>${esc(shortName(x))}</b> (${x.votes})`).join(", ");
    if (r.status === "open") {
      return `<div class="verdict verdict--info"><div class="verdict__icon">⏳</div><div><h4>Pemungutan suara sedang berlangsung</h4>
        <p>Hasil diperbarui otomatis setiap ${Math.round(ADMIN_MS / 1000)} detik. Tutup putaran untuk menetapkan hasil.</p></div></div>`;
    }
    if (a.kind === "empty") {
      return `<div class="verdict verdict--info"><div class="verdict__icon">ℹ️</div><div><h4>Belum ada suara</h4>
        <p>${r.status === "draft" ? "Putaran masih berupa draf. Klik <b>Buka Putaran</b> agar pemilih dapat memberikan suara." : "Putaran ini ditutup tanpa suara masuk."}</p></div></div>`;
    }
    if (a.kind === "tie") {
      const sameStageName = (STAGES[r.stage] || STAGES.lain).name;
      return `<div class="verdict verdict--warn"><div class="verdict__icon">⚖️</div><div>
        <h4>Perolehan suara seri — perlu putaran ulang</h4>
        <p>Seri antara ${names(a.tied)} untuk ${a.needed} kursi tersisa${a.above.length ? `. Sudah lolos: ${names(a.above)}` : ""}.</p>
        <div class="rd-actions">
          <button class="btn btn--primary btn--sm" data-act="repeat-tied">Putaran ulang: calon seri saja</button>
          <button class="btn btn--ghost btn--sm" data-act="repeat-all">Ulangi dengan semua calon</button>
        </div>
        <p class="muted small" style="margin:8px 0 0">${esc(sameStageName)} — putaran ulang memilih ${a.needed} nama dari calon yang seri.</p>
      </div></div>`;
    }
    // clear
    if (a.k > 1 || r.stage === "tahap1") {
      const finalists = (r.carry || []).concat(a.winners);
      return `<div class="verdict verdict--ok"><div class="verdict__icon">✅</div><div>
        <h4>${a.k} besar terjaring</h4>
        <p>${names(a.winners)}${r.carry && r.carry.length ? ` · ditambah yang lolos sebelumnya: ${r.carry.map((c) => "<b>" + esc(shortName(c)) + "</b>").join(", ")}` : ""}</p>
        <div class="rd-actions"><button class="btn btn--primary btn--sm" data-act="to-tahap2">Lanjut ke Tahap 2 dengan ${finalists.length} calon →</button></div>
      </div></div>`;
    }
    const w = a.winners[0];
    if (ann) {
      const j = JABATAN[ann.jabatan];
      return `<div class="verdict verdict--ok"><div class="verdict__icon">🏛️</div><div>
        <h4>${esc(ann.name)} ditetapkan sebagai ${esc(ann.position)}</h4>
        <p>${w.votes} dari ${a.total} suara.${j ? ` Sebelumnya menjabat <b>${esc(j.label)}</b> — ${j.opt ? "Tahap Opsional " + j.opt + ": " : ""}${j.text}` : ""}</p>
        ${j ? `<div class="rd-actions">${followUpButtons(ann.jabatan)}</div>` : ""}
      </div></div>`;
    }
    return `<div class="verdict verdict--ok"><div class="verdict__icon">🏆</div><div>
      <h4>Suara terbanyak: ${esc(w.name)}</h4>
      <p>${w.votes} dari ${a.total} suara (${Math.round((w.votes / a.total) * 100)}%).</p>
      <div class="rd-actions"><button class="btn btn--primary btn--sm" data-act="announce">Tetapkan sebagai ${esc(r.position)} (Tahap 3)</button></div>
    </div></div>`;
  }

  function followUpButtons(jabatan) {
    switch (jabatan) {
      case "sekdep": return `<button class="btn btn--primary btn--sm" data-follow="opsA">Buat putaran Sekdep (3 usulan Kadep terpilih)</button>`;
      case "kaprodi-s1": return `<button class="btn btn--primary btn--sm" data-follow="opsB">Tetapkan Sekprodi sebagai Kaprodi Sarjana</button>`;
      case "sekprodi-s1": return `<button class="btn btn--primary btn--sm" data-follow="sekprodi">Tetapkan pengganti Sekprodi</button>
        <button class="btn btn--ghost btn--sm" data-follow="sekprodi-round">Buat putaran Sekprodi</button>`;
      case "kaprodi-s2s3": return `<button class="btn btn--primary btn--sm" data-follow="opsC-direct">Tetapkan Kaprodi usulan Kadep</button>
        <button class="btn btn--ghost btn--sm" data-follow="opsC">Buat putaran Kaprodi</button>`;
      case "koord-kbk": return `<button class="btn btn--primary btn--sm" data-follow="opsD">Buat putaran Koordinator KBK</button>
        <button class="btn btn--ghost btn--sm" data-follow="opsD-direct">Tetapkan langsung (musyawarah)</button>`;
      default: return "";
    }
  }

  function barsHtml(a) {
    const max = Math.max(1, ...a.rows.map((x) => x.votes));
    const tiedIds = new Set(a.kind === "tie" ? a.tied.map((x) => x.id) : []);
    const topIds = new Set(a.kind === "clear" ? a.winners.map((x) => x.id) : a.above.map((x) => x.id));
    let rank = 0, prev = null;
    return `<div class="bars">${a.rows.map((x, i) => {
      if (x.votes !== prev) { rank = i + 1; prev = x.votes; }
      const pct = a.total ? Math.round((x.votes / a.total) * 1000) / 10 : 0;
      return `<div class="bar ${topIds.has(x.id) ? "is-top" : ""} ${tiedIds.has(x.id) ? "is-tie" : ""}">
        <span class="bar__rank">${a.total ? rank : "–"}</span>
        <div><div class="bar__label" title="${esc(x.name)}">${esc(x.name)}</div>
          <div class="bar__track"><div class="bar__fill" style="width:${(x.votes / max) * 100}%;background:${x.color}"></div></div></div>
        <span class="bar__val">${x.votes}<small>${pct}%</small></span>
      </div>`;
    }).join("")}</div>`;
  }

  function donutHtml(a) {
    const R = 80, C = 2 * Math.PI * R;
    let off = 0;
    const segs = a.total ? a.rows.filter((x) => x.votes).map((x) => {
      const len = (x.votes / a.total) * C;
      const s = `<circle r="${R}" cx="110" cy="110" fill="none" stroke="${x.color}" stroke-width="30"
        stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"><title>${esc(x.name)}: ${x.votes}</title></circle>`;
      off += len;
      return s;
    }).join("") : "";
    const legend = a.rows.filter((x) => x.votes).map((x) =>
      `<li><i style="background:${x.color}"></i><span>${esc(shortName(x))}</span><b>${Math.round((x.votes / a.total) * 100)}%</b></li>`).join("");
    return `<div class="donut-wrap">
      <svg class="donut" viewBox="0 0 220 220" role="img" aria-label="Diagram lingkaran perolehan suara">
        <circle r="${R}" cx="110" cy="110" fill="none" stroke="#edf2f8" stroke-width="30"/>
        <g transform="rotate(-90 110 110)">${segs}</g>
        <text x="110" y="106" text-anchor="middle" font-size="34" font-weight="800" fill="#0a2a5c">${a.total}</text>
        <text x="110" y="130" text-anchor="middle" font-size="13" fill="#6e7b90">suara</text>
      </svg>
      ${legend ? `<ul class="legend">${legend}</ul>` : `<p class="muted small">Belum ada suara.</p>`}
    </div>`;
  }

  /* ----------------------------- Events ------------------------------ */
  $("#roundList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-round]");
    if (!b) return;
    admin.selected = b.dataset.round;
    renderAdmin();
    $("#adminMain").scrollTop = 0;
  });

  $("#adminAnnounceList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-unannounce]");
    if (!b) return;
    if (!confirm("Batalkan penetapan ini? Pengumuman akan hilang dari halaman pemilih.")) return;
    await adminAction({ action: "removeAnnouncement", id: b.dataset.unannounce }, "Penetapan dibatalkan.").catch(() => {});
  });

  $("#adminMain").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act],[data-follow]");
    if (!btn) return;
    const r = admin.data && admin.data.rounds.find((x) => x.id === admin.selected);
    const act = btn.dataset.act, follow = btn.dataset.follow;

    if (act === "new-tahap1") return openRoundModal({ stage: "tahap1" });
    if (!r) return;
    const a = analyze(r);

    if (act === "open") {
      const other = admin.data.rounds.find((x) => x.status === "open" && x.id !== r.id);
      if (other && !confirm(`"${other.name}" sedang dibuka dan akan ditutup. Lanjutkan?`)) return;
      btn.disabled = true;
      return adminAction({ action: "setStatus", roundId: r.id, status: "open" }, "Putaran dibuka. Pemilih kini dapat memberikan suara.").catch(() => { btn.disabled = false; });
    }
    if (act === "close") {
      if (!confirm(`Tutup "${r.name}"? Pemilih tidak dapat lagi memberikan suara pada putaran ini.`)) return;
      btn.disabled = true;
      return adminAction({ action: "setStatus", roundId: r.id, status: "closed" }, "Putaran ditutup.").catch(() => { btn.disabled = false; });
    }
    if (act === "delete") {
      if (!confirm(`Hapus "${r.name}"?`)) return;
      return adminAction({ action: "deleteRound", roundId: r.id }, "Putaran dihapus.").catch(() => {});
    }
    if (act === "to-tahap2") {
      return openRoundModal({ stage: "tahap2", candidates: (r.carry || []).concat(a.winners) });
    }
    if (act === "repeat-tied") {
      return openRoundModal({
        stage: r.stage, position: r.position, seats: a.needed, candidates: a.tied,
        carry: (r.carry || []).concat(a.above.map(({ id, name }) => ({ id, name }))), repeatOf: r
      });
    }
    if (act === "repeat-all") {
      return openRoundModal({ stage: r.stage, position: r.position, seats: r.seats, candidates: r.candidates, carry: r.carry || [], repeatOf: r });
    }
    if (act === "announce") {
      const w = a.winners[0];
      return openAnnounce({ roundId: r.id, position: r.position, name: w.name, candidateId: w.id, askJabatan: /ketua departemen/i.test(r.position) });
    }
    if (follow) return handleFollow(follow);
  });

  function holderOf(jabatan) { return DOSEN.find((d) => d.jabatan === jabatan); }

  function handleFollow(f) {
    switch (f) {
      case "opsA": return openRoundModal({ stage: "opsA", candidates: [] });
      case "opsB": {
        const h = holderOf("sekprodi-s1");
        return openAnnounce({ position: "Ketua Program Studi Sarjana", name: h ? h.name : "", candidateId: h ? h.id : "", note: "Sekprodi otomatis menjadi Kaprodi (Tahap Opsional B)" });
      }
      case "sekprodi": return openAnnounce({ position: "Sekretaris Program Studi", name: "", note: "" });
      case "sekprodi-round": return openRoundModal({ stage: "lain", position: "Sekretaris Program Studi", name: "Pemilihan Sekretaris Program Studi", candidates: [] });
      case "opsC": return openRoundModal({ stage: "opsC", candidates: [] });
      case "opsC-direct": return openAnnounce({ position: "Ketua Program Studi Magister/Doktor", name: "", note: "Diusulkan oleh Kadep terpilih (Tahap Opsional C)" });
      case "opsD": return openRoundModal({ stage: "opsD", candidates: [] });
      case "opsD-direct": return openAnnounce({ position: "Koordinator KBK Teknik Geoinformatika", name: "", note: "Diusulkan Komunitas KBK (Tahap Opsional D)" });
    }
  }

  $("#newRoundBtn").addEventListener("click", () => openRoundModal({ stage: admin.data && admin.data.rounds.length ? "tahap2" : "tahap1" }));
  $("#manualAnnounceBtn").addEventListener("click", () => openAnnounce({ position: "", name: "", note: "" }));
  $("#settingsBtn").addEventListener("click", () => {
    $("#sfTotal").value = (admin.data && admin.data.settings && admin.data.settings.totalDosen) || "";
    openModal("settingsModal");
  });
  $("#settingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await adminAction({ action: "saveSettings", settings: { totalDosen: Number($("#sfTotal").value) || 0 } }, "Pengaturan disimpan.").catch(() => {});
    closeModal("settingsModal");
  });

  /* -------------------------- Dialog putaran ------------------------- */
  function defaultRoundName(stage, isRepeat) {
    const base = (STAGES[stage] || STAGES.lain).name;
    const n = admin.data ? admin.data.rounds.filter((x) => x.stage === stage).length : 0;
    return n ? `${base} · Putaran ${n + 1}${isRepeat ? " (Ulang)" : ""}` : base;
  }

  function openRoundModal(p = {}) {
    const stage = p.stage || "tahap1";
    const pre = (p.candidates || []).map(({ id, name }) => ({ id, name }));
    // daftar = semua dosen + calon tambahan yang tidak ada di config
    const items = DOSEN.map((d) => ({ id: d.id, name: d.name }));
    pre.forEach((c) => { if (!DOSEN_MAP.has(c.id)) items.push({ id: c.id, name: c.name, custom: true }); });
    const checked = new Set(p.candidates ? pre.map((c) => c.id) : stage === "tahap1" ? DOSEN.map((d) => d.id) : []);
    admin.rf = { items, checked, carry: p.carry || [] };

    $("#roundModalTitle").textContent = p.repeatOf ? "Buat Putaran Ulang" : "Buat Putaran Baru";
    $("#rfStage").value = stage;
    $("#rfSeats").value = p.seats || STAGES[stage].seats;
    $("#rfName").value = p.name || defaultRoundName(stage, !!p.repeatOf);
    $("#rfPosition").value = p.position || STAGES[stage].position;
    $("#rfOpen").checked = true;
    $("#rfError").hidden = true;
    $("#rfCustomName").value = "";
    renderRfList();
    openModal("roundModal");
  }

  function renderRfList() {
    const { items, checked } = admin.rf;
    $("#rfList").innerHTML = items.map((c) => `
      <label><input type="checkbox" value="${esc(c.id)}" ${checked.has(c.id) ? "checked" : ""} />
        <span>${esc(shortName(c))}</span>${c.custom ? '<span class="tag">tambahan</span>' : ""}</label>`).join("");
    $("#rfCount").textContent = checked.size;
  }

  $("#rfList").addEventListener("change", (e) => {
    if (e.target.type !== "checkbox") return;
    e.target.checked ? admin.rf.checked.add(e.target.value) : admin.rf.checked.delete(e.target.value);
    $("#rfCount").textContent = admin.rf.checked.size;
  });
  $("#rfAll").addEventListener("click", () => { admin.rf.items.forEach((c) => admin.rf.checked.add(c.id)); renderRfList(); });
  $("#rfNone").addEventListener("click", () => { admin.rf.checked.clear(); renderRfList(); });
  $("#rfStage").addEventListener("change", (e) => {
    const s = e.target.value;
    $("#rfSeats").value = STAGES[s].seats;
    $("#rfName").value = defaultRoundName(s, false);
    if (STAGES[s].position) $("#rfPosition").value = STAGES[s].position;
  });
  function addCustom() {
    const name = $("#rfCustomName").value.trim();
    if (!name) return;
    const id = uid("c-");
    admin.rf.items.push({ id, name, custom: true });
    admin.rf.checked.add(id);
    $("#rfCustomName").value = "";
    renderRfList();
  }
  $("#rfCustomAdd").addEventListener("click", addCustom);
  $("#rfCustomName").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } });

  $("#roundForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { items, checked, carry } = admin.rf;
    const cands = items.filter((c) => checked.has(c.id)).map(({ id, name }) => ({ id, name }));
    const seats = Math.max(1, Number($("#rfSeats").value) || 1);
    const err = $("#rfError");
    if (cands.length < 2) { err.textContent = "Pilih minimal 2 calon."; err.hidden = false; return; }
    if (cands.length <= seats) { err.textContent = `Jumlah calon harus lebih banyak dari jumlah yang dijaring (${seats}).`; err.hidden = false; return; }
    const btn = e.submitter || $("#roundForm button[type=submit]");
    btn.disabled = true;
    try {
      const res = await adminAction({
        action: "createRound", openNow: $("#rfOpen").checked,
        round: { stage: $("#rfStage").value, name: $("#rfName").value.trim(), position: $("#rfPosition").value.trim(), seats, candidates: cands, carry }
      }, $("#rfOpen").checked ? "Putaran dibuat dan dibuka." : "Putaran disimpan sebagai draf.");
      if (res.id) admin.selected = res.id;
      await refreshAdmin();
      closeModal("roundModal");
    } catch { /* toast sudah tampil */ } finally { btn.disabled = false; }
  });

  /* ------------------------- Dialog penetapan ------------------------ */
  function openAnnounce(p) {
    admin.af = p;
    $("#announceTitle").textContent = p.roundId ? "Penetapan Hasil (Tahap 3)" : "Penetapan";
    $("#afPosition").value = p.position || "";
    $("#afName").value = p.name || "";
    $("#afNote").value = p.note || (p.roundId ? "Ditetapkan berdasarkan perolehan suara terbanyak" : "");
    $("#afJabatanWrap").hidden = !p.askJabatan;
    const d = p.candidateId && DOSEN_MAP.get(p.candidateId);
    $("#afJabatan").value = (d && d.jabatan) || "";
    updateAfHint();
    openModal("announceModal");
  }
  function updateAfHint() {
    const j = JABATAN[$("#afJabatan").value];
    const hint = $("#afHint");
    hint.hidden = !j || $("#afJabatanWrap").hidden;
    if (j) hint.innerHTML = `${j.opt ? `<strong>Tahap Opsional ${j.opt}.</strong> ` : ""}${j.text} Tombol tindak lanjut akan muncul setelah penetapan.`;
  }
  $("#afJabatan").addEventListener("change", updateAfHint);

  $("#announceForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const p = admin.af, name = $("#afName").value.trim();
    const match = p.candidateId || (DOSEN.find((d) => d.name === name || d.short.toLowerCase() === name.toLowerCase()) || {}).id || "";
    const fullName = (DOSEN_MAP.get(match) || {}).name || name;
    try {
      await adminAction({
        action: "announce",
        announcement: {
          roundId: p.roundId || "", position: $("#afPosition").value.trim(), candidateId: match, name: fullName,
          jabatan: $("#afJabatanWrap").hidden ? "" : $("#afJabatan").value, note: $("#afNote").value.trim()
        }
      }, "Penetapan diumumkan di halaman pemilih.");
      closeModal("announceModal");
    } catch { /* */ }
  });

  /* datalist nama dosen untuk penetapan manual */
  const dl = document.createElement("datalist");
  dl.id = "dosenNames";
  dl.innerHTML = DOSEN.map((d) => `<option value="${esc(d.name)}">`).join("");
  document.body.appendChild(dl);
  $("#afName").setAttribute("list", "dosenNames");

  /* ------------------------------------------------------------------ */
  /* Mulai                                                               */
  /* ------------------------------------------------------------------ */
  loadState();
  setInterval(() => { if (document.visibilityState === "visible" && $("#adminPanel").hidden) loadState(); }, VOTER_MS);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") loadState(); });
  // Mode demo: sinkron antar-tab (mis. admin di tab lain)
  if (DEMO) window.addEventListener("storage", (e) => { if (e.key === Demo.KEY) { loadState(); if (!$("#adminPanel").hidden) refreshAdmin(); } });
})();
