/**
 * 语录明信片生成
 *
 * 尺寸：视口 < 768px → 1080×1440（3:4，手机全屏 / 朋友圈 / 小红书）
 *       否则         → 1200×800（3:2，电脑 / 平板 / 文档配图）
 * 另给手动切换——用电脑的人常是为了存下来发朋友圈，设备对了心思不一定对。
 *
 * 台词来自 window.QUOTES.daily（与首页「飞花寄语」同一份，不新增内容）。
 */
(function () {
  var pool = (window.QUOTES && window.QUOTES.daily) || [];
  var host = document.getElementById('postcardPreview');
  var btnRedraw = document.getElementById('postcardRedraw');
  var btnToggle = document.getElementById('postcardToggle');
  var btnSave = document.getElementById('postcardSave');
  var tip = document.getElementById('postcardTip');
  if (!pool.length || !host || !btnRedraw) return;

  var VERTICAL = { w: 1080, h: 1440 };
  var HORIZONTAL = { w: 1200, h: 800 };
  var vert = window.innerWidth < 768;      // 默认跟随设备
  var manual = false;                       // 用户是否手动切过

  var current = 0;
  var canvas = null;
  var ctx = null;

  function size() { return vert ? VERTICAL : HORIZONTAL; }

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

  function draw() {
    var s = size();
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

    // 台词
    var text = pool[current % pool.length];
    var fontSize = Math.round(s.w * 0.036);
    ctx.font = '300 ' + fontSize + 'px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    var lines = wrap(text, s.w * 0.76);
    var lineH = fontSize * 1.85;
    var startY = s.h * 0.47 - ((lines.length - 1) * lineH) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(255,200,221,0.45)';
    ctx.shadowBlur = Math.round(s.w * 0.022);
    ctx.fillStyle = '#ffc8dd';
    for (var k = 0; k < lines.length; k++) {
      ctx.fillText(lines[k], s.w / 2, startY + k * lineH);
    }
    ctx.restore();

    // 落款
    ctx.font = '300 ' + Math.round(s.w * 0.019) + 'px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#c77dff';
    ctx.globalAlpha = 0.92;
    ctx.fillText('—— 爱莉希雅', s.w / 2, startY + lines.length * lineH + fontSize * 0.9);
    ctx.globalAlpha = 1;

    // 底部落款
    ctx.font = '300 ' + Math.round(s.w * 0.0135) + 'px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(123,111,153,0.95)';
    ctx.fillText('elysiad.top', s.w / 2, s.h - Math.round(s.h * 0.038));
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

  btnRedraw.addEventListener('click', function () {
    current = (current + 1) % pool.length;
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

  redraw();
})();
