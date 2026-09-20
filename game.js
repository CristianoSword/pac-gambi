(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const COLS = 28;
  const ROWS = 31;
  const TILE = 16;
  const HEADER = 48;
  const FOOTER = 32;
  const WIDTH = COLS * TILE;
  const HEIGHT = HEADER + ROWS * TILE + FOOTER;

  const DIRS = {
    left: { x: -1, y: 0, key: "left" },
    right: { x: 1, y: 0, key: "right" },
    up: { x: 0, y: -1, key: "up" },
    down: { x: 0, y: 1, key: "down" },
    none: { x: 0, y: 0, key: "none" }
  };

  const OPPOSITE = {
    left: "right",
    right: "left",
    up: "down",
    down: "up",
    none: "none"
  };

  const BASE_MAZE = [
    "############################",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#o####.#####.##.#####.####o#",
    "#.####.#####.##.#####.####.#",
    "#..........................#",
    "#.####.##.########.##.####.#",
    "#.####.##.########.##.####.#",
    "#......##....##....##......#",
    "######.#####.##.#####.######",
    "     #.#####.##.#####.#     ",
    "     #.##..........##.#     ",
    "     #.##.###--###.##.#     ",
    "######.##.#      #.##.######",
    "      ....#      #....      ",
    "######.##.#      #.##.######",
    "     #.##.########.##.#     ",
    "     #.##..........##.#     ",
    "     #.##.########.##.#     ",
    "######.##.########.##.######",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#o..##................##..o#",
    "###.##.##.########.##.##.###",
    "###.##.##.########.##.##.###",
    "#......##....##....##......#",
    "#.##########.##.##########.#",
    "#.##########.##.##########.#",
    "#..........................#",
    "############################",
    "############################"
  ];

  const COLORS = {
    wall: "#153dff",
    wallGlow: "#3b7cff",
    pellet: "#f8dfbd",
    pacman: "#ffd638",
    text: "#f7f7ff",
    cyan: "#45e7ff",
    frightened: "#233cff",
    frightenedFlash: "#f7f7ff",
    eye: "#ffffff",
    pupil: "#1821c7"
  };

  const ghostConfigs = [
    { name: "blinky", color: "#ff3030", start: { x: 13, y: 11 }, corner: { x: 26, y: 1 } },
    { name: "pinky", color: "#ff9ad8", start: { x: 12, y: 14 }, corner: { x: 1, y: 1 } },
    { name: "inky", color: "#36e9d8", start: { x: 13, y: 14 }, corner: { x: 26, y: 29 } },
    { name: "clyde", color: "#ffad38", start: { x: 15, y: 14 }, corner: { x: 1, y: 29 } }
  ];

  const PACMAN_START = { x: 13, y: 22 };
  const GHOST_EXIT = { x: 13, y: 11 };
  const GHOST_HOME = { x: 13, y: 14 };
  const GHOST_EXIT_PATH = [
    { x: 13, y: 14 },
    { x: 13, y: 13 },
    { x: 13, y: 12 },
    GHOST_EXIT
  ];

  const state = {
    maze: [],
    pellets: 0,
    score: 0,
    highScore: Number(localStorage.getItem("pacmanHighScore") || 0),
    lives: 3,
    level: 1,
    mode: "ready",
    modeTimer: 0,
    frightenedTimer: 0,
    readyTimer: 2.2,
    deathTimer: 0,
    winTimer: 0,
    fruitTimer: 0,
    fruit: null,
    tick: 0,
    muted: false
  };

  let pacman;
  let ghosts;
  let audioCtx = null;
  let pacmanImg = null;
  let ghostImg = null;
  const now = () => {
    const value = window.performance && typeof window.performance.now === "function"
      ? window.performance.now()
      : Date.now();
    return Number.isFinite(value) ? value : Date.now();
  };
  const requestFrame = window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : (callback) => window.setTimeout(() => callback(now()), 1000 / 60);
  let lastTime = now();
  let accumulator = 0;
  let touchStart = null;

  window.__PACMAN_DEBUG__ = {
    snapshot: () => ({
      mode: state.mode,
      readyTimer: state.readyTimer,
      tick: state.tick,
      pacman: pacman ? { x: pacman.x, y: pacman.y, dir: pacman.dir.key } : null,
      ghosts: ghosts ? ghosts.map((ghost) => ({
        name: ghost.name,
        x: ghost.x,
        y: ghost.y,
        state: ghost.state,
        release: ghost.release,
        exitStep: ghost.exitStep
      })) : []
    })
  };

  function cloneMaze() {
    return BASE_MAZE.map((row) => row.split(""));
  }

  function resetLevel(keepScore = true) {
    state.maze = cloneMaze();
    state.pellets = 0;
    state.fruitTimer = 0;
    state.fruit = null;

    for (const row of state.maze) {
      for (const cell of row) {
        if (cell === "." || cell === "o") state.pellets += 1;
      }
    }

    if (!keepScore) {
      state.score = 0;
      state.lives = 3;
      state.level = 1;
    }

    resetActors();
    setReady();
  }

  function resetActors() {
    pacman = {
      x: PACMAN_START.x,
      y: PACMAN_START.y,
      dir: DIRS.left,
      nextDir: DIRS.left,
      mouth: 0,
      alive: true
    };

    ghosts = ghostConfigs.map((config, index) => ({
      ...config,
      x: config.start.x,
      y: config.start.y,
      dir: index === 0 ? DIRS.left : DIRS.up,
      state: index === 0 ? "active" : "home",
      release: index === 0 ? 0 : 0.35 + (index - 1) * 0.95,
      exitStep: 0,
      eaten: false
    }));
  }

  function setReady() {
    state.mode = "ready";
    state.readyTimer = 2.2;
    state.modeTimer = 0;
    state.frightenedTimer = 0;
  }

  function startPlay() {
    state.mode = "scatter";
    state.modeTimer = 7;
  }

  function nextMode() {
    if (state.mode === "scatter") {
      state.mode = "chase";
      state.modeTimer = 20;
    } else if (state.mode === "chase") {
      state.mode = "scatter";
      state.modeTimer = 7;
    }

    for (const ghost of ghosts) {
      if (ghost.state === "active") ghost.dir = DIRS[OPPOSITE[ghost.dir.key]];
    }
  }

  function playTone(freq, duration = 0.05, type = "square", gain = 0.025) {
    if (state.muted) return;
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const amp = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(gain, audioCtx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(amp).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }

  function unlockAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function tileAt(x, y) {
    if (x < 0 || x >= COLS) return " ";
    if (y < 0 || y >= ROWS) return "#";
    return state.maze[y][x];
  }

  function isWall(x, y) {
    return tileAt(x, y) === "#";
  }

  function canEnter(x, y, actor = "pacman") {
    const cell = tileAt(x, y);
    if (cell === "#") return false;
    if (cell === "-" && actor !== "ghost") return false;
    return true;
  }

  function isCentered(actor) {
    return Math.abs(actor.x - Math.round(actor.x)) < 0.05 && Math.abs(actor.y - Math.round(actor.y)) < 0.05;
  }

  function snap(actor) {
    actor.x = Math.round(actor.x);
    actor.y = Math.round(actor.y);
  }

  function wrap(actor) {
    if (actor.x < -0.9) actor.x = COLS - 0.1;
    if (actor.x > COLS - 0.1) actor.x = -0.9;
  }

  function canMove(actor, dir, kind) {
    if (dir.key === "none") return false;
    const cx = Math.round(actor.x);
    const cy = Math.round(actor.y);
    return canEnter(cx + dir.x, cy + dir.y, kind);
  }

  function moveActor(actor, dir, speed, dt, kind) {
    if (isCentered(actor)) {
      snap(actor);
      if (!canMove(actor, dir, kind)) return;
    }

    actor.x += dir.x * speed * dt;
    actor.y += dir.y * speed * dt;
    wrap(actor);
  }

  function updatePacman(dt) {
    if (!pacman.alive) return;

    const speed = 6.15 + Math.min(state.level - 1, 4) * 0.25;

    if (isCentered(pacman)) {
      snap(pacman);
      if (canMove(pacman, pacman.nextDir, "pacman")) pacman.dir = pacman.nextDir;
      if (!canMove(pacman, pacman.dir, "pacman")) pacman.dir = DIRS.none;
      eatPellet();
    }

    moveActor(pacman, pacman.dir, speed, dt, "pacman");
    pacman.mouth += dt * (pacman.dir.key === "none" ? 3 : 12);
  }

  function eatPellet() {
    const x = Math.round(pacman.x);
    const y = Math.round(pacman.y);
    const cell = tileAt(x, y);

    if (cell === "." || cell === "o") {
      state.maze[y][x] = " ";
      state.pellets -= 1;
      state.score += cell === "o" ? 50 : 10;
      playTone(cell === "o" ? 180 : 520, cell === "o" ? 0.13 : 0.035);

      if (cell === "o") {
        state.frightenedTimer = 7;
        for (const ghost of ghosts) {
          if (ghost.state === "active") {
            ghost.state = "frightened";
            ghost.dir = DIRS[OPPOSITE[ghost.dir.key]];
          }
        }
      }

      if (state.pellets === 170 && !state.fruit) spawnFruit();
      if (state.pellets === 70 && !state.fruit) spawnFruit();
      if (state.pellets <= 0) {
        state.mode = "level-clear";
        state.winTimer = 2.5;
        state.score += 1000;
        playTone(740, 0.2, "triangle", 0.04);
      }
    }

    if (state.fruit && Math.round(state.fruit.x) === x && Math.round(state.fruit.y) === y) {
      state.score += state.fruit.points;
      state.fruit = null;
      playTone(880, 0.18, "triangle", 0.04);
    }

    if (state.score > state.highScore) {
      state.highScore = state.score;
      localStorage.setItem("pacmanHighScore", String(state.highScore));
    }
  }

  function spawnFruit() {
    state.fruit = {
      x: 13,
      y: 17,
      time: 9,
      points: 100 + Math.min(state.level - 1, 7) * 100
    };
  }

  function updateFruit(dt) {
    if (!state.fruit) return;
    state.fruit.time -= dt;
    if (state.fruit.time <= 0) state.fruit = null;
  }

  function updateGhosts(dt) {
    if (state.frightenedTimer > 0) {
      state.frightenedTimer -= dt;
      if (state.frightenedTimer <= 0) {
        for (const ghost of ghosts) {
          if (ghost.state === "frightened") ghost.state = "active";
        }
      }
    }

    for (const ghost of ghosts) {
      if (ghost.state === "home") {
        ghost.release -= dt;
        if (ghost.release <= 0) {
          snap(ghost);
          ghost.exitStep = 0;
          ghost.state = "leaving";
        }
        continue;
      }

      if (ghost.state === "leaving") {
        updateLeavingGhost(ghost, dt);
        continue;
      }

      const speed = ghost.state === "eyes"
        ? 8.7
        : ghost.state === "frightened"
          ? 3.65
          : 5.45 + Math.min(state.level - 1, 4) * 0.2;

      if (isCentered(ghost)) {
        snap(ghost);
        if (ghost.state === "eyes" && distance(ghost, GHOST_HOME) < 0.5) {
          ghost.x = GHOST_HOME.x;
          ghost.y = GHOST_HOME.y;
          ghost.dir = DIRS.up;
          ghost.release = 1.2;
          ghost.exitStep = 0;
          ghost.state = "home";
          continue;
        }
        ghost.dir = chooseGhostDir(ghost);
      }

      moveActor(ghost, ghost.dir, speed, dt, "ghost");
    }
  }

  function updateLeavingGhost(ghost, dt) {
    const target = GHOST_EXIT_PATH[ghost.exitStep] || GHOST_EXIT;
    const speed = 5.2;
    const step = speed * dt;
    const dx = target.x - ghost.x;
    const dy = target.y - ghost.y;

    if (Math.abs(dx) <= 0.03 && Math.abs(dy) <= 0.03) {
      ghost.x = target.x;
      ghost.y = target.y;
      ghost.exitStep += 1;

      if (ghost.exitStep >= GHOST_EXIT_PATH.length) {
        ghost.x = GHOST_EXIT.x;
        ghost.y = GHOST_EXIT.y;
        ghost.dir = DIRS.left;
        ghost.state = state.frightenedTimer > 0 ? "frightened" : "active";
      }
      return;
    }

    if (Math.abs(dx) > 0.03) {
      const move = Math.sign(dx) * Math.min(Math.abs(dx), step);
      ghost.x += move;
      ghost.dir = move > 0 ? DIRS.right : DIRS.left;
      return;
    }

    const move = Math.sign(dy) * Math.min(Math.abs(dy), step);
    ghost.y += move;
    ghost.dir = move > 0 ? DIRS.down : DIRS.up;
  }

  function chooseGhostDir(ghost) {
    const target = getGhostTarget(ghost);
    return chooseGhostDirToTarget(ghost, target, ghost.state === "eyes");
  }

  function chooseGhostDirToTarget(ghost, target, allowReverse = false) {
    const options = [];
    const cx = Math.round(ghost.x);
    const cy = Math.round(ghost.y);

    for (const dir of [DIRS.left, DIRS.up, DIRS.right, DIRS.down]) {
      if (!allowReverse && dir.key === OPPOSITE[ghost.dir.key]) continue;
      if (canEnter(cx + dir.x, cy + dir.y, "ghost")) options.push(dir);
    }

    if (options.length === 0) return DIRS[OPPOSITE[ghost.dir.key]];
    if (ghost.state === "frightened") return options[Math.floor(Math.random() * options.length)];

    let best = options[0];
    let bestScore = Infinity;

    for (const dir of options) {
      const score = squaredDistance({ x: cx + dir.x, y: cy + dir.y }, target);
      if (score < bestScore) {
        best = dir;
        bestScore = score;
      }
    }

    return best;
  }

  function getGhostTarget(ghost) {
    if (ghost.state === "eyes") return GHOST_HOME;
    if (state.mode === "scatter") return ghost.corner;

    if (ghost.name === "blinky") return { x: pacman.x, y: pacman.y };
    if (ghost.name === "pinky") {
      return {
        x: pacman.x + pacman.dir.x * 4,
        y: pacman.y + pacman.dir.y * 4
      };
    }
    if (ghost.name === "inky") {
      const blinky = ghosts[0];
      const lead = {
        x: pacman.x + pacman.dir.x * 2,
        y: pacman.y + pacman.dir.y * 2
      };
      return {
        x: lead.x + (lead.x - blinky.x),
        y: lead.y + (lead.y - blinky.y)
      };
    }

    return distance(ghost, pacman) > 8 ? { x: pacman.x, y: pacman.y } : ghost.corner;
  }

  function checkCollisions() {
    if (!pacman.alive || state.mode !== "play" && state.mode !== "scatter" && state.mode !== "chase") return;

    for (const ghost of ghosts) {
      if (ghost.state === "home" || ghost.state === "eyes") continue;
      if (distance(pacman, ghost) < 0.65) {
        if (ghost.state === "frightened") {
          ghost.state = "eyes";
          state.score += 200;
          playTone(330, 0.16, "triangle", 0.05);
        } else {
          pacman.alive = false;
          state.mode = "dying";
          state.deathTimer = 1.8;
          playTone(120, 0.45, "sawtooth", 0.035);
        }
      }
    }
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function squaredDistance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function update(dt) {
    state.tick += dt;

    if (state.mode === "ready") {
      state.readyTimer -= dt;
      if (state.readyTimer <= 0) startPlay();
      return;
    }

    if (state.mode === "dying") {
      state.deathTimer -= dt;
      pacman.mouth += dt * 9;
      if (state.deathTimer <= 0) {
        state.lives -= 1;
        if (state.lives <= 0) {
          state.mode = "game-over";
        } else {
          resetActors();
          setReady();
        }
      }
      return;
    }

    if (state.mode === "game-over") return;

    if (state.mode === "level-clear") {
      state.winTimer -= dt;
      if (state.winTimer <= 0) {
        state.level += 1;
        resetLevel(true);
      }
      return;
    }

    state.modeTimer -= dt;
    if (state.modeTimer <= 0) nextMode();

    updatePacman(dt);
    updateGhosts(dt);
    updateFruit(dt);
    checkCollisions();
  }

  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    drawHeader();
    drawMaze();
    drawFruit();
    drawPacman();
    drawGhosts();
    drawFooter();
    drawOverlays();
  }

  function drawHeader() {
    ctx.fillStyle = COLORS.text;
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "left";
    ctx.fillText("1UP", 18, 15);
    ctx.fillText(String(state.score).padStart(6, "0"), 18, 34);

    ctx.textAlign = "center";
    ctx.fillText("HIGH SCORE", WIDTH / 2, 15);
    ctx.fillText(String(state.highScore).padStart(6, "0"), WIDTH / 2, 34);

    ctx.textAlign = "right";
    ctx.fillText(`FASE ${state.level}`, WIDTH - 18, 34);
  }

  function drawMaze() {
    ctx.save();
    ctx.translate(0, HEADER);

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = state.maze[y][x];
        if (cell === "#") drawWallTile(x, y);
        if (cell === ".") drawPellet(x, y, 2.1);
        if (cell === "o") {
          const pulse = 1 + Math.sin(state.tick * 8) * 0.18;
          drawPellet(x, y, 5.1 * pulse);
        }
      }
    }

    ctx.restore();
  }

  function drawWallTile(x, y) {
    const px = x * TILE;
    const py = y * TILE;
    const n = !isWall(x, y - 1);
    const s = !isWall(x, y + 1);
    const w = !isWall(x - 1, y);
    const e = !isWall(x + 1, y);

    ctx.fillStyle = "#061268";
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = 2;
    ctx.beginPath();

    if (n) {
      ctx.moveTo(px + 2, py + 2);
      ctx.lineTo(px + TILE - 2, py + 2);
    }
    if (s) {
      ctx.moveTo(px + 2, py + TILE - 2);
      ctx.lineTo(px + TILE - 2, py + TILE - 2);
    }
    if (w) {
      ctx.moveTo(px + 2, py + 2);
      ctx.lineTo(px + 2, py + TILE - 2);
    }
    if (e) {
      ctx.moveTo(px + TILE - 2, py + 2);
      ctx.lineTo(px + TILE - 2, py + TILE - 2);
    }

    ctx.stroke();
  }

  function drawPellet(x, y, radius) {
    ctx.fillStyle = COLORS.pellet;
    ctx.beginPath();
    ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function actorToPixels(actor) {
    return {
      x: actor.x * TILE + TILE / 2,
      y: HEADER + actor.y * TILE + TILE / 2
    };
  }

  function drawPacman() {
    if (!pacman) return;

    const p = actorToPixels(pacman);
    const size = TILE;

    if (pacmanImg && pacmanImg.complete) {
      ctx.drawImage(pacmanImg, p.x - size / 2, p.y - size / 2, size, size);
    } else {
      const radius = TILE * 0.48;
      let angle = Math.atan2(pacman.dir.y, pacman.dir.x);
      if (pacman.dir.key === "none") angle = 0;

      const bite = pacman.alive
        ? 0.18 + Math.abs(Math.sin(pacman.mouth)) * 0.56
        : Math.min(1.45, pacman.mouth * 0.25);

      ctx.fillStyle = COLORS.pacman;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.arc(p.x, p.y, radius, angle + bite / 2, angle + Math.PI * 2 - bite / 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawGhosts() {
    for (const ghost of ghosts) {
      if (ghost.state === "home" && Math.sin(state.tick * 8) < -0.2) {
        drawGhost(ghost, ghost.color);
      } else if (ghost.state === "frightened") {
        const flashing = state.frightenedTimer < 2 && Math.floor(state.tick * 8) % 2 === 0;
        drawGhost(ghost, flashing ? COLORS.frightenedFlash : COLORS.frightened, true);
      } else if (ghost.state === "eyes") {
        drawEyes(ghost);
      } else {
        drawGhost(ghost, ghost.color);
      }
    }
  }

  function drawGhost(ghost, color, scared = false) {
    const p = actorToPixels(ghost);
    const size = TILE * 3;

    if (ghostImg && ghostImg.complete && !scared) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(ghostImg, p.x - size / 2, p.y - size / 2, size, size);
      ctx.restore();
    } else {
      const r = TILE * 0.47;
      const top = p.y - r;
      const bottom = p.y + r;
      const left = p.x - r;
      const right = p.x + r;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 1, r, Math.PI, 0);
      ctx.lineTo(right, bottom - 3);
      for (let i = 0; i < 3; i++) {
        const x = right - (i + 0.5) * (r * 2 / 3);
        ctx.lineTo(x, bottom - (i % 2 === 0 ? 0 : 5));
      }
      ctx.lineTo(left, bottom - 3);
      ctx.lineTo(left, p.y - 1);
      ctx.closePath();
      ctx.fill();

      if (scared) {
        ctx.fillStyle = color === COLORS.frightenedFlash ? "#233cff" : "#f7f7ff";
        ctx.beginPath();
        ctx.arc(p.x - 4, p.y - 3, 1.5, 0, Math.PI * 2);
        ctx.arc(p.x + 4, p.y - 3, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x - 6, p.y + 6);
        ctx.lineTo(p.x - 2, p.y + 3);
        ctx.lineTo(p.x + 2, p.y + 6);
        ctx.lineTo(p.x + 6, p.y + 3);
        ctx.stroke();
        return;
      }

      drawEyes(ghost);
    }
  }

  function drawEyes(ghost) {
    const p = actorToPixels(ghost);
    const lookX = ghost.dir.x * 1.8;
    const lookY = ghost.dir.y * 1.8;

    ctx.fillStyle = COLORS.eye;
    ctx.beginPath();
    ctx.ellipse(p.x - 4.2, p.y - 3, 3.3, 4.2, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + 4.2, p.y - 3, 3.3, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.pupil;
    ctx.beginPath();
    ctx.arc(p.x - 4.2 + lookX, p.y - 3 + lookY, 1.7, 0, Math.PI * 2);
    ctx.arc(p.x + 4.2 + lookX, p.y - 3 + lookY, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFruit() {
    if (!state.fruit) return;

    const x = state.fruit.x * TILE + TILE / 2;
    const y = HEADER + state.fruit.y * TILE + TILE / 2;

    ctx.fillStyle = "#ff304c";
    ctx.beginPath();
    ctx.arc(x - 3, y + 1, 4.5, 0, Math.PI * 2);
    ctx.arc(x + 3, y + 1, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#31d46b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 2);
    ctx.quadraticCurveTo(x + 2, y - 8, x + 8, y - 9);
    ctx.stroke();
  }

  function drawFooter() {
    const y = HEADER + ROWS * TILE + 18;
    for (let i = 0; i < state.lives - 1; i++) {
      ctx.fillStyle = COLORS.pacman;
      ctx.beginPath();
      ctx.moveTo(22 + i * 22, y);
      ctx.arc(22 + i * 22, y, 8, 0.35, Math.PI * 2 - 0.35);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = COLORS.text;
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "right";
    ctx.fillText("SETAS/WASD  TOQUE/SWIPE  M: SOM", WIDTH - 12, y + 4);
  }

  function drawOverlays() {
    ctx.textAlign = "center";

    if (state.mode === "ready") {
      ctx.fillStyle = COLORS.pacman;
      ctx.font = "bold 18px Arial";
      ctx.fillText("READY!", WIDTH / 2, HEADER + 18 * TILE);
    }

    if (state.mode === "game-over") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#ff304c";
      ctx.font = "bold 28px Arial";
      ctx.fillText("GAME OVER", WIDTH / 2, HEIGHT / 2 - 18);
      ctx.fillStyle = COLORS.text;
      ctx.font = "bold 14px Arial";
      ctx.fillText("ENTER OU TOQUE PARA JOGAR DE NOVO", WIDTH / 2, HEIGHT / 2 + 18);
    }

    if (state.mode === "level-clear") {
      ctx.fillStyle = COLORS.cyan;
      ctx.font = "bold 18px Arial";
      ctx.fillText("FASE COMPLETA", WIDTH / 2, HEADER + 18 * TILE);
    }
  }

  function loop(timestamp) {
    const frameTime = Number.isFinite(timestamp) ? timestamp : now();
    const frame = Math.min((frameTime - lastTime) / 1000, 0.05);
    lastTime = frameTime;
    accumulator += frame;

    while (accumulator >= 1 / 60) {
      update(1 / 60);
      accumulator -= 1 / 60;
    }

    draw();
    requestFrame(loop);
  }

  function requestDirection(key) {
    if (DIRS[key]) pacman.nextDir = DIRS[key];
    unlockAudio();

    if (state.mode === "game-over") {
      resetLevel(false);
    }
  }

  function handleKey(event) {
    const keys = {
      ArrowLeft: "left",
      a: "left",
      A: "left",
      ArrowRight: "right",
      d: "right",
      D: "right",
      ArrowUp: "up",
      w: "up",
      W: "up",
      ArrowDown: "down",
      s: "down",
      S: "down"
    };

    if (keys[event.key]) {
      event.preventDefault();
      requestDirection(keys[event.key]);
    }

    if (event.key === "Enter" && state.mode === "game-over") {
      event.preventDefault();
      unlockAudio();
      resetLevel(false);
    }

    if (event.key === "m" || event.key === "M") {
      state.muted = !state.muted;
    }
  }

  function handleTouchStart(event) {
    unlockAudio();
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
    if (state.mode === "game-over") resetLevel(false);
  }

  function handleTouchEnd(event) {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;

    if (Math.hypot(dx, dy) < 18) return;
    requestDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  }

  function bindInput() {
    window.addEventListener("keydown", handleKey, { passive: false });
    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: false });

    for (const button of document.querySelectorAll(".pad-btn")) {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        requestDirection(button.dataset.dir);
      });
    }
  }

  function validateMaze() {
    if (BASE_MAZE.length !== ROWS) {
      throw new Error(`Mapa invalido: ${BASE_MAZE.length} linhas`);
    }
    BASE_MAZE.forEach((row, index) => {
      if (row.length !== COLS) throw new Error(`Linha ${index} tem ${row.length} colunas`);
    });

    validateOpenTile(PACMAN_START, "inicio do Pac-Man");
    validateOpenTile(GHOST_EXIT, "saida dos fantasmas");
    validateOpenTile(GHOST_HOME, "casa dos fantasmas");
    for (const point of GHOST_EXIT_PATH) validateOpenTile(point, "rota de saida dos fantasmas");
    for (const ghost of ghostConfigs) validateOpenTile(ghost.start, `inicio de ${ghost.name}`);
  }

  function validateOpenTile(point, label) {
    const cell = BASE_MAZE[point.y][point.x];
    if (cell === "#") {
      throw new Error(`${label} esta em uma parede: x=${point.x}, y=${point.y}`);
    }
  }

  validateMaze();
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  bindInput();
  
  pacmanImg = new Image();
  pacmanImg.src = "water.png";
  
  ghostImg = new Image();
  ghostImg.src = "fantasma.png";
  
  resetLevel(false);
  requestFrame(loop);
})();
