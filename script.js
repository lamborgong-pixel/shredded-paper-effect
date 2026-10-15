/* Shredline — interactive paper shredder desk */
(() => {
  const scene = document.getElementById('scene');
  const hero = document.getElementById('hero');
  const shredder = document.getElementById('shredder');
  const lcd = document.getElementById('lcd');
  const led = document.getElementById('led');
  const hint = document.getElementById('hint');
  const countPill = document.getElementById('count-pill');
  const soundToggle = document.getElementById('sound-toggle');

  const docs = [...document.querySelectorAll('.doc')];
  const TOTAL = docs.length;

  // Each document remembers its home position and a palette for confetti
  const PALETTES = {
    'doc-invoice':  ['#fdfdfb', '#fdfdfb', '#fff3b0', '#e8e6e0', '#d8d5cc'],
    'doc-polaroid': ['#fbfaf7', '#f6c99b', '#eda97e', '#5c4a44', '#8a6a58'],
    'doc-sticky':   ['#ffe873', '#ffdf4d', '#f7cf3a', '#ffe873', '#f2d452'],
    'doc-agreement':['#fdfdfb', '#e8e6e0', '#3552a4', '#d8d5cc', '#fdfdfb'],
    'doc-wire':     ['#fdfdfb', '#3e9e5f', '#1c2f66', '#e8e6e0', '#d8d5cc'],
    'doc-memo':     ['#fdfdfb', '#141311', '#c0392b', '#e8e6e0', '#d8d5cc'],
  };

  const state = {
    count: 0,
    shredded: new Set(),
    sound: false,
  };

  // ---------- Home positions ----------
  docs.forEach(doc => {
    doc._home = { left: doc.style.left, top: doc.style.top };
    doc._z = 1;
  });
  let zTop = 2;

  // ---------- Pointer drag ----------
  let drag = null;

  // Scene is CSS-scaled (parallax), so convert client px -> scene px
  function sceneScale() {
    return scene.getBoundingClientRect().width / scene.offsetWidth;
  }

  docs.forEach(doc => {
    doc.addEventListener('pointerdown', e => {
      if (doc.classList.contains('shredded') || drag) return;
      e.preventDefault();
      doc.getAnimations().forEach(a => a.cancel());
      doc.style.opacity = '';
      doc.style.clipPath = '';
      const rect = doc.getBoundingClientRect();
      const sceneRect = scene.getBoundingClientRect();
      const s = sceneScale();
      doc.classList.remove('returning');
      doc.classList.add('dragging');
      doc.style.zIndex = ++zTop;

      // Freeze current visual position into px left/top (scene-relative)
      const cx = (rect.left + rect.width / 2 - sceneRect.left) / s;
      const cy = (rect.top + rect.height / 2 - sceneRect.top) / s;
      doc.style.left = cx + 'px';
      doc.style.top = cy + 'px';
      doc.style.transform = 'translate(-50%,-50%) rotate(0deg) scale(1.04)';

      drag = {
        doc,
        dx: e.clientX - (rect.left + rect.width / 2),
        dy: e.clientY - (rect.top + rect.height / 2),
      };
      doc.setPointerCapture(e.pointerId);
      setHint('拖到碎纸机的进纸口…');
    });
  });

  window.addEventListener('pointermove', e => {
    if (!drag) return;
    const sceneRect = scene.getBoundingClientRect();
    const s = sceneScale();
    const doc = drag.doc;
    doc.style.left = (e.clientX - drag.dx - sceneRect.left) / s + 'px';
    doc.style.top = (e.clientY - drag.dy - sceneRect.top) / s + 'px';

    if (overSlot(doc)) {
      shredder.classList.add('armed');
      led.className = 'led armed';
      setHint('松手，碎掉它');
    } else {
      shredder.classList.remove('armed');
      led.className = 'led';
      setHint('拖到碎纸机的进纸口…');
    }
  });

  window.addEventListener('pointerup', () => {
    if (!drag) return;
    const doc = drag.doc;
    drag = null;
    doc.classList.remove('dragging');

    if (overSlot(doc)) {
      shred(doc);
    } else {
      returnHome(doc);
      shredder.classList.remove('armed');
      led.className = 'led';
      setHint('把一份文件拖进碎纸机');
    }
  });

  function overSlot(doc) {
    const s = shredder.getBoundingClientRect();
    const d = doc.getBoundingClientRect();
    const pad = 30;
    const cx = d.left + d.width / 2;
    // 用纸张底边判定：底边抵到进纸口即可触发，大纸不用拖到很下
    const feedY = d.bottom - Math.min(24, d.height * 0.15);
    return cx > s.left - pad && cx < s.right + pad &&
           feedY > s.top - 30 && feedY < s.top + s.height + 10;
  }

  function returnHome(doc) {
    doc.classList.add('returning');
    doc.style.left = doc._home.left;
    doc.style.top = doc._home.top;
    doc.style.transform = 'translate(-50%,-50%) rotate(var(--r)) scale(1)';
    setTimeout(() => doc.classList.remove('returning'), 480);
  }

  // ---------- Shred ----------
  function shred(doc) {
    doc.classList.add('shredded');
    shredder.classList.remove('armed');
    shredder.classList.add('busy');
    led.className = 'led busy';
    setHint('粉碎中…');
    playShredSound();

    const s = shredder.getBoundingClientRect();
    const sceneRect = scene.getBoundingClientRect();
    const k = sceneScale();
    const d = doc.getBoundingClientRect();

    const fromX = (d.left + d.width / 2 - sceneRect.left) / k;
    const fromY = (d.top + d.height / 2 - sceneRect.top) / k;
    const slotX = (s.left + s.width / 2 - sceneRect.left) / k;
    const slotY = (s.top + 16 - sceneRect.top) / k;
    const dh = d.height / k;
    const feedCenter = slotY - dh / 2 + 4; // 纸张底边抵住进纸口

    // 遮罩：底部边缘正好是进纸口，纸张滑入时超出部分被裁掉，形成"被卷入"的效果
    const mask = document.createElement('div');
    mask.style.cssText = 'position:absolute;left:0;right:0;top:0;height:' + (slotY + 2) +
      'px;overflow:hidden;z-index:6;pointer-events:none;';
    scene.appendChild(mask);

    doc.style.left = fromX + 'px';
    doc.style.top = fromY + 'px';
    doc.style.zIndex = 6;
    mask.appendChild(doc); // mask 与 scene 同原点，left/top 无需换算

    const anim = doc.animate([
      { left: fromX + 'px', top: fromY + 'px',
        transform: 'translate(-50%,-50%) rotate(0deg) scale(1.04)', opacity: 1, offset: 0 },
      { left: slotX + 'px', top: feedCenter + 'px',
        transform: 'translate(-50%,-50%) rotate(0deg) scale(1)', opacity: 1, offset: 0.3 },
      { left: slotX + 'px', top: (feedCenter + dh * 0.45) + 'px',
        transform: 'translate(-50%,-50%) rotate(0deg) scale(1)', opacity: 1, offset: 0.62 },
      { left: slotX + 'px', top: (slotY + dh / 2 + 8) + 'px',
        transform: 'translate(-50%,-50%) rotate(0deg) scale(.98)', opacity: 1, offset: 1 },
    ], { duration: 1100, easing: 'cubic-bezier(.42,0,.8,.35)' });

    // 纸张抵住槽口后开始从出纸口吐纸：纸带保持纸张宽度，内容是原纸克隆——
    // 纸张滑进去多少，纸带就露出对应那一段的真实内容，底边再不断被撕成碎条落下
    const palette = PALETTES[doc.id] || ['#fff'];
    const outX = s.left + s.width / 2;
    const outY = s.bottom - 2;

    const ribbonW = Math.min(d.width / k * 0.92, s.width / k - 60);
    const ribbon = document.createElement('div');
    ribbon.className = 'shred-ribbon';
    ribbon.style.left = (slotX - ribbonW / 2) + 'px';
    ribbon.style.top = ((s.bottom - 6 - sceneRect.top) / k) + 'px';
    ribbon.style.width = ribbonW + 'px';
    ribbon.style.height = '0px';
    const clone = doc.cloneNode(true);
    clone.removeAttribute('id');
    clone.style.cssText = 'position:absolute;left:50%;top:0;margin:0;' +
      'transform:translateX(-50%);transition:none;box-shadow:none;border-radius:0;' +
      'pointer-events:none;opacity:1;cursor:default;';
    ribbon.appendChild(clone);
    scene.appendChild(ribbon);

    const chew = () => { // 锯齿底边，像被刀辊咬住
      const n = 14;
      let pts = '0 0,100% 0,100% 60%';
      for (let i = n; i >= 0; i--) {
        pts += ',' + (i / n * 100).toFixed(1) + '% ' + (60 + Math.random() * 40).toFixed(0) + '%';
      }
      ribbon.style.clipPath = 'polygon(' + pts + ',0 60%)';
    };
    chew();

    const feedDur = +anim.effect.getTiming().duration || 1100;
    const cloneH = doc.offsetHeight;
    const emitDelay = setTimeout(() => {
      let tickN = 0;
      feedTimer = setInterval(() => {
        const ct = anim.currentTime || 0;
        const frac = Math.min(1, Math.max(0, (ct - feedDur * 0.3) / (feedDur * 0.7)));
        const fed = frac * cloneH;                 // 已卷入的纸张长度
        const h = Math.min(26, fed);
        ribbon.style.height = h + 'px';
        clone.style.top = (fed - cloneH) + 'px';   // 克隆下滑，纸带露出对应段落的内容
        if (++tickN % 2 === 0) chew();
        emitStrips(outX, outY + h * k - 2, palette, ribbonW * 0.85); // 从纸带底边撕落
      }, 60);
    }, 320);

    anim.onfinish = () => {
      clearTimeout(emitDelay);
      clearInterval(feedTimer);
      feedTimer = null;
      // 纸带收尾：向上收回消失
      const retract = ribbon.animate(
        [{ height: ribbon.style.height }, { height: '0px' }],
        { duration: 140, easing: 'ease-in', fill: 'forwards' });
      retract.onfinish = () => ribbon.remove();
      scene.appendChild(doc);
      mask.remove();
      doc.style.left = slotX + 'px';
      doc.style.top = slotY + 'px';
      doc.style.transform = 'translate(-50%,-50%) rotate(0deg) scale(1)';
      doc.style.opacity = '0';
      shredder.classList.remove('busy');
      burst(outX, outY, palette, 16); // 收尾补一小蓬
      tickCounter();
      setTimeout(() => {
        led.className = 'led';
        if (state.shredded.size >= TOTAL) {
          setHint('干净利落，什么都没留下。');
          setTimeout(resetScene, 2400);
        } else {
          setHint('已粉碎 ' + state.shredded.size + ' / ' + TOTAL + ' —— 继续');
        }
      }, 350);
    };
    state.shredded.add(doc.id);
  }

  function tickCounter() {
    state.count++;
    lcd.textContent = String(state.count).padStart(2, '0');
    lcd.classList.remove('tick');
    void lcd.offsetWidth;
    lcd.classList.add('tick');
    countPill.textContent = state.count;
  }

  function resetScene() {
    docs.forEach((doc, i) => {
      doc.getAnimations().forEach(a => a.cancel());
      doc.classList.remove('shredded', 'returning');
      doc.style.zIndex = 1;
      doc.style.left = doc._home.left;
      doc.style.top = doc._home.top;
      doc.style.opacity = '0';
      doc.style.clipPath = '';
      doc.style.transform = 'translate(-50%,-50%) rotate(var(--r)) scale(.92)';
      setTimeout(() => {
        doc.style.opacity = '1';
        doc.style.transform = 'translate(-50%,-50%) rotate(var(--r)) scale(1)';
        doc.animate([
          { opacity: 0, transform: 'translate(-50%,-50%) rotate(var(--r)) scale(.92)' },
          { opacity: 1, transform: 'translate(-50%,-50%) rotate(var(--r)) scale(1)' },
        ], { duration: 480, easing: 'ease-out' });
      }, 120 + i * 100);
    });
    setTimeout(() => {
      state.count = 0;
      state.shredded.clear();
      particles = [];
      clearInterval(feedTimer);
      feedTimer = null;
      scene.querySelectorAll('.shred-ribbon').forEach(r => r.remove());
      lcd.textContent = '00';
      countPill.textContent = '0';
      setHint('把一份文件拖进碎纸机');
    }, 500);
  }

  function setHint(text) {
    if (hint.textContent === text) return;
    hint.style.opacity = 0;
    setTimeout(() => { hint.textContent = text; hint.style.opacity = 1; }, 180);
  }

  // ---------- Confetti particle system ----------
  const canvas = document.getElementById('confetti');
  const ctx = canvas.getContext('2d');
  let particles = [];
  let feedTimer = null;

  function fitCanvas() {
    canvas.width = canvas.offsetWidth * devicePixelRatio;
    canvas.height = canvas.offsetHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  // ---------- 碎纸印刷痕迹：预渲染带原纸内容的贴纸 ----------
  const stripSpriteCache = new Map(); // palette -> [canvas]

  function paperKind(palette) {
    if (palette === PALETTES['doc-sticky']) return 'sticky';
    if (palette === PALETTES['doc-polaroid']) return 'photo';
    return 'doc';
  }

  // 在贴纸上画印刷痕迹：文件是裁断的文字行，便利贴是手写笔迹，照片是渐变色彩
  function paintPrint(g, palette, w, h) {
    const kind = paperKind(palette);
    if (kind === 'photo') {
      const cols = palette.slice(1);
      const grad = g.createLinearGradient(0, 0, w * 0.3, h);
      grad.addColorStop(0, cols[(Math.random() * cols.length) | 0]);
      grad.addColorStop(1, cols[(Math.random() * cols.length) | 0]);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      return;
    }
    const ink = kind === 'sticky' ? 'rgba(60,48,32,.7)' : 'rgba(40,40,46,.55)';
    if (kind === 'sticky') {
      // 手写笔迹：一两条波浪线
      const rows = 1 + (Math.random() < 0.5 ? 1 : 0);
      for (let r = 0; r < rows; r++) {
        const y = h * (0.3 + r * 0.4) + Math.random() * 2;
        const accent = Math.random() < 0.15;
        g.strokeStyle = accent ? palette[1 + ((Math.random() * (palette.length - 1)) | 0)] : ink;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(w * 0.08, y);
        for (let x = w * 0.08; x < w * 0.9; x += 4 + Math.random() * 5) {
          g.quadraticCurveTo(x + 2, y - 1.8 + Math.random() * 3.6, x + 4 + Math.random() * 3, y + Math.random() * 1.6 - 0.8);
        }
        g.stroke();
      }
      return;
    }
    // 文字行：短横线带词间空隙，偶尔出现彩色字符（印章/签名/金额色）
    let y = 2.5;
    while (y < h - 1.5) {
      let x = Math.random() * 3;
      while (x < w - 3) {
        const seg = 3 + Math.random() * Math.min(14, w * 0.4);
        const accent = Math.random() < 0.08;
        g.fillStyle = accent ? palette[1 + ((Math.random() * (palette.length - 1)) | 0)] : ink;
        g.fillRect(x, y, Math.min(seg, w - x), 1 + Math.random() * 0.6);
        x += seg + 2 + Math.random() * 4;
      }
      y += 3.2 + Math.random() * 2.4;
    }
  }

  function getStripSprites(palette) {
    let set = stripSpriteCache.get(palette);
    if (!set) {
      set = [];
      for (let i = 0; i < 14; i++) {
        const w = 2 + Math.random() * 2.5, h = 8 + Math.random() * 14, S = 2;
        const c = document.createElement('canvas');
        c.width = Math.round(w * S);
        c.height = Math.round(h * S);
        const g = c.getContext('2d');
        g.scale(S, S);
        g.fillStyle = palette[0]; // 纸基色始终是纸张主色，彩色只出现在印刷痕迹里
        g.fillRect(0, 0, w, h);
        if (Math.random() < 0.5) { // 纸张色调微差
          g.fillStyle = 'rgba(0,0,0,' + (0.02 + Math.random() * 0.05).toFixed(3) + ')';
          g.fillRect(0, 0, w, h);
        }
        if (Math.random() < 0.8) paintPrint(g, palette, w, h); // 少量碎条是纯白纸边
        c._w = w; c._h = h;
        set.push(c);
      }
      stripSpriteCache.set(palette, set);
    }
    return set;
  }

  // 出纸口纸带：整条宽度上显示原纸克隆内容（见 shred()）

  function burst(x, y, palette, n = 64) {
    const sprites = getStripSprites(palette);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 9;
      const spr = Math.random() < 0.6 ? sprites[(Math.random() * sprites.length) | 0] : null;
      particles.push({
        x, y,
        vx: Math.cos(a) * speed * (0.7 + Math.random() * 0.9),
        vy: Math.sin(a) * speed * 0.6 - 1.2 - Math.random() * 3.2,
        w: spr ? spr._w : 2.5 + Math.random() * 3.5,
        h: spr ? spr._h : 7 + Math.random() * 15,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.35,
        color: palette[(Math.random() * palette.length) | 0],
        sprite: spr,
        floor: canvas.offsetHeight - 12 - Math.random() * 90, // 堆到页面底部
        settled: 0,
        liftUntil: 0,
        alpha: 1,
      });
    }
    if (particles.length > 700) particles.splice(0, particles.length - 700);
  }

  // 粉碎过程中从纸带底边持续落下的纸条：基本竖直下落，轻微散开，条上带原纸内容
  function emitStrips(x, y, palette, spread = 130) {
    const sprites = getStripSprites(palette);
    for (let i = 0; i < 7; i++) {
      const spr = sprites[(Math.random() * sprites.length) | 0];
      particles.push({
        x: x + (Math.random() - 0.5) * spread,
        y: y + Math.random() * 4,
        vx: (Math.random() - 0.5) * 2.2,
        vy: 0.6 + Math.random() * 1.6,
        w: spr._w,
        h: spr._h,
        rot: (Math.random() - 0.5) * 0.6,
        vr: (Math.random() - 0.5) * 0.2,
        color: palette[(Math.random() * palette.length) | 0],
        sprite: spr,
        floor: canvas.offsetHeight - 12 - Math.random() * 90, // 堆到页面底部
        settled: 0,
        liftUntil: 0,
        alpha: 1,
      });
    }
    if (particles.length > 700) particles.splice(0, particles.length - 700);
  }

  // 点击桌面上的纸屑堆：把碎片踢起来（不影响拖拽文件和 UI 按钮）
  hero.addEventListener('pointerdown', e => {
    if (e.target.closest('.doc') || e.target.closest('.hero-ui')) return;
    const r = canvas.getBoundingClientRect();
    kickParticles(e.clientX - r.left, e.clientY - r.top);
  });

  // 连击能量：短时间内连续点击纸屑堆，碎片会越飘越高
  let kickEnergy = 0;
  let lastKickAt = 0;

  function kickParticles(x, y) {
    const now = performance.now();
    kickEnergy = (now - lastKickAt < 1500) ? Math.min(kickEnergy + 1, 6) : 1;
    lastKickAt = now;

    const R = 110 + kickEnergy * 12; // 能量越高，影响范围越大
    const hoverY = Math.max(70, 240 - kickEnergy * 28); // 能量越高，悬停高度越高
    for (const p of particles) {
      if (p.alpha <= 0.05) continue;
      const dx = p.x - x, dy = p.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist > R) continue;
      const f = 1 - dist / R;
      const a = Math.atan2(dy, dx);
      p.vx += Math.cos(a) * (2 + Math.random() * 3) * f;
      p.vy = Math.max(-(2.5 + Math.random() * 3.5 + kickEnergy * 1.8) * f - 1, -14);
      p.vr = (Math.random() - 0.5) * 0.5;
      p.alpha = Math.max(p.alpha, 0.3 + 0.5 * f); // 踢起时把快消散的碎片"唤醒"
      // 上升气流：连击越多，气流持续越久、悬停越高
      p.liftUntil = Math.max(p.liftUntil, now + (kickEnergy - 1) * (300 + Math.random() * 400) * f);
      p.hoverY = hoverY;
      p.settled = 0;
    }
  }

  let lastTickAt = performance.now();
  function tickParticles() {
    const nowT = performance.now();
    const dtF = Math.min(4, (nowT - lastTickAt) / 16.67); // 帧率无关的时间步长
    lastTickAt = nowT;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    ctx.clearRect(0, 0, W, H);

    particles = particles.filter(p => p.alpha > 0.01);
    for (const p of particles) {
      if (!p.settled) {
        if (p.liftUntil > nowT) {     // 上升气流：抵消重力并左右轻摆
          p.vy = Math.max(p.vy - 0.34 * dtF, -7); // 上浮限速，防止加速飞出屏幕
          p.vx += Math.sin(nowT / 300 + p.x * 0.05) * 0.06 * dtF;
          if (p.y < (p.hoverY || 120)) p.vy = Math.max(p.vy, 0); // 飘到悬停高度就停
        }
        p.vy += 0.32 * dtF;           // gravity
        p.vx *= Math.pow(0.985, dtF); // air drag
        p.vy *= Math.pow(0.992, dtF);
        p.x += p.vx * dtF;
        p.y += p.vy * dtF;
        p.rot += p.vr * dtF;
        if (p.y > p.floor - p.h / 2) {  // land on the desk mound
          p.y = p.floor - p.h / 2;
          if (Math.abs(p.vy) > 1.6) {
            p.vy *= -0.25;
            p.vx *= 0.6;
          } else {
            p.settled = 1;
            p.rot = (Math.random() - 0.5) * 0.5; // lie mostly flat
          }
        }
      } else {
        p.alpha -= 0.00011 * dtF;     // 纸屑在桌面上长时间堆积，极缓慢消散（真实时间约 2.5 分钟）
      }
      if (p.alpha <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.sprite) {
        ctx.drawImage(p.sprite, -p.w / 2, -p.h / 2, p.w, p.h);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }
    requestAnimationFrame(tickParticles);
  }
  requestAnimationFrame(tickParticles);

  // ---------- Parallax camera ----------
  let targetX = 0, targetY = 0, camX = 0, camY = 0;
  let baseScale = 1.06;
  function updateBaseScale() {
    baseScale = window.innerWidth < 640 ? 0.62 : window.innerWidth < 900 ? 0.8 : 1.06;
  }
  updateBaseScale();
  window.addEventListener('resize', updateBaseScale);

  hero.addEventListener('pointermove', e => {
    const r = hero.getBoundingClientRect();
    targetX = ((e.clientX - r.left) / r.width - 0.5);
    targetY = ((e.clientY - r.top) / r.height - 0.5);
  });
  hero.addEventListener('pointerleave', () => { targetX = 0; targetY = 0; });

  function tickCamera() {
    camX += (targetX - camX) * 0.045;
    camY += (targetY - camY) * 0.045;
    scene.style.transform =
      `translate(${(-camX * 26).toFixed(2)}px, ${(-camY * 18).toFixed(2)}px) scale(${baseScale})`;
    requestAnimationFrame(tickCamera);
  }
  requestAnimationFrame(tickCamera);

  // ---------- Sound (WebAudio, synthesized) ----------
  let audioCtx = null;
  soundToggle.addEventListener('click', () => {
    state.sound = !state.sound;
    soundToggle.textContent = state.sound ? '音效 开' : '音效 关';
    if (state.sound && !audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  });

  function playShredSound() {
    if (!state.sound || !audioCtx) return;
    const dur = 0.9;
    const sr = audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(1, sr * dur, sr);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 0.6) * 0.9;
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.8;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    src.connect(bp).connect(lp).connect(gain).connect(audioCtx.destination);
    src.start();
  }
})();
