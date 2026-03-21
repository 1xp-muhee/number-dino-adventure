import './style.css'
import * as THREE from 'three'

const numberWords = ['영', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열']
const gameModes = ['egg', 'block']

const state = {
  reward: 0,
  streak: 0,
  mode: 'egg',
  target: 3,
  progress: 0,
  audioReady: false,
  userInteracted: false,
  locked: false,
  currentAudio: null,
  pendingAudio: null,
}

const app = document.querySelector('#app')
app.innerHTML = `
  <div class="game-shell">
    <header class="topbar card">
      <div>
        <div class="badge">🦖 three.js 숫자 게임</div>
        <h1>터치해서 놀아요</h1>
        <p class="subcopy">아이패드에서 탭하고 끌어서 숫자를 익히는 3D 놀이예요.</p>
      </div>
      <div class="stats">
        <div class="stat"><span>🥚</span><strong id="reward-count">0</strong></div>
        <div class="stat"><span>🔥</span><strong id="streak-count">0</strong></div>
        <div class="stat"><span>🎮</span><strong id="mode-label">알 깨기</strong></div>
      </div>
    </header>

    <section class="hud-grid">
      <section class="card mission-panel">
        <div class="section-chip">지금 할 일</div>
        <div class="target-number" id="target-number">3</div>
        <button class="speak-btn" id="speak-mission">🔊 다시 말해줘</button>
        <div class="mission-text" id="mission-text">알 3개를 톡톡 깨 보자!</div>
        <div class="progress-row">
          <div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div>
          <div class="progress-count" id="progress-count">0 / 3</div>
        </div>
      </section>

      <section class="card stage-panel">
        <div id="three-stage"></div>
        <div class="stage-overlay">
          <button class="overlay-btn primary" id="new-game">새 게임</button>
          <button class="overlay-btn" id="switch-mode">모드 바꾸기</button>
        </div>
      </section>
    </section>

    <section class="bottom-grid">
      <section class="card result-panel">
        <div class="section-chip orange">반응</div>
        <div class="result-badge" id="result-badge">준비!</div>
      </section>
      <section class="card tips-panel">
        <div class="section-chip blue">놀이 방식</div>
        <ul>
          <li><strong>알 깨기:</strong> 목표 숫자만큼 알을 탭해요.</li>
          <li><strong>블록 쌓기:</strong> 아래 블록을 탭해서 탑을 쌓아요.</li>
          <li>글보다 음성과 터치 중심이라 5살 아이에게 맞춰졌어요.</li>
        </ul>
      </section>
    </section>
  </div>
`

const elements = {
  rewardCount: document.querySelector('#reward-count'),
  streakCount: document.querySelector('#streak-count'),
  modeLabel: document.querySelector('#mode-label'),
  targetNumber: document.querySelector('#target-number'),
  missionText: document.querySelector('#mission-text'),
  progressFill: document.querySelector('#progress-fill'),
  progressCount: document.querySelector('#progress-count'),
  resultBadge: document.querySelector('#result-badge'),
  stage: document.querySelector('#three-stage'),
}

const baseUrl = import.meta.env.BASE_URL
const audioPath = (file) => `${baseUrl}audio/${file}`

const audioClips = {
  warmup: audioPath('warmup.mp3'),
  introEgg: audioPath('intro-egg.mp3'),
  success: audioPath('success.mp3'),
  retry: audioPath('retry.mp3'),
  mission: {
    egg: {
      1: audioPath('mission-egg-1.mp3'),
      2: audioPath('mission-egg-2.mp3'),
      3: audioPath('mission-egg-3.mp3'),
      4: audioPath('mission-egg-4.mp3'),
      5: audioPath('mission-egg-5.mp3'),
      6: audioPath('mission-egg-6.mp3'),
    },
    block: {
      1: audioPath('mission-block-1.mp3'),
      2: audioPath('mission-block-2.mp3'),
      3: audioPath('mission-block-3.mp3'),
      4: audioPath('mission-block-4.mp3'),
      5: audioPath('mission-block-5.mp3'),
      6: audioPath('mission-block-6.mp3'),
    },
  },
}

function speak(text) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'ko-KR'
  utterance.rate = 0.92
  utterance.pitch = 1.08
  window.speechSynthesis.speak(utterance)
}

function stopAudioPlayback() {
  if (state.currentAudio) {
    state.currentAudio.pause()
    state.currentAudio.currentTime = 0
    state.currentAudio = null
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

function playAudio(src, fallbackText) {
  if (!src) {
    if (fallbackText) speak(fallbackText)
    return
  }

  if (!state.userInteracted) {
    state.pendingAudio = { src, fallbackText }
    return
  }

  stopAudioPlayback()
  const audio = new Audio(src)
  audio.preload = 'auto'
  audio.playsInline = true
  state.currentAudio = audio
  audio.play().catch(() => {
    state.currentAudio = null
    state.pendingAudio = { src, fallbackText }
  })
  audio.addEventListener('ended', () => {
    if (state.currentAudio === audio) state.currentAudio = null
  })
}

function preloadAudio() {
  Object.values(audioClips).forEach((value) => {
    if (typeof value === 'string') {
      const audio = new Audio(value)
      audio.preload = 'auto'
      audio.load()
      return
    }
    Object.values(value).forEach((nested) => {
      Object.values(nested).forEach((src) => {
        const audio = new Audio(src)
        audio.preload = 'auto'
        audio.load()
      })
    })
  })
}

function playWarmup() {
  playAudio(audioClips.warmup, '안녕! 숫자 게임 시작!')
}

function playMissionSpeech() {
  const src = audioClips.mission[state.mode]?.[state.target]
  playAudio(src, missionSpeech())
}

function flushPendingAudio() {
  if (!state.pendingAudio) return
  const { src, fallbackText } = state.pendingAudio
  state.pendingAudio = null
  playAudio(src, fallbackText)
}

function warmupAudio() {
  state.userInteracted = true
  if (!state.audioReady) {
    state.audioReady = true
    preloadAudio()
    flushPendingAudio()
    return
  }
  flushPendingAudio()
}

function pickTarget() {
  return Math.floor(Math.random() * 6) + 1
}

function modeName(mode) {
  return mode === 'egg' ? '알 깨기' : '블록 쌓기'
}

function missionSpeech() {
  return state.mode === 'egg'
    ? `${numberWords[state.target]}! 알 ${state.target}개를 톡톡 깨 보자!`
    : `${numberWords[state.target]}! 블록 ${state.target}개를 쌓아 보자!`
}

function updateHUD() {
  elements.rewardCount.textContent = state.reward
  elements.streakCount.textContent = state.streak
  elements.modeLabel.textContent = modeName(state.mode)
  elements.targetNumber.textContent = state.target
  elements.missionText.textContent = state.mode === 'egg'
    ? `알 ${state.target}개를 톡톡 깨 보자!`
    : `블록 ${state.target}개를 차곡차곡 쌓아 보자!`
  elements.progressCount.textContent = `${state.progress} / ${state.target}`
  elements.progressFill.style.width = `${Math.min(100, (state.progress / state.target) * 100)}%`
}

function setResult(text, kind = 'idle') {
  elements.resultBadge.textContent = text
  elements.resultBadge.className = `result-badge ${kind}`
}

let renderer
let scene
let camera
let raycaster
let pointer
let dino
let floor
let ambientMeshes = []
let eggMeshes = []
let sourceBlocks = []
let stackedBlocks = []
let popBursts = []
let glow = 0

function setupScene() {
  const width = elements.stage.clientWidth
  const height = elements.stage.clientHeight

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height)
  elements.stage.innerHTML = ''
  elements.stage.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100)
  camera.position.set(0, 7.5, 10)
  camera.lookAt(0, 0.8, 0)
  raycaster = new THREE.Raycaster()
  pointer = new THREE.Vector2()

  scene.add(new THREE.AmbientLight(0xffffff, 1.9))
  const light = new THREE.DirectionalLight(0xffffff, 1.5)
  light.position.set(4, 8, 6)
  scene.add(light)

  floor = new THREE.Mesh(
    new THREE.CylinderGeometry(5.8, 6.4, 0.8, 40),
    new THREE.MeshStandardMaterial({ color: 0xffde7a })
  )
  floor.position.y = -0.7
  scene.add(floor)

  dino = makeDino()
  dino.position.set(0, 0, -2.2)
  scene.add(dino)

  ambientMeshes = Array.from({ length: 7 }, (_, i) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.55, 0.55),
      new THREE.MeshStandardMaterial({ color: [0xff6b6b, 0x4d96ff, 0x8ac926, 0xffc300][i % 4] })
    )
    mesh.position.set(-3 + i, 2.7 + (i % 2) * 0.35, i % 2 ? 2.4 : -0.2)
    scene.add(mesh)
    return mesh
  })

  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('resize', onResize)
  animate()
}

function makeDino() {
  const group = new THREE.Group()
  const green = new THREE.MeshStandardMaterial({ color: 0x5fd36d })
  const dark = new THREE.MeshStandardMaterial({ color: 0x3ead57 })
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.1, 32, 32), green)
  body.scale.set(1.4, 1, 1.8)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.76, 32, 32), green)
  head.position.set(1.3, 0.62, 0)
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2, 20), dark)
  tail.rotation.z = -1.2
  tail.position.set(-1.7, 0, 0)
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 })
  const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), eyeMat)
  const eye2 = eye1.clone()
  eye1.position.set(1.56, 0.82, 0.2)
  eye2.position.set(1.56, 0.82, -0.2)
  group.add(body, head, tail, eye1, eye2)
  ;[-0.42, 0.35].forEach((z) => {
    const leg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.95, 16), dark)
    const leg2 = leg1.clone()
    leg1.position.set(0.3, -1, z)
    leg2.position.set(-0.55, -1, z)
    group.add(leg1, leg2)
  })
  return group
}

function clearGameObjects() {
  ;[...eggMeshes, ...sourceBlocks, ...stackedBlocks].forEach((mesh) => scene.remove(mesh))
  eggMeshes = []
  sourceBlocks = []
  stackedBlocks = []
}

function startGame(mode = state.mode) {
  state.mode = mode
  state.target = pickTarget()
  state.progress = 0
  state.locked = false
  clearGameObjects()
  setResult('준비!', 'idle')
  updateHUD()

  if (mode === 'egg') {
    createEggField()
  } else {
    createBlockSources()
  }
  warmupAudio()
  playMissionSpeech()
}

function createEggField() {
  const total = Math.max(state.target + 2, 6)
  for (let i = 0; i < total; i += 1) {
    const egg = new THREE.Mesh(
      new THREE.SphereGeometry(0.48, 24, 24),
      new THREE.MeshStandardMaterial({ color: i < state.target ? 0xfff6ea : 0xe8f6ff })
    )
    egg.scale.y = 1.25
    egg.position.set(-3 + (i % 3) * 3, 0.25, i < 3 ? 1.6 : 4)
    egg.userData = { kind: 'egg', cracked: false }
    scene.add(egg)
    eggMeshes.push(egg)
  }
}

function createBlockSources() {
  const total = Math.max(state.target + 2, 6)
  const colors = [0xff6b6b, 0x4d96ff, 0xffc300, 0x8ac926]
  for (let i = 0; i < total; i += 1) {
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.6, 0.95),
      new THREE.MeshStandardMaterial({ color: colors[i % colors.length] })
    )
    block.position.set(-3.2 + i * 1.25, 0.3, 2.8)
    block.userData = { kind: 'source-block', used: false }
    scene.add(block)
    sourceBlocks.push(block)
  }
}

function spawnBurst(position) {
  const burst = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd166, emissiveIntensity: 0.8 })
  )
  burst.position.copy(position)
  burst.userData.life = 1
  scene.add(burst)
  popBursts.push(burst)
}

function handleEggTap(mesh) {
  if (mesh.userData.cracked || state.locked) return
  mesh.userData.cracked = true
  state.progress += 1
  spawnBurst(mesh.position)
  scene.remove(mesh)
  setResult('톡!', 'success')
  pulseScene(true)
  updateHUD()
  if (state.progress >= state.target) finishRound(true)
}

function handleBlockTap(mesh) {
  if (mesh.userData.used || state.locked) return
  mesh.userData.used = true
  const clone = mesh.clone()
  clone.position.set(0, 0.35 + stackedBlocks.length * 0.64, 1.25)
  scene.add(clone)
  stackedBlocks.push(clone)
  mesh.position.y = -10
  state.progress += 1
  setResult('착!', 'success')
  pulseScene(true)
  updateHUD()
  if (state.progress >= state.target) finishRound(true)
}

function finishRound(success) {
  state.locked = true
  if (success) {
    state.reward += 1
    state.streak += 1
    setResult('딩동댕!', 'success')
    playAudio(audioClips.success, '맞았어! 정말 잘했어!')
    glow = 1.2
  } else {
    state.streak = 0
    setResult('한 번 더!', 'retry')
    playAudio(audioClips.retry, '한 번 더 해보자!')
  }
  updateHUD()
  setTimeout(() => {
    const nextMode = state.mode === 'egg' ? 'block' : 'egg'
    startGame(nextMode)
  }, 2600)
}

function onPointerDown(event) {
  warmupAudio()
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const intersects = raycaster.intersectObjects(state.mode === 'egg' ? eggMeshes : sourceBlocks)
  if (!intersects.length) return
  const picked = intersects[0].object
  if (state.mode === 'egg') handleEggTap(picked)
  else handleBlockTap(picked)
}

function onResize() {
  if (!renderer) return
  const width = elements.stage.clientWidth
  const height = elements.stage.clientHeight
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}

function pulseScene(success) {
  glow = success ? 0.8 : -0.45
}

function animate(time = 0) {
  requestAnimationFrame(animate)
  const t = time * 0.001
  dino.rotation.y = Math.sin(t * 1.2) * 0.25
  dino.position.y = Math.sin(t * 2.2) * 0.14
  ambientMeshes.forEach((mesh, i) => {
    mesh.rotation.x = t + i * 0.4
    mesh.rotation.y = t * 0.8 + i
    mesh.position.y = 2.6 + Math.sin(t * 1.7 + i) * 0.18 + (i % 2) * 0.25
  })
  eggMeshes.forEach((egg, i) => {
    if (!egg.userData.cracked) egg.position.y = 0.25 + Math.sin(t * 2 + i) * 0.05
  })
  sourceBlocks.forEach((block, i) => {
    if (!block.userData.used) block.rotation.y = Math.sin(t + i) * 0.15
  })
  popBursts = popBursts.filter((burst) => {
    burst.userData.life -= 0.04
    burst.scale.setScalar(1 + (1 - burst.userData.life) * 2)
    burst.material.opacity = Math.max(0, burst.userData.life)
    burst.material.transparent = true
    if (burst.userData.life <= 0) {
      scene.remove(burst)
      return false
    }
    return true
  })
  if (glow !== 0) {
    dino.scale.setScalar(1 + glow * 0.05)
    glow *= 0.88
  } else {
    dino.scale.setScalar(1)
  }
  renderer.render(scene, camera)
}

document.querySelector('#speak-mission').addEventListener('click', () => {
  warmupAudio()
  playMissionSpeech()
})
document.querySelector('#new-game').addEventListener('click', () => startGame(state.mode))
document.querySelector('#switch-mode').addEventListener('click', () => startGame(state.mode === 'egg' ? 'block' : 'egg'))

setupScene()
updateHUD()
startGame('egg')
