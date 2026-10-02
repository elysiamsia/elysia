/**
 * 语录明信片生成（2026-10-02 重做：有她 + 能写自己的字 + 二维码）
 *
 * 尺寸：视口 < 768px → 1080×1440（3:4，手机全屏 / 朋友圈 / 小红书）
 *       否则         → 1200×800（3:2，电脑 / 平板 / 文档配图）
 * 另给手动切换——用电脑的人常是为了存下来发朋友圈，设备对了心思不一定对。
 *
 * 版式：**左边一块相片框放立绘，右边是她的台词与访客写的字**，右下角一枚二维码。
 * 台词来自 window.QUOTES.daily（与首页「飞花寄语」同一份，不新增内容）。
 *
 * ── ⚠ 三处容易踩的（都在下面有对应注释）────────────────────────────────
 *   · **图片是异步的**：没就绪就落笔会画出一张空卡，而页面看着一切正常
 *   · **八张立绘里只有 3 张是干净抠图**，另 5 张自带背景 —— 所以立绘一律
 *     放进「相片框」里按比例 contain，**不裁切、不满幅**
 *   · **别把未就绪当成失败**：两者都画空框，但状态要分得开（验收要读）
 */
(function () {
  var pool = (window.QUOTES && window.QUOTES.daily) || [];
  var host = document.getElementById('postcardPreview');
  var btnRedraw = document.getElementById('postcardRedraw');
  var btnToggle = document.getElementById('postcardToggle');
  var btnSave = document.getElementById('postcardSave');
  var tip = document.getElementById('postcardTip');
  var input = document.getElementById('postcardInput');
  var countEl = document.getElementById('postcardCount');
  var promptsBox = document.getElementById('postcardPrompts');
  var artBox = document.getElementById('postcardArt');
  var writeWrap = input ? input.parentNode : null;
  if (!pool.length || !host || !btnRedraw) return;

  /* spec §七：访客写字的**硬上限**。
     ⚠ 光靠 `maxlength` 不够 —— 粘贴 / 脚本都能绕过，所以输入事件里**再截一次**。
        （200 是需求方定的；这里截断是**明确的规格**，不是「悄悄丢掉用户的话」。） */
  var MAX_USER = 200;

  var VERTICAL = { w: 1080, h: 1440 };
  var HORIZONTAL = { w: 1200, h: 800 };
  var vert = window.innerWidth < 768;      // 默认跟随设备
  var manual = false;                       // 用户是否手动切过

  /* 八张立绘（spec §四）。⚠ 顺序就是缩略图的顺序，别随便调。
     3 装甲 + 5 皮肤，都**已经在站点上**（首页本来就在用），不新增资源。 */
  var ART = [
    'images/armor-pink.webp',   // 装甲 · 粉色妖精小姐（抠图）
    'images/armor-elf.webp',    // 装甲 · 嗨爱愿妖精（抠图）
    'images/armor-ego.webp',    // 装甲 · 真我人之律者
    'images/skin-1.webp',       // 皮肤 · 粉色甜心小姐（抠图）
    'images/skin-2.webp',       // 皮肤 · 夏日妖精小姐（带背景）
    'images/skin-3.webp',       // 皮肤 · 褪色妖精小姐（带背景）
    'images/skin-4.webp',       // 皮肤 · 春好桃夭
    'images/skin-5.webp'        // 皮肤 · 霁月婵娟（带背景）
  ];
  var QR_SRC = 'images/qr-elysiad.png';     // 见 tools/make_qr.py

  /* 版式（都是**比例**，乘 size().w/h 用；两档共用同一套键）。
     ⚠ 改这里的数要连着看两件事：① 相片框与文字栏**不许重叠**
       ② 右下角二维码 + 那行域名要落在内描边里面（内描边在 0.031 处）。 */
  /* ⚠ `qr.r` 是**半边长**：画出来是 2r 见方的方块（而且按**宽**算，两档一致）。
     内描边在 0.031 处，所以「x + 2r」和「y·h/w + 2r」都不许超过 ~0.957。
     2026-10-02 就是在这儿翻过车：把 r 当半径写，二维码戳到卡片外面去了
     —— 截图才看出来。现在有 `check_regions_fit_card` 守着。 */
  var COL = {
    vert: { art: { x: 0.055, y: 0.09, w: 0.42, h: 0.80 },
            qr: { x: 0.807, y: 0.807, r: 0.075 },
            quoteShare: 0.42 },
    horz: { art: { x: 0.045, y: 0.115, w: 0.355, h: 0.77 },
            qr: { x: 0.767, y: 0.62, r: 0.095 },
            /* ⚠ 横版这张卡**矮得多**（800 vs 1440），台词块得让一截给访客写的字 ——
               2026-10-02 实测：0.42 的话，200 字怎么缩都压到底边（安全带里冒出 1846 个亮像素）。 */
            quoteShare: 0.34 }
  };
  function col() { return COL[vert ? 'vert' : 'horz']; }

  var current = 0;
  var cur = Math.floor(Math.random() * ART.length);   // spec §四：默认随机一张
  var canvas = null;
  var ctx = null;
  var userLayout = null;      // 最近一次「访客的字」的排版记录（下面是只读读数用）

  /* 图片加载状态：**三态**要分得开 —— 就绪 / 失败 / 还没结果 */
  var artImgs = [];
  var qrImg = { el: null, ok: false, failed: false };
  var LOAD_MS = 1500;      // 网络慢时不能让卡片一直不出图

  var FONT_STACK = '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",'
                 + '"Hiragino Sans GB","Microsoft YaHei",sans-serif';

  function size() { return vert ? VERTICAL : HORIZONTAL; }
  function artReady() { var r = artImgs[cur]; return !!(r && r.ok); }
  function artFailed() { var r = artImgs[cur]; return !!(r && r.failed); }
  function qrFailed() { return !!qrImg.failed; }

  /* ── 预载 ────────────────────────────────────────────────────────────
     ⚠ onerror 一定要接：图挂了要**记得**，不能等到画的时候才发现。 */
  function loadImages() {
    artImgs = [];
    for (var i = 0; i < ART.length; i++) {
      (function () {
        var rec = { el: new Image(), ok: false, failed: false };
        rec.el.onload = function () { rec.ok = true; };
        rec.el.onerror = function () { rec.failed = true; };
        rec.el.src = ART[artImgs.length];
        artImgs.push(rec);
      })();
    }
    qrImg = { el: new Image(), ok: false, failed: false };
    qrImg.el.onload = function () { qrImg.ok = true; };
    qrImg.el.onerror = function () { qrImg.failed = true; };
    qrImg.el.src = QR_SRC;
  }

  function imagesSettled() {
    for (var i = 0; i < artImgs.length; i++) {
      if (!artImgs[i].ok && !artImgs[i].failed) return false;
    }
    return qrImg.ok || qrImg.failed;
  }

  function makeCanvas() {
    var s = size();
    canvas = document.createElement('canvas');
    canvas.width = s.w;
    canvas.height = s.h;
    ctx = canvas.getContext('2d');
    host.innerHTML = '';
    host.appendChild(canvas);
  }

  /* 把台词按最大宽度折行 */
  function wrap(text, maxWidth) {
    var lines = [];
    var line = '';
    for (var i = 0; i < text.length; i++) {
      var test = line + text[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = text[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /* 访客写的字折行：**先按他自己打的换行分段**，再逐段按宽度折。
     ⚠ 台词那边不用这个（台词没有换行）—— 这里多一段是因为换行是访客的表达。
     ⚠ `widthAt(第几行)` 返回的是**那一行**能用的宽度，不是一个常数 ——
       理由在 `drawUserText`：落到二维码那一行里的行，宽度得先让开。 */
  function wrapUser(text, widthAt) {
    var out = [];
    var segs = String(text).split('\n');
    for (var si = 0; si < segs.length; si++) {
      var seg = segs[si];
      if (!seg) { out.push(''); continue; }
      /* ⚠ 一行一行地问宽度。**别**改回 `wrap(seg, 一个宽度)`：那个是「整段一次
         问一个宽度」，落到二维码那一行里的行也跟着用全宽 —— 这条规则就等于没写
         （2026-10-02 第一版就是这么写的：量出来还是 0.93，字照样被盖）。 */
      var at = 0;
      while (at < seg.length) {
        var maxW = widthAt(out.length);         // ⚠ 每一行**单独**问一次
        var n = 0;
        while (at + n < seg.length &&
               ctx.measureText(seg.substr(at, n + 1)).width <= maxW) n++;
        if (n === 0) n = 1;                     // 一个字都放不下（宽度离谱地小）→ 至少排一个
        out.push(seg.substr(at, n));
        at += n;
      }
    }
    return out;
  }

  /* 把访客的字排进 (maxW × maxH)：先按初始字号排，塞不下就**逐档缩小**，
     缩到下限还塞不下就不缩了（宁可挤一点，也不许把人家写的字裁掉）。 */
  function layoutUserText(text, maxW, maxH, font0, widthAt) {
    var f = font0;
    /* ⚠ spec §七 写的是「下限约初值的 70%」，实测降过两次：
       ① 横版那张卡上 200 字在 70% 时怎么都塞不下（差 ~100px）→ 先降到 60%；
       ② 加上「绕开二维码」之后（见 `drawUserText`）60% 也不够了 ——
          下半段能用的宽度只剩约三分之二，实测要 50%（1200 宽上是 17px）才装得下。
       另一条路「横版把上限降到 150」会在**切尺寸时截断访客已经写的字**，
       而「切尺寸不许丢状态」是有断言守着的（Review Focus 4），所以没走那条。 */
    var floor = Math.round(font0 * 0.5);
    var lines;
    while (true) {
      ctx.font = '300 ' + f + 'px ' + FONT_STACK;
      lines = wrapUser(text, function (i) { return widthAt(f, i); });
      if (lines.length * f * 1.85 <= maxH || f <= floor) break;
      f = Math.max(floor, Math.round(f * 0.94));
    }
    return { font: f, lines: lines };
  }

  /* 圆角矩形路径 —— ⚠ 不用 ctx.roundRect（大陆手机的老内核未必认） */
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* 一朵简笔水晶花（四瓣），用来做四角与点缀 */
  function flower(cx, cy, r, alpha) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffc8dd';
    for (var i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((Math.PI / 2) * i);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.68, r * 0.34, r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd166';
    ctx.fill();
    ctx.restore();
  }

  /* ── 相片框 ──────────────────────────────────────────────────────────
     ⚠ 八张立绘里 3 张是抠图、5 张自带背景 —— 所以一律 **contain 不裁切**：
       抠图那张在框里露出卡底色，带背景那张整幅填进框里，两种都不崩。 */
  function drawArt(x, y, w, h) {
    var r = Math.round(w * 0.05);
    ctx.save();
    roundRect(x, y, w, h, r);
    ctx.fillStyle = 'rgba(255,255,255,0.028)';
    ctx.fill();
    ctx.clip();                                   // 图片不许溢出圆角
    var rec = artImgs[cur];
    if (rec && rec.ok && rec.el) {
      var iw = rec.el.naturalWidth || rec.el.width;
      var ih = rec.el.naturalHeight || rec.el.height;
      if (iw && ih) {
        var sc = Math.min(w / iw, h / ih);
        var dw = iw * sc, dh = ih * sc;
        ctx.drawImage(rec.el, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      }
    }
    /* ⚠ 没就绪 / 失败：**留一个空框**（框边在、里面是卡底色），不是白屏 */
    ctx.restore();
    roundRect(x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.strokeStyle = 'rgba(255,200,221,0.30)';
    ctx.lineWidth = Math.max(1, Math.round(w * 0.006));
    ctx.stroke();
  }

  /* ── 二维码 ────────────────────────────────────────────────────────── */
  function drawQR(x, y, r) {
    var side = r * 2;
    if (qrImg.ok && qrImg.el) {
      ctx.drawImage(qrImg.el, x, y, side, side);
      return true;
    }
    return false;                                 // 调用方只管印域名
  }

  /* 访客写的字。空着就不画（那一段留白，卡照出）。
     ⚠ 字要**绕开二维码**：行一旦落到二维码那一行的范围里，可用宽度就缩到二维码左边。
       这是 2026-10-02 **截图**才发现的问题 —— 横版写满 180 字时，中间几行正好撞在
       二维码上；而二维码是**后画的**，把字盖掉了。**两条像素判据都报绿**：
       底部那条安全带只取 x 0.15~0.72，二维码在 0.767~0.957，正好被排除在外。
       所以这里顺手把排版结果记下来，让「字不许被二维码压住」那条断言问得到。 */
  function drawUserText(x, y, w, h) {
    var raw = input ? String(input.value || '') : '';
    userLayout = null;
    if (!raw) return;
    var s = size();
    var q = col().qr;
    var qrTop = Math.round(q.y * s.h);              // 二维码那一行的上沿
    var gap = Math.round(s.w * 0.022);              // 字与二维码之间留的空隙
    var narrow = Math.round(q.x * s.w) - gap - x;
    if (narrow < Math.round(w * 0.4)) narrow = Math.round(w * 0.4);
    if (narrow > w) narrow = w;                     // 二维码本来就在栏外 → 规则等于没有
    var lay = layoutUserText(raw, w, h, Math.round(s.w * 0.028), function (f, i) {
      /* ⚠ 拿**行框**（top + 行高）判，不拿字形高度 —— 行与行之间有行距，
         拿字形判的话最后几行的字底会贴着二维码的头。 */
      return (y + (i + 1) * f * 1.85 > qrTop) ? narrow : w;
    });
    userLayout = { x: x, y: y, font: lay.font, lineH: lay.font * 1.85, lines: lay.lines };
    ctx.font = '300 ' + lay.font + 'px ' + FONT_STACK;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f0e6ff';
    ctx.globalAlpha = 0.94;
    for (var k = 0; k < lay.lines.length; k++) {
      ctx.fillText(lay.lines[k], x, y + k * lay.font * 1.85);
    }
    ctx.globalAlpha = 1;
  }

  /* ⚠ **只读**：访客的字在**二维码那一行**里最右到哪（画布比例；0 = 那一行里没有字）。
     给「字不许被二维码压住」那条断言用 —— 这件事**像素判不出来**：
     二维码是后画的，把字盖得严严实实，屏幕上看「一切正常」（2026-10-02 就是这么漏过去的）。 */
  function userEdgeInQrBand() {
    if (!userLayout) return 0;
    var s = size();
    var q = col().qr;
    var qrTop = q.y * s.h;
    var qrBottom = qrTop + q.r * 2 * s.w;          // r 是半边长，按**宽**算
    ctx.font = '300 ' + userLayout.font + 'px ' + FONT_STACK;
    var edge = 0;
    for (var i = 0; i < userLayout.lines.length; i++) {
      var top = userLayout.y + i * userLayout.lineH;
      if (top + userLayout.lineH < qrTop || top > qrBottom) continue;
      var w = ctx.measureText(userLayout.lines[i]).width;
      if (userLayout.x + w > edge) edge = userLayout.x + w;
    }
    return edge / s.w;
  }

  function draw() {
    var s = size();
    var c = col();
    ctx.clearRect(0, 0, s.w, s.h);

    // 背景：深紫黑 + 中心柔光
    ctx.fillStyle = '#0a0612';
    ctx.fillRect(0, 0, s.w, s.h);
    var g = ctx.createRadialGradient(s.w / 2, s.h * 0.42, 0, s.w / 2, s.h * 0.42, s.w * 0.72);
    g.addColorStop(0, 'rgba(45,27,78,0.95)');
    g.addColorStop(0.55, 'rgba(26,14,46,0.6)');
    g.addColorStop(1, 'rgba(10,6,18,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s.w, s.h);

    // 星屑
    for (var i = 0; i < 90; i++) {
      var x = Math.random() * s.w;
      var y = Math.random() * s.h;
      var rr = Math.random() * 1.6 + 0.3;
      ctx.globalAlpha = 0.15 + Math.random() * 0.5;
      ctx.fillStyle = Math.random() > 0.65 ? '#c77dff' : '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 四角水晶花
    var pad = Math.round(s.w * 0.052);
    var fr = Math.round(s.w * 0.019);
    flower(pad, pad, fr, 0.55);
    flower(s.w - pad, pad, fr, 0.55);
    flower(pad, s.h - pad, fr, 0.55);
    flower(s.w - pad, s.h - pad, fr, 0.55);

    // 内描边
    ctx.strokeStyle = 'rgba(255,200,221,0.16)';
    ctx.lineWidth = Math.max(1, Math.round(s.w * 0.0016));
    var m = Math.round(s.w * 0.031);
    ctx.strokeRect(m, m, s.w - m * 2, s.h - m * 2);

    // 左：立绘的相片框
    drawArt(Math.round(c.art.x * s.w), Math.round(c.art.y * s.h),
            Math.round(c.art.w * s.w), Math.round(c.art.h * s.h));

    // 右：她的台词 + 落款 + （下一步）访客写的字
    var tx = Math.round((c.art.x + c.art.w) * s.w + s.w * 0.045);
    var tw = s.w - tx - Math.round(s.w * 0.07);
    var ty = Math.round(s.h * (vert ? 0.175 : 0.24));
    var th = Math.round(s.h * (vert ? 0.70 : 0.60));
    var text = pool[current % pool.length];
    var fontSize = Math.round(s.w * 0.0335);
    var lineH = fontSize * 1.85;
    ctx.font = '300 ' + fontSize + 'px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    /* 右栏切成两块：**上面是她的台词**（含落款），**下面是访客写的字**。
       ⚠ 访客能写到 200 字，所以下面那块必须留得下 —— 上限在 layoutUserText 里兜底。 */
    var quoteH = Math.round(th * c.quoteShare);
    var userY = ty + quoteH + Math.round(s.h * 0.035);
    var userH = ty + th - userY;

    var lines = wrap(text, tw);
    if (lines.length * lineH > quoteH) {          // 台词太长就整块缩一档
      fontSize = Math.round(fontSize * 0.9);
      lineH = fontSize * 1.85;
      ctx.font = '300 ' + fontSize + 'px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      lines = wrap(text, tw);
    }
    ctx.save();
    ctx.shadowColor = 'rgba(255,200,221,0.45)';
    ctx.shadowBlur = Math.round(s.w * 0.018);
    ctx.fillStyle = '#ffc8dd';
    for (var k = 0; k < lines.length; k++) {
      ctx.fillText(lines[k], tx, ty + k * lineH);
    }
    ctx.restore();

    // 落款
    ctx.font = '300 ' + Math.round(s.w * 0.018) + 'px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#c77dff';
    ctx.globalAlpha = 0.92;
    ctx.textAlign = 'right';
    ctx.fillText('—— 爱莉希雅', tx + tw, ty + lines.length * lineH + fontSize * 0.5);
    ctx.globalAlpha = 1;

    // 分隔：一条很淡的横线 —— 上面是她说的话，下面是你写的
    ctx.strokeStyle = 'rgba(255,200,221,0.18)';
    ctx.lineWidth = Math.max(1, Math.round(s.w * 0.0012));
    ctx.beginPath();
    ctx.moveTo(tx, userY - Math.round(s.h * 0.018));
    ctx.lineTo(tx + tw * 0.34, userY - Math.round(s.h * 0.018));
    ctx.stroke();

    // 访客写的那句话
    drawUserText(tx, userY, tw, userH);

    // 右下角：二维码 + 域名
    var qx = Math.round(c.qr.x * s.w);
    var qy = Math.round(c.qr.y * s.h);
    var qr = Math.round(c.qr.r * s.w);
    drawQR(qx, qy, qr);
    ctx.font = '300 ' + Math.round(s.w * 0.0135) + 'px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(123,111,153,0.95)';
    ctx.textAlign = 'right';
    ctx.fillText('elysiad.top', qx + qr * 2, qy + qr * 2 + Math.round(s.w * 0.026));
  }

  function redraw() {
    makeCanvas();
    // ★ 关键：字体没就绪就落笔，会以 fallback 字体画，字形完全不同
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(draw);
    } else {
      draw();
    }
  }

  /* ── 接线 ──────────────────────────────────────────────────────────── */

  btnRedraw.addEventListener('click', function () {
    current = (current + 1) % pool.length;
    renderPrompts();                           // ⚠ 弹幕跟着台词换 —— 但**不清空**访客写的字
    redraw();
  });

  btnToggle.addEventListener('click', function () {
    vert = !vert;
    manual = true;
    btnToggle.setAttribute('aria-pressed', vert ? 'true' : 'false');
    tip.textContent = vert ? '当前：竖版 1080×1440' : '当前：横版 1200×800';
    redraw();
  });

  btnSave.addEventListener('click', function () {
    if (!canvas) return;
    canvas.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'elysia-postcard-' + size().w + 'x' + size().h + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }, 'image/png');
  });

  // 窗口尺寸变化时，只有用户没手动切过才跟随设备
  var t = null;
  window.addEventListener('resize', function () {
    if (manual) return;
    clearTimeout(t);
    t = setTimeout(function () {
      var shouldVert = window.innerWidth < 768;
      if (shouldVert !== vert) { vert = shouldVert; redraw(); }
    }, 260);
  });

  /* ── 访客写字 ──────────────────────────────────────────────────────────
     ⚠ 三件事：① **截到上限**（maxlength 拦不住粘贴）② 更新字数 ③ 防抖重画。
     ⚠ 只**重画**，绝不碰 input.value —— 那是访客的东西。 */
  var writeT = null;
  function syncWrite() {
    if (!input) return;
    if (input.value.length > MAX_USER) input.value = input.value.slice(0, MAX_USER);
    if (countEl) countEl.textContent = input.value.length + ' / ' + MAX_USER;
  }
  if (input) {
    input.addEventListener('input', function () {
      syncWrite();
      if (writeWrap) {
        if (input.value) writeWrap.classList.add('filled');
        else writeWrap.classList.remove('filled');
      }
      clearTimeout(writeT);
      writeT = setTimeout(redraw, 120);        // 防抖：敲字时别每一击都重画
    });
    input.addEventListener('focus', function () {
      if (writeWrap) writeWrap.classList.add('focused');
    });
    input.addEventListener('blur', function () {
      /* ⚠ 失焦时：**写了字就留着圆片**（访客可能还想再挑一句），空着才收起。 */
      if (writeWrap && !input.value) writeWrap.classList.remove('focused');
    });
    syncWrite();
  }
  renderPrompts();

  /* ── 立绘缩略图（spec §四）─────────────────────────────────────────────
     八张可选 + 一个「随机」。默认那张在页面加载时已经抽好了（上面 `cur` 那行）。
     ⚠ 换立绘**只动 `cur`** —— 不碰台词，也不碰访客已经写的字。 */
  function syncThumbs() {
    if (!artBox) return;
    var bs = artBox.getElementsByClassName('postcard-thumb');
    for (var i = 0; i < ART.length && i < bs.length; i++) {
      bs[i].setAttribute('aria-pressed', i === cur ? 'true' : 'false');
    }
  }

  function pickArt(i) {
    cur = i;
    syncThumbs();
    redraw();
  }

  if (artBox) {
    /* ⚠ 用**事件委托**：九个格子只挂一个监听。`e.target` 可能是格子里的 `<img>`
       （图占满整格），所以要往回走到 `.postcard-thumb` —— 不往回走的话，
       点在图上那一下会落空。 */
    artBox.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el !== artBox && el.className.indexOf('postcard-thumb') < 0) {
        el = el.parentNode;
      }
      if (!el || el === artBox) return;
      var who = el.getAttribute('data-art');
      if (who === 'random') {
        /* ⚠ 「随机」要**不等于现在这张** —— 抽到同一张的话，访客会以为按钮坏了。 */
        var n = cur;
        if (ART.length > 1) { while (n === cur) n = Math.floor(Math.random() * ART.length); }
        pickArt(n);
      } else {
        var idx = parseInt(who, 10);
        if (idx >= 0 && idx < ART.length) pickArt(idx);
      }
    });
  }
  syncThumbs();

  /* ── 弹幕圆片 ──────────────────────────────────────────────────────────
     ⚠ 取词是**每次现读** `window.POSTCARD_PROMPTS`，不在加载时缓存 ——
       这样那个文件整个加载失败时，页面只是「没有弹幕」，别的一概照常。
     ⚠ 键是**台词逐字**（含「」与省略号写法）—— 对不上就**一条都不出**（静默）。 */
  function promptWords() {
    var all = window.POSTCARD_PROMPTS;
    if (!all) return [];
    var key = pool[current % pool.length];
    var hits = all[key];
    return (hits && hits.length) ? hits : [];
  }

  function renderPrompts() {
    if (!promptsBox) return;
    promptsBox.innerHTML = '';
    var words = promptWords();
    for (var i = 0; i < words.length; i++) {
      (function (txt) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'postcard-chip';
        chip.textContent = txt;
        /* ⚠ 按下去时**抢在 blur 之前** preventDefault：不然点圆片会让输入框失焦，
           容器的「焦点时才显示」规则立刻把它藏起来，这一次点击就落空了。 */
        chip.addEventListener('mousedown', function (e) { e.preventDefault(); });
        chip.addEventListener('click', function () {
          if (!input) return;
          input.value = txt;                  // 只填进去，不直接上卡 —— 访客还能改
          if (writeWrap) writeWrap.classList.add('filled');
          syncWrite();
          clearTimeout(writeT);
          writeT = setTimeout(redraw, 120);
        });
        promptsBox.appendChild(chip);
      })(words[i]);
    }
  }

  /* ── 只读验收句柄 ────────────────────────────────────────────────────
     ⚠ 页面自己留的一小块**给验收读状态**的口子（`explore.js` 的
       `window.__ELY_EXPLORE__` 是同一个先例）。明信片整张画在 canvas 上、
       没有 DOM 可查，不留这个的话「立绘到底加载成没成」就只能靠像素猜。
     ⚠ 它**只读**（外加 setArt 那个真的换图动作，缩略图也用它）——
       不许往里塞「测试专用开关」（改行为的那种）。 */
  window.__ELY_POSTCARD__ = {
    col: col,
    art: function () { return cur; },
    artReady: artReady,
    artFailed: artFailed,
    qrReady: function () { return !!qrImg.ok; },
    qrFailed: qrFailed,
    artCount: function () { return ART.length; },
    userEdge: function () { return userEdgeInQrBand(); },
    /* ⚠ 缩略图点下去走的是**同一条路**（`pickArt`）——
       句柄里的 `setArt` 也是它，免得「验收走的路径」和「访客走的路径」悄悄分家。 */
    setArt: function (i) { pickArt(i); }
  };

  /* ── 开跑：先画一版，全部有结果（或超时）之后再画一版 ── */
  loadImages();
  redraw();
  var t0 = Date.now();
  var poll = setInterval(function () {
    if (imagesSettled() || Date.now() - t0 > LOAD_MS) {
      clearInterval(poll);
      redraw();
    }
  }, 120);
})();
