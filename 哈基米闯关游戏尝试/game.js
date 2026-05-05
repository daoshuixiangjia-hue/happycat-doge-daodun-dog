(function () {
  'use strict';

  const appEl = document.getElementById('app');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: true });
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayDesc = document.getElementById('overlay-desc');
  const btnStart = document.getElementById('btn-start');
  const levelTag = document.getElementById('level-tag');
  const hint = document.getElementById('hint');
  const toastEl = document.getElementById('toast');

  const LEVELS = [
    { name: '第一关', obstaclePxPerSec: 235, spawnIntervalMs: 1450, screens: 2 },
    { name: '第二关', obstaclePxPerSec: 335, spawnIntervalMs: 780, screens: 3 },
    { name: '第三关', obstaclePxPerSec: 485, spawnIntervalMs: 340, screens: 5 },
  ];

  const PLAYER_MAX_SPEED = 400;
  const VEL_SMOOTH = 26;
  const POINTER_VEL_SCALE = 0.48;
  const POINTER_VEL_CAP = 760;
  const POINTER_DRAG_DECAY = 22;
  const GOAL_FRAC = 0.08;
  const SOUND_PATHS = {
    bgm: [
      'assets/sounds/happy猫.mp3',
      'assets/sounds/happy猫.m4a',
      'assets/sounds/happy猫.wav',
      'assets/sounds/happyhappy.mp3',
      'assets/sounds/happyhappy.m4a',
    ],
    spawn: [
      'assets/sounds/我的刀盾.mp3',
      'assets/sounds/我的刀盾.m4a',
      'assets/sounds/我的刀盾.wav',
      'assets/sounds/daodun.mp3',
      'assets/sounds/wodedaodun.mp3',
    ],
    dieEpic: [
      'assets/sounds/夸张失败.mp3',
      'assets/sounds/夸张失败.m4a',
      'assets/sounds/失败.mp3',
      'assets/sounds/gameover.mp3',
      'assets/sounds/jile.mp3',
      'assets/sounds/die.mp3',
    ],
    cheer: [
      'assets/sounds/喝彩.mp3',
      'assets/sounds/喝彩.m4a',
      'assets/sounds/applause.mp3',
      'assets/sounds/cheer.mp3',
      'assets/sounds/欢呼.mp3',
    ],
  };

  const CAT_IMAGE_PATHS = [
    'assets/happy猫抠像后.gif',
    'assets/happy猫抠像后.webp',
    'assets/happy猫抠像后.png',
    'assets/happy猫.png',
    'assets/happy猫.webp',
    'assets/happy猫.gif',
    'assets/cat.png',
    'assets/cat.webp',
    'assets/cat.gif',
  ];

  const DOG_IMAGE_PATHS = [
    'assets/刀盾狗.gif',
    'assets/刀盾狗.png',
    'assets/刀盾狗.webp',
    'assets/刀盾狗.jpg',
    'assets/刀盾狗.jpeg',
    'assets/daodun-gou.gif',
    'assets/daodun-gou.png',
  ];

  let catBlobUrl = null;
  let catImg = null;
  let dogBlobUrl = null;
  let dogImg = null;
  let dogAspect = 1.25;

  let catIsAnimatedGif = false;
  let touchMovePulse = 0;

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0;
  let H = 0;
  let WORLD_H = 600;

  let state = 'menu';
  let levelIndex = 0;
  let obstacles = [];
  let spawnAcc = 0;
  let lastTs = 0;
  let keys = { up: false, down: false };
  let playerY = 0;
  let playerH = 72;
  let playerW = 56;

  let pointerId = null;
  let lastPointerY = 0;
  let lastPointerMoveTs = 0;
  let playerVelY = 0;
  let pointerDragVel = 0;

  const audios = {};

  let dogIsAnimatedGif = false;

  function mattingRemoveWhiteBackground(img) {
    return new Promise(function (resolve, reject) {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      if (!iw || !ih) {
        reject(new Error('size'));
        return;
      }
      const c = document.createElement('canvas');
      c.width = iw;
      c.height = ih;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      let imageData;
      try {
        imageData = x.getImageData(0, 0, iw, ih);
      } catch (err) {
        reject(err);
        return;
      }
      const p = imageData.data;
      const lumCut = 247;
      const soft = 22;
      for (let i = 0; i < p.length; i += 4) {
        const r = p[i];
        const g = p[i + 1];
        const b = p[i + 2];
        const maxv = Math.max(r, g, b);
        const minv = Math.min(r, g, b);
        const sat = maxv === 0 ? 0 : (maxv - minv) / maxv;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum >= lumCut && sat < 0.2) {
          p[i + 3] = 0;
        } else if (lum >= lumCut - soft && sat < 0.28) {
          const u = (lum - (lumCut - soft)) / soft;
          const na = Math.round((1 - Math.max(0, Math.min(1, u))) * p[i + 3]);
          p[i + 3] = na;
        }
      }
      x.putImageData(imageData, 0, 0);
      c.toBlob(function (blob) {
        if (!blob) {
          reject(new Error('blob'));
          return;
        }
        resolve(URL.createObjectURL(blob));
      }, 'image/png');
    });
  }

  function releaseCatBlobUrl() {
    if (catBlobUrl) {
      URL.revokeObjectURL(catBlobUrl);
      catBlobUrl = null;
    }
  }

  function loadCatAsset() {
    let idx = 0;
    function tryNext() {
      if (idx >= CAT_IMAGE_PATHS.length) {
        catImg = null;
        return;
      }
      const path = CAT_IMAGE_PATHS[idx];
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        const lower = path.toLowerCase();
        if (lower.endsWith('.gif')) {
          releaseCatBlobUrl();
          catIsAnimatedGif = true;
          catImg = img;
          return;
        }
        catIsAnimatedGif = false;
        mattingRemoveWhiteBackground(img).then(
          function (url) {
            releaseCatBlobUrl();
            catBlobUrl = url;
            const i2 = new Image();
            i2.onload = function () {
              catImg = i2;
            };
            i2.onerror = function () {
              catImg = img;
            };
            i2.src = url;
          },
          function () {
            releaseCatBlobUrl();
            catImg = img;
          }
        );
      };
      img.onerror = function () {
        idx += 1;
        tryNext();
      };
      img.src = path;
    }
    tryNext();
  }

  function syncWorldHeight() {
    const sc = LEVELS[levelIndex] && LEVELS[levelIndex].screens ? LEVELS[levelIndex].screens : 2;
    WORLD_H = Math.max(H * sc, H + 1);
  }

  function goalLineWorldY() {
    return H * GOAL_FRAC;
  }

  function cameraWorldY() {
    let cy = playerY - H * 0.52;
    const maxCam = Math.max(0, WORLD_H - H);
    cy = Math.max(0, Math.min(cy, maxCam));
    return cy;
  }

  function obstacleIntersectsViewport(o, camY) {
    return o.x + o.w > 0 && o.x < W && o.y + o.h > camY && o.y < camY + H;
  }

  function releaseDogBlobUrl() {
    if (dogBlobUrl) {
      URL.revokeObjectURL(dogBlobUrl);
      dogBlobUrl = null;
    }
  }

  function finishDogImage(img, path) {
    dogImg = img;
    dogAspect = img.naturalWidth / img.naturalHeight || 1.25;
    dogIsAnimatedGif = /\.gif$/i.test(path);
  }

  function loadDogAsset() {
    let idx = 0;
    function tryNext() {
      if (idx >= DOG_IMAGE_PATHS.length) {
        dogImg = null;
        dogAspect = 1.25;
        dogIsAnimatedGif = false;
        return;
      }
      const path = DOG_IMAGE_PATHS[idx];
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        const lower = path.toLowerCase();
        if (lower.endsWith('.gif')) {
          releaseDogBlobUrl();
          finishDogImage(img, path);
          return;
        }
        mattingRemoveWhiteBackground(img).then(
          function (url) {
            releaseDogBlobUrl();
            dogBlobUrl = url;
            const i2 = new Image();
            i2.onload = function () {
              finishDogImage(i2, path);
            };
            i2.onerror = function () {
              releaseDogBlobUrl();
              finishDogImage(img, path);
            };
            i2.src = url;
          },
          function () {
            releaseDogBlobUrl();
            finishDogImage(img, path);
          }
        );
      };
      img.onerror = function () {
        idx += 1;
        tryNext();
      };
      img.src = path;
    }
    tryNext();
  }

  function tryLoadAudio(key, paths) {
    let i = 0;
    function next() {
      if (i >= paths.length) return;
      const a = new Audio();
      a.preload = 'auto';
      a.src = paths[i];
      a.addEventListener(
        'canplaythrough',
        function onOk() {
          a.removeEventListener('canplaythrough', onOk);
          audios[key] = a;
        },
        { once: true }
      );
      a.addEventListener(
        'error',
        function onErr() {
          a.removeEventListener('error', onErr);
          i += 1;
          next();
        },
        { once: true }
      );
    }
    next();
  }

  function tryLoadBgm(paths) {
    let i = 0;
    function next() {
      if (i >= paths.length) return;
      const a = new Audio();
      a.preload = 'auto';
      a.loop = true;
      a.volume = 0.42;
      a.src = paths[i];
      a.addEventListener(
        'canplaythrough',
        function onOk() {
          a.removeEventListener('canplaythrough', onOk);
          audios.bgm = a;
        },
        { once: true }
      );
      a.addEventListener(
        'error',
        function onErr() {
          a.removeEventListener('error', onErr);
          i += 1;
          next();
        },
        { once: true }
      );
    }
    next();
  }

  function playSound(key) {
    const a = audios[key];
    if (!a) return;
    try {
      const clone = a.cloneNode();
      clone.volume =
        key === 'dieEpic' ? 1 : key === 'cheer' ? Math.min(1, (a.volume != null ? a.volume : 1) * 1.05) : a.volume != null ? a.volume : 1;
      clone.play().catch(function () {});
    } catch (_) {}
  }

  function playBgm() {
    const a = audios.bgm;
    if (!a) return;
    try {
      a.loop = true;
      a.volume = 0.42;
      a.play().catch(function () {});
    } catch (_) {}
  }

  function pauseBgm() {
    const a = audios.bgm;
    if (!a) return;
    try {
      a.pause();
    } catch (_) {}
  }

  function resize() {
    const prevWorld = WORLD_H;
    const prevPlayerY = playerY;
    const prevViewH = H;
    const rect = appEl ? appEl.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
    W = Math.max(1, Math.floor(rect.width));
    H = Math.max(1, Math.floor(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    playerH = Math.min(142, Math.max(78, H * 0.148));
    playerW = playerH * 0.74;
    syncWorldHeight();
    if ((state === 'playing' || state === 'gameover') && prevViewH > 0 && prevWorld > prevViewH) {
      const oldGy = prevViewH * GOAL_FRAC;
      const newGy = goalLineWorldY();
      const denom = prevWorld - oldGy;
      if (denom > 16) {
        const u = (prevPlayerY - oldGy) / denom;
        playerY = newGy + u * (WORLD_H - newGy);
      }
    }
    playerVelY *= 0.72;
    pointerDragVel = 0;
    clampPlayer();
  }

  function getPlayerYLimits() {
    const margin = 8;
    const gy = goalLineWorldY();
    return {
      top: Math.max(0, gy - playerH * 0.35),
      bottom: WORLD_H - margin - playerH * 0.48,
    };
  }

  function clampPlayer() {
    const lim = getPlayerYLimits();
    playerY = Math.max(lim.top, Math.min(lim.bottom, playerY));
  }

  function resetPlayerMotion() {
    playerVelY = 0;
    pointerDragVel = 0;
    lastPointerMoveTs = 0;
  }

  function drawPlayer() {
    const cx = W * 0.5;
    const moving =
      (state === 'playing' || state === 'gameover') &&
      (keys.up || keys.down || touchMovePulse > 0.055 || Math.abs(playerVelY) > 35);
    const idleHop = Math.sin(lastTs * 0.027) * (catIsAnimatedGif ? 8 : 12);
    const moveHop = moving ? Math.sin(lastTs * 0.076) * 11 : 0;
    const hop = idleHop + moveHop;

    if (catImg && catImg.complete && catImg.naturalHeight > 0) {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 2;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(catImg, cx - playerW * 0.5, playerY + hop - playerH * 0.52, playerW, playerH);
      ctx.restore();
      return;
    }

    ctx.fillStyle = '#c8c8cc';
    ctx.beginPath();
    ctx.arc(cx, playerY + hop, playerW * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSkyWorld() {
    const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    g.addColorStop(0, '#b8e0ff');
    g.addColorStop(0.45, '#7ec8e3');
    g.addColorStop(1, '#4a90a4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, WORLD_H);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    const cloudRx = Math.max(36, W * 0.11);
    const cloudRy = Math.max(14, W * 0.045);
    const band = Math.max(H * 0.14, 48);
    const nBands = Math.ceil(WORLD_H / band) + 2;
    for (let b = 0; b < nBands; b++) {
      for (let i = 0; i < 8; i++) {
        const y = (b * band + H * 0.15 * i + (lastTs * 0.02) % band) % WORLD_H;
        ctx.beginPath();
        ctx.ellipse(W * 0.15 + i * Math.min(90, W * 0.22), y, cloudRx, cloudRy, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const gy = goalLineWorldY();
    ctx.fillStyle = 'rgba(255, 230, 120, 0.35)';
    ctx.fillRect(0, 0, W, gy);
  }

  function drawGoalLineWorld() {
    const gy = goalLineWorldY();
    ctx.strokeStyle = 'rgba(255, 200, 80, 0.9)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.font = '600 ' + Math.max(12, W * 0.028) + 'px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('终点线', W * 0.5, gy * 0.55);
  }

  function drawObstacle(o) {
    const w = o.w;
    const h = o.h;
    const phase = o.phase || 0;
    const walkT = lastTs * 0.016 + phase;
    const bob = Math.sin(walkT * 2) * (dogIsAnimatedGif ? 5 : 10);
    const sway = Math.sin(walkT) * (dogIsAnimatedGif ? 5 : 8);
    const drawY = o.y + bob;
    const drawX = o.x + sway;

    if (dogImg && dogImg.complete && dogImg.naturalWidth > 0) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      if (o.fromLeft) {
        ctx.drawImage(dogImg, drawX, drawY, w, h);
      } else {
        ctx.translate(drawX + w, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(dogImg, 0, 0, w, h);
      }
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.fillStyle = '#6b5344';
    ctx.fillRect(drawX, drawY, w, h);
    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.arc(drawX + w * 0.35, drawY + h * 0.45, h * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function spawnObstacle() {
    const lvl = LEVELS[levelIndex];
    const dh = Math.min(152, Math.max(68, H * 0.155));
    const dw = dh * (dogAspect || 1.25);
    const gy = goalLineWorldY();
    const topSpawn = gy + H * 0.12 + dh;
    const bottomSpawn = WORLD_H - 14 - dh;
    const span = Math.max(48, bottomSpawn - topSpawn);
    const y = topSpawn + Math.random() * span;
    const fromLeft = Math.random() < 0.5;
    obstacles.push({
      x: fromLeft ? -dw - 6 : W + 6,
      y,
      w: dw,
      h: dh,
      vx: fromLeft ? lvl.obstaclePxPerSec : -lvl.obstaclePxPerSec,
      fromLeft,
      phase: Math.random() * Math.PI * 2,
      spawnSoundPlayed: false,
    });
  }

  function obstacleHitBox(o) {
    const ix = o.w * 0.125;
    const iy = o.h * 0.11;
    return {
      x: o.x + ix,
      y: o.y + iy,
      w: Math.max(8, o.w - ix * 2),
      h: Math.max(8, o.h - iy * 2),
    };
  }

  function playerBox() {
    const cx = W * 0.5;
    const cy = playerY;
    const pw = playerW * 0.82;
    const ph = playerH * 0.85;
    return {
      x: cx - pw * 0.5,
      y: cy - ph * 0.52,
      w: pw,
      h: ph,
    };
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function resetLevel(startIdx) {
    levelIndex = startIdx;
    obstacles = [];
    spawnAcc = 0;
    syncWorldHeight();
    resetPlayerMotion();
    playerY = WORLD_H - playerH * 1.2;
    clampPlayer();
    levelTag.textContent = LEVELS[levelIndex].name;
  }

  function resetCurrentLevel() {
    obstacles = [];
    spawnAcc = 0;
    syncWorldHeight();
    resetPlayerMotion();
    playerY = WORLD_H - playerH * 1.2;
    clampPlayer();
  }

  function showToast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      toastEl.classList.add('hidden');
    }, ms || 1600);
  }

  function gameOver() {
    state = 'gameover';
    touchMovePulse = 0;
    resetPlayerMotion();
    pauseBgm();
    playSound('dieEpic');
    overlayTitle.textContent = '寄了';
    overlayDesc.textContent = '碰到刀盾了，再试一次吧！';
    btnStart.textContent = '再来一局';
    overlay.classList.remove('hidden');
  }

  function levelWin() {
    playSound('cheer');
    if (levelIndex >= LEVELS.length - 1) {
      pauseBgm();
      state = 'won';
      overlayTitle.textContent = '通关！';
      overlayDesc.textContent = '你已经带着哈基米闯过三关，太强啦！';
      btnStart.textContent = '再玩一次';
      overlay.classList.remove('hidden');
      return;
    }
    showToast('进入「' + LEVELS[levelIndex + 1].name + '」', 1400);
    levelIndex += 1;
    obstacles = [];
    spawnAcc = 0;
    syncWorldHeight();
    resetPlayerMotion();
    playerY = WORLD_H - playerH * 1.2;
    clampPlayer();
    levelTag.textContent = LEVELS[levelIndex].name;
    state = 'playing';
  }

  function tick(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    if (state === 'playing') {
      pointerDragVel *= Math.exp(-POINTER_DRAG_DECAY * dt);

      let kb = 0;
      if (keys.up) kb -= PLAYER_MAX_SPEED;
      if (keys.down) kb += PLAYER_MAX_SPEED;
      kb = Math.max(-PLAYER_MAX_SPEED, Math.min(PLAYER_MAX_SPEED, kb));

      const targetVel = Math.max(
        -PLAYER_MAX_SPEED * 1.15,
        Math.min(PLAYER_MAX_SPEED * 1.15, kb + pointerDragVel)
      );
      const alpha = 1 - Math.exp(-VEL_SMOOTH * dt);
      playerVelY += (targetVel - playerVelY) * alpha;

      playerY += playerVelY * dt;
      touchMovePulse = Math.max(
        touchMovePulse * 0.92,
        Math.min(1, Math.abs(playerVelY) / 140 + Math.abs(pointerDragVel) / 400)
      );

      clampPlayer();
      const lim = getPlayerYLimits();
      if (playerY <= lim.top + 1 && playerVelY < 0) playerVelY = 0;
      if (playerY >= lim.bottom - 1 && playerVelY > 0) playerVelY = 0;

      const lvl = LEVELS[levelIndex];
      spawnAcc += dt * 1000;
      if (spawnAcc >= lvl.spawnIntervalMs) {
        spawnAcc -= lvl.spawnIntervalMs;
        spawnObstacle();
      }

      for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        o.x += o.vx * dt;
        if (o.vx > 0 && o.x > W + o.w + 40) obstacles.splice(i, 1);
        else if (o.vx < 0 && o.x < -o.w - 40) obstacles.splice(i, 1);
      }

      const camSound = cameraWorldY();
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (o.spawnSoundPlayed) continue;
        if (obstacleIntersectsViewport(o, camSound)) {
          o.spawnSoundPlayed = true;
          playSound('spawn');
        }
      }

      touchMovePulse *= 0.9;

      const pb = playerBox();
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        const ob = obstacleHitBox(o);
        if (aabb(pb, ob)) {
          gameOver();
          break;
        }
      }

      if (state === 'playing' && playerY <= goalLineWorldY() + playerH * 0.25) {
        state = 'levelpause';
        levelWin();
      }
    }

    const cam = cameraWorldY();
    ctx.save();
    ctx.translate(0, -cam);
    drawSkyWorld();
    drawGoalLineWorld();
    for (let i = 0; i < obstacles.length; i++) drawObstacle(obstacles[i]);
    drawPlayer();
    ctx.restore();

    requestAnimationFrame(tick);
  }

  window.addEventListener('keydown', function (e) {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      keys.up = true;
    }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      keys.down = true;
    }
  });

  window.addEventListener('keyup', function (e) {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = false;
  });

  canvas.addEventListener(
    'pointerdown',
    function (e) {
      if (state !== 'playing') return;
      pointerId = e.pointerId;
      lastPointerY = e.clientY;
      lastPointerMoveTs = performance.now();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (_) {}
    },
    { passive: true }
  );

  canvas.addEventListener(
    'pointermove',
    function (e) {
      if (state !== 'playing' || e.pointerId !== pointerId) return;
      const now = performance.now();
      const dtPtr = Math.min(0.06, Math.max(0.007, (now - lastPointerMoveTs) / 1000));
      lastPointerMoveTs = now;
      const dy = e.clientY - lastPointerY;
      lastPointerY = e.clientY;
      if (Math.abs(dy) < 0.25) return;
      const instVel = dy / dtPtr;
      pointerDragVel = Math.max(
        -POINTER_VEL_CAP,
        Math.min(POINTER_VEL_CAP, instVel * POINTER_VEL_SCALE)
      );
      touchMovePulse = 1;
    },
    { passive: true }
  );

  function endPointer(e) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    pointerDragVel *= 0.35;
    try {
      if (typeof canvas.hasPointerCapture === 'function' && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}
  }

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  btnStart.addEventListener('click', function () {
    touchMovePulse = 0;
    resetPlayerMotion();
    overlay.classList.add('hidden');
    if (state === 'won' || state === 'menu') {
      resetLevel(0);
    } else if (state === 'gameover') {
      resetCurrentLevel();
    }
    state = 'playing';
    playBgm();
    lastTs = 0;
  });

  window.addEventListener('resize', resize);

  tryLoadBgm(SOUND_PATHS.bgm);
  tryLoadAudio('spawn', SOUND_PATHS.spawn);
  tryLoadAudio('dieEpic', SOUND_PATHS.dieEpic);
  tryLoadAudio('cheer', SOUND_PATHS.cheer);

  loadCatAsset();
  loadDogAsset();

  resize();
  requestAnimationFrame(tick);
})();
