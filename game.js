const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("bestScore");
const startOverlay = document.getElementById("startOverlay");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const finalScoreText = document.getElementById("finalScoreText");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const musicToggle = document.getElementById("musicToggle");
const sfxToggle = document.getElementById("sfxToggle");

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;
const GROUND_HEIGHT = 90;
const PIPE_WIDTH = 75;
const PIPE_GAP = 220;
const PIPE_SPEED = 4.5;
const PIPE_INTERVAL_MS = 1200;

let musicEnabled = true;
let sfxEnabled = true;
let hasStarted = false;
let running = false;
let gameOver = false;

let lastTime = 0;
let pipeTimer = 0;

let score = 0;
let bestScore = Number(localStorage.getItem("sky-bird-best-score") || 0);
bestScoreEl.textContent = String(bestScore);

let bird = null;
let pipes = [];

let audioCtx = null;
let musicInterval = null;

// Load images
let pillarImage = new Image();
pillarImage.src = "pillar.jpeg";

// Load audio
let backgroundMusic = new Audio("music.mp3");
backgroundMusic.loop = true;
backgroundMusic.volume = 0.3;
let failSound = new Audio("fail.mp3");
failSound.loop = true;
failSound.volume = 0.5;

function createBird() {
  return {
    x: GAME_WIDTH * 0.28,
    y: GAME_HEIGHT * 0.45,
    radius: 18,
    velocityY: 0,
    gravity: 0.36,
    jumpPower: -9.5,
    rotation: 0
  };
}

function resetGameState() {
  bird = createBird();
  pipes = [];
  score = 0;
  pipeTimer = 0;
  gameOver = false;
  scoreEl.textContent = "0";
  finalScoreText.textContent = "Your score: 0";
  gameOverOverlay.classList.remove("show");
}

function makePipe() {
  // Difficulty scaling: reduce gap more aggressively as score increases
  const difficultyFactor = Math.floor(score / 3);
  const currentGap = Math.max(140, 250 - difficultyFactor * 15);
  
  const safeTop = 110;
  const safeBottom = GAME_HEIGHT - GROUND_HEIGHT - 110 - currentGap;
  const topHeight = Math.random() * (safeBottom - safeTop) + safeTop;
  return {
    x: GAME_WIDTH + PIPE_WIDTH,
    topHeight,
    bottomY: topHeight + currentGap,
    scored: false
  };
}

function setupAudio() {
  if (!audioCtx) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
    } catch (e) {
      console.warn("Audio context not available:", e);
      return;
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function playTone(freq, duration, type = "sine", volume = 0.04) {
  if (!audioCtx || !sfxEnabled) return;
  try {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
  } catch (e) {
    console.warn("Error playing tone:", e);
  }
}

function startMusicLoop() {
  if (!musicEnabled) return;
  if (backgroundMusic.paused) {
    backgroundMusic.play().catch(e => console.warn("Could not play background music:", e));
  }
}

function stopMusicLoop() {
  if (!backgroundMusic.paused) {
    backgroundMusic.pause();
  }
}

function flap() {
  if (!running || gameOver) return;
  bird.velocityY = bird.jumpPower;
  playTone(740, 0.14, "square", 0.035);
}

function endGame() {
  if (gameOver) return;
  gameOver = true;
  running = false;
  stopMusicLoop();
  
  // Stop background music and play fail sound on loop
  if (!backgroundMusic.paused) {
    backgroundMusic.pause();
  }
  failSound.currentTime = 0;
  failSound.play().catch(e => console.warn("Could not play fail sound:", e));
  
  finalScoreText.textContent = `Your score: ${score}`;
  gameOverOverlay.classList.add("show");
}

function updateGame(deltaMs) {
  // Dynamic difficulty: increase speed as score increases
  const speedMultiplier = 1 + (score * 0.05);
  const currentSpeed = PIPE_SPEED * speedMultiplier;
  
  bird.velocityY += bird.gravity;
  bird.y += bird.velocityY;
  bird.rotation = Math.max(-0.35, Math.min(1.1, bird.velocityY * 0.08));

  pipeTimer += deltaMs;
  
  // Dynamic spawn rate: pipes appear faster as score increases
  const spawnInterval = Math.max(800, PIPE_INTERVAL_MS - score * 15);
  if (pipeTimer >= spawnInterval) {
    pipeTimer = 0;
    pipes.push(makePipe());
  }

  for (let i = pipes.length - 1; i >= 0; i -= 1) {
    const pipe = pipes[i];
    pipe.x -= currentSpeed;

    if (!pipe.scored && pipe.x + PIPE_WIDTH < bird.x - bird.radius) {
      pipe.scored = true;
      score += 1;
      scoreEl.textContent = String(score);
      if (score > bestScore) {
        bestScore = score;
        bestScoreEl.textContent = String(bestScore);
        localStorage.setItem("sky-bird-best-score", String(bestScore));
      }
      playTone(960, 0.11, "triangle", 0.03);
    }

    const hitX = bird.x + bird.radius > pipe.x && bird.x - bird.radius < pipe.x + PIPE_WIDTH;
    const hitTop = bird.y - bird.radius < pipe.topHeight;
    const hitBottom = bird.y + bird.radius > pipe.bottomY;
    if (hitX && (hitTop || hitBottom)) {
      endGame();
      return;
    }

    if (pipe.x + PIPE_WIDTH < -5) {
      pipes.splice(i, 1);
    }
  }

  const hitGround = bird.y + bird.radius >= GAME_HEIGHT - GROUND_HEIGHT;
  const hitCeiling = bird.y - bird.radius <= 0;
  if (hitGround || hitCeiling) {
    endGame();
  }
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  sky.addColorStop(0, "#60a5fa");
  sky.addColorStop(1, "#bbf7d0");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.beginPath();
  ctx.arc(330, 120, 38, 0, Math.PI * 2);
  ctx.arc(360, 120, 30, 0, Math.PI * 2);
  ctx.arc(390, 122, 25, 0, Math.PI * 2);
  ctx.fill();
}

function drawPipes() {
  pipes.forEach((pipe) => {
    if (pillarImage.complete) {
      // Draw top pillar
      ctx.drawImage(pillarImage, pipe.x, 0, PIPE_WIDTH, pipe.topHeight);
      
      // Draw bottom pillar
      ctx.drawImage(pillarImage, pipe.x, pipe.bottomY, PIPE_WIDTH, GAME_HEIGHT - pipe.bottomY - GROUND_HEIGHT);
    }
  });
}

function drawGround() {
  ctx.fillStyle = "#854d0e";
  ctx.fillRect(0, GAME_HEIGHT - GROUND_HEIGHT, GAME_WIDTH, GROUND_HEIGHT);
  ctx.fillStyle = "#65a30d";
  ctx.fillRect(0, GAME_HEIGHT - GROUND_HEIGHT, GAME_WIDTH, 14);
}

function drawBird() {
  if (!bird) return;
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(bird.rotation);

  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.arc(0, 0, bird.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f97316";
  ctx.beginPath();
  ctx.moveTo(bird.radius - 2, 0);
  ctx.lineTo(bird.radius + 14, -4);
  ctx.lineTo(bird.radius + 14, 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.arc(5, -6, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawScene() {
  drawBackground();
  drawPipes();
  drawGround();
  drawBird();
}

function gameLoop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const deltaMs = Math.min(34, timestamp - lastTime);
  lastTime = timestamp;

  if (running && !gameOver) {
    updateGame(deltaMs);
  }
  drawScene();
  requestAnimationFrame(gameLoop);
}

function beginRun() {
  if (musicEnabled) {
    startMusicLoop();
  }
  if (!hasStarted) {
    hasStarted = true;
    startOverlay.classList.remove("show");
  }
  running = true;
}

function startGame() {
  // Stop fail sound and reset it
  if (!failSound.paused) {
    failSound.pause();
    failSound.currentTime = 0;
  }
  
  // Reset background music
  if (!backgroundMusic.paused) {
    backgroundMusic.pause();
  }
  backgroundMusic.currentTime = 0;
  
  resetGameState();
  beginRun();
}

startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", startGame);

musicToggle.addEventListener("click", () => {
  musicEnabled = !musicEnabled;
  musicToggle.textContent = `Music: ${musicEnabled ? "On" : "Off"}`;
  musicToggle.setAttribute("aria-pressed", String(musicEnabled));
  if (musicEnabled && running && !gameOver) {
    startMusicLoop();
  } else {
    stopMusicLoop();
  }
});

sfxToggle.addEventListener("click", () => {
  sfxEnabled = !sfxEnabled;
  sfxToggle.textContent = `SFX: ${sfxEnabled ? "On" : "Off"}`;
  sfxToggle.setAttribute("aria-pressed", String(sfxEnabled));
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "ArrowUp") {
    event.preventDefault();
    if (!running && !gameOver && hasStarted) {
      beginRun();
    } else if (running) {
      flap();
    }
  }
});

canvas.addEventListener("pointerdown", () => {
  if (!running && !gameOver && hasStarted) {
    beginRun();
    return;
  }
  flap();
});

drawScene();
requestAnimationFrame(gameLoop);