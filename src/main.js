import './style.css'
import * as THREE from 'three'

const numberWords = ['영', '하나', '둘', '셋', '넷', '다섯', '여섯']
const gameModes = ['egg', 'block']
const modeMeta = {
  egg: { label: '알 모드', prep: '알을 세는 미션', accent: 0xffd966 },
  block: { label: '블록 모드', prep: '블록을 세는 미션', accent: 0x72c9ff },
}

const app = document.querySelector('#app')
app.innerHTML = `
  <div class="game-shell">
    <div id="three-stage"></div>
    <div class="world-hud">
      <div class="logo-badge">
        🦖 숫자 공룡 마을
        <small>아래 버튼 누르고 숫자를 골라요</small>
      </div>
      <div class="score-row">
        <div class="score-chip"><span>모드</span><strong id="mode-label">알 모드</strong></div>
        <div class="score-chip"><span>별</span><strong id="reward-count">0</strong></div>
        <div class="score-chip"><span>연속</span><strong id="streak-count">0</strong></div>
      </div>
    </div>
    <div class="mobile-controls">
      <button id="ui-mode-egg" class="ui-btn egg">알 고르기</button>
      <button id="ui-start" class="ui-btn start">문제 시작</button>
      <button id="ui-mode-block" class="ui-btn block">블록 고르기</button>
      <button id="ui-replay" class="ui-btn replay">문제 다시 듣기</button>
    </div>
    <div class="hint-panel">
      <strong id="hint-title">월드 시작!</strong>
      <p id="hint-text">아래 버튼으로 모드를 고르고, 문제를 시작한 뒤 맞는 숫자를 눌러요.</p>
    </div>
  </div>
`

const elements = {
  stage: document.querySelector('#three-stage'),
  rewardCount: document.querySelector('#reward-count'),
  streakCount: document.querySelector('#streak-count'),
  modeLabel: document.querySelector('#mode-label'),
  hintTitle: document.querySelector('#hint-title'),
  hintText: document.querySelector('#hint-text'),
  uiModeEgg: document.querySelector('#ui-mode-egg'),
  uiModeBlock: document.querySelector('#ui-mode-block'),
  uiStart: document.querySelector('#ui-start'),
  uiReplay: document.querySelector('#ui-replay'),
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
      1: audioPath('mission-egg-1.mp3'), 2: audioPath('mission-egg-2.mp3'), 3: audioPath('mission-egg-3.mp3'),
      4: audioPath('mission-egg-4.mp3'), 5: audioPath('mission-egg-5.mp3'), 6: audioPath('mission-egg-6.mp3'),
    },
    block: {
      1: audioPath('mission-block-1.mp3'), 2: audioPath('mission-block-2.mp3'), 3: audioPath('mission-block-3.mp3'),
      4: audioPath('mission-block-4.mp3'), 5: audioPath('mission-block-5.mp3'), 6: audioPath('mission-block-6.mp3'),
    },
  },
}

const state = {
  reward: 0,
  streak: 0,
  mode: 'egg',
  target: 3,
  stage: 'ready',
  locked: false,
  userInteracted: false,
  audioReady: false,
  currentAudio: null,
  audioQueue: [],
  audioPlaying: false,
}

let renderer
let scene
let camera
let raycaster
let pointer
let clock
let missionBoardSurface
let dinoGuide
let dinoJaw
let dinoTail
let terrainGroup
let controlGroup
let choiceGroup
let decoGroup
let effectGroup
let missionBoard
const interactables = []
const pulses = []
const floaters = []
const bursts = []
const buttonSurfaces = new Map()
const choiceLabelSurfaces = []
const scheduled = []
const cameraTarget = new THREE.Vector3(0, 3.8, 0.6)

function setHint(title, text) {
  elements.hintTitle.textContent = title
  elements.hintText.textContent = text
}

function updateHUD() {
  elements.rewardCount.textContent = state.reward
  elements.streakCount.textContent = state.streak
  elements.modeLabel.textContent = modeMeta[state.mode].label

  elements.uiModeEgg.classList.toggle('active', state.mode === 'egg')
  elements.uiModeBlock.classList.toggle('active', state.mode === 'block')
  elements.uiStart.textContent = state.stage === 'won' ? '다음 문제' : '문제 시작'
}

function speak(_text) {
}

function stopVoicePlayback() {
  if (state.currentAudio) {
    state.currentAudio.pause()
    state.currentAudio.currentTime = 0
    state.currentAudio = null
  }
  state.audioPlaying = false
  state.audioQueue = []
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

function playQueueEntry(entry) {
  if (!entry) {
    state.audioPlaying = false
    return
  }

  if (!state.userInteracted) {
    state.audioQueue.unshift(entry)
    state.audioPlaying = false
    return
  }

  if (entry.src) {
    const audio = new Audio(entry.src)
    audio.preload = 'auto'
    audio.playsInline = true
    state.currentAudio = audio
    state.audioPlaying = true
    audio.play().then(() => {
      audio.addEventListener('ended', () => {
        if (state.currentAudio === audio) state.currentAudio = null
        const next = state.audioQueue.shift()
        playQueueEntry(next)
      }, { once: true })
    }).catch(() => {
      state.currentAudio = null
      state.audioPlaying = false
      setHint('소리 다시 켜기', '아이폰에서 소리가 막혔어요. 아래 다시 듣기 버튼을 한 번 눌러 주세요.')
    })
    return
  }

  state.audioPlaying = false
}

function queueVoice(entries, { replace = false } = {}) {
  const normalized = entries.filter(Boolean)
  if (!normalized.length) return

  if (replace) {
    if (state.currentAudio) {
      state.currentAudio.pause()
      state.currentAudio.currentTime = 0
      state.currentAudio = null
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    state.audioQueue = []
    state.audioPlaying = false
  }

  state.audioQueue.push(...normalized)
  if (!state.audioPlaying) {
    const next = state.audioQueue.shift()
    playQueueEntry(next)
  }
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

function ensureInteractionReady() {
  state.userInteracted = true
  if (!state.audioReady) {
    state.audioReady = true
    preloadAudio()
  }
  if (!state.audioPlaying && state.audioQueue.length) {
    const next = state.audioQueue.shift()
    playQueueEntry(next)
  }
}

function pickTarget() {
  return Math.floor(Math.random() * 6) + 1
}

function missionPrompt() {
  return state.mode === 'egg'
    ? `${numberWords[state.target]}! 알 ${state.target}개를 골라 보자!`
    : `${numberWords[state.target]}! 블록 ${state.target}개를 골라 보자!`
}

function missionClip() {
  return audioClips.mission[state.mode]?.[state.target]
}

function createCanvasSurface(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return { canvas, ctx, texture }
}

function createBasicTextureMesh(surface, width, height) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: surface.texture, transparent: true }),
  )
}

function fillRoundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
  ctx.fill()
}

function makeVoxel(material, size, position) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material)
  mesh.position.copy(position)
  return mesh
}

function createHitBox(width, height, depth, y = height / 2) {
  const hitBox = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
  )
  hitBox.position.y = y
  return hitBox
}

function registerInteractable(root, onTap) {
  root.userData.onTap = onTap
  root.traverse((child) => {
    child.userData.root = root
    if (child.isMesh) interactables.push(child)
  })
}

function resolveTapTarget(object) {
  let current = object
  while (current) {
    if (current.userData?.onTap) return current
    current = current.parent
  }
  return object.userData?.root ?? null
}

function createLights() {
  scene.background = new THREE.Color(0x90d8ff)
  scene.fog = new THREE.Fog(0x90d8ff, 40, 95)

  scene.add(new THREE.AmbientLight(0xffffff, 2.4))

  const sun = new THREE.DirectionalLight(0xffffff, 2.2)
  sun.position.set(18, 24, 8)
  scene.add(sun)

  const bounce = new THREE.DirectionalLight(0xaad8ff, 0.9)
  bounce.position.set(-12, 8, 20)
  scene.add(bounce)
}

function createTerrain() {
  terrainGroup = new THREE.Group()
  scene.add(terrainGroup)

  const brightGrassMaterial = new THREE.MeshStandardMaterial({ color: 0x6fd46b, roughness: 1 })
  const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x5fc95d, roughness: 1 })
  const dirtMaterial = new THREE.MeshStandardMaterial({ color: 0xc78d54, roughness: 1 })
  const dirtDarkMaterial = new THREE.MeshStandardMaterial({ color: 0x9d6e40, roughness: 1 })

  for (let x = -8; x <= 8; x += 1) {
    for (let z = -8; z <= 8; z += 1) {
      for (let depth = 0; depth <= 1; depth += 1) {
        const cube = new THREE.Mesh(
          new THREE.BoxGeometry(2, 2, 2),
          depth === 1 ? ((x + z) % 2 === 0 ? grassMaterial : brightGrassMaterial) : ((x + z) % 2 === 0 ? dirtMaterial : dirtDarkMaterial),
        )
        cube.position.set(x * 2, depth * 2, z * 2)
        terrainGroup.add(cube)
      }
    }
  }

  const pathMaterial = new THREE.MeshStandardMaterial({ color: 0xe8c27a, roughness: 1 })
  for (let i = -4; i <= 4; i += 1) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.7, 2.1), pathMaterial)
    step.position.set(i * 2.2, 4.35, 6.1 - Math.abs(i) * 0.22)
    terrainGroup.add(step)
  }

  const water = new THREE.Mesh(
    new THREE.BoxGeometry(34, 0.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x49b4ff, transparent: true, opacity: 0.88, roughness: 0.2, metalness: 0.08 }),
  )
  water.position.set(0, 1.5, 17)
  terrainGroup.add(water)
}

function createTree(position, leafColor) {
  const group = new THREE.Group()
  group.position.copy(position)
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8a5930, roughness: 1 })
  const leavesMaterial = new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.86 })
  group.add(makeVoxel(trunkMaterial, new THREE.Vector3(1.2, 3.8, 1.2), new THREE.Vector3(0, 3.2, 0)))
  group.add(makeVoxel(leavesMaterial, new THREE.Vector3(3.5, 2.6, 3.5), new THREE.Vector3(0, 6.3, 0)))
  group.add(makeVoxel(leavesMaterial, new THREE.Vector3(2.6, 2, 2.6), new THREE.Vector3(0, 8, 0)))
  decoGroup.add(group)
}

function createCloud(position, scale) {
  const cloud = new THREE.Group()
  cloud.position.copy(position)
  cloud.userData.baseX = position.x
  cloud.userData.drift = 0.3 + Math.random() * 0.2
  cloud.userData.phase = Math.random() * Math.PI * 2
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 })
  ;[
    [-1.4, 0, 0, 2.2, 1.4, 1.8],
    [0, 0.3, 0, 2.6, 1.8, 2.1],
    [1.8, -0.1, 0.2, 1.9, 1.3, 1.7],
  ].forEach(([x, y, z, sx, sy, sz]) => {
    const puff = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material)
    puff.position.set(x, y, z)
    cloud.add(puff)
  })
  cloud.scale.setScalar(scale)
  decoGroup.add(cloud)
  floaters.push({ mesh: cloud, baseY: position.y, amplitude: 0.25, speed: 0.25 + Math.random() * 0.12, phase: cloud.userData.phase, drift: true })
}

function createSkyDecor() {
  createTree(new THREE.Vector3(-14, 2, -10), 0x5dcc6a)
  createTree(new THREE.Vector3(-15, 2, -2), 0x7be480)
  createTree(new THREE.Vector3(15, 2, -8), 0x6cd879)
  createTree(new THREE.Vector3(14, 2, 0), 0x92ea6f)
  createTree(new THREE.Vector3(12, 2, -14), 0x80df70)
  createTree(new THREE.Vector3(-11, 2, 2), 0x57c75c)
  createCloud(new THREE.Vector3(-15, 20, -24), 1.8)
  createCloud(new THREE.Vector3(10, 22, -22), 1.5)
  createCloud(new THREE.Vector3(2, 18, -18), 1.2)
  const sun = new THREE.Mesh(new THREE.SphereGeometry(2.7, 24, 24), new THREE.MeshBasicMaterial({ color: 0xfff0a2 }))
  sun.position.set(-16, 23, -32)
  scene.add(sun)
}

function drawMissionBoard() {
  const { ctx, canvas, texture } = missionBoardSurface
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, '#fff8da')
  gradient.addColorStop(1, '#ffe6a2')
  ctx.fillStyle = gradient
  fillRoundRect(ctx, 28, 28, canvas.width - 56, canvas.height - 56, 44)

  ctx.fillStyle = '#704100'
  ctx.textAlign = 'center'
  ctx.font = '900 70px Pretendard, sans-serif'
  ctx.fillText('공룡 미션 보드', canvas.width / 2, 120)

  ctx.font = '800 54px Pretendard, sans-serif'
  ctx.fillText(modeMeta[state.mode].label, canvas.width / 2, 215)

  ctx.fillStyle = '#2b4d9b'
  ctx.font = '900 280px Pretendard, sans-serif'
  ctx.fillText(String(state.target), canvas.width / 2, 520)

  ctx.fillStyle = '#6d5610'
  ctx.font = '800 64px Pretendard, sans-serif'
  ctx.fillText(numberWords[state.target], canvas.width / 2, 610)

  ctx.fillStyle = '#234'
  ctx.font = '700 44px Pretendard, sans-serif'
  const statusText = state.stage === 'playing'
    ? '반짝이는 숫자 오브젝트를 골라요!'
    : state.stage === 'won'
      ? '성공! 초록 블록으로 다음 미션!'
      : '초록 출발 블록을 눌러요!'
  ctx.fillText(statusText, canvas.width / 2, 770)

  ctx.font = '700 40px Pretendard, sans-serif'
  ctx.fillText(`별 ${state.reward}   ·   연속 ${state.streak}`, canvas.width / 2, 860)
  texture.needsUpdate = true

  if (state.stage === 'playing') {
    setHint('지금 할 일', `${missionPrompt()} 맞는 숫자를 눌러 주세요.`)
  } else if (state.stage === 'won') {
    setHint('잘했어요!', '아래 문제 시작 버튼을 눌러 다음 문제로 가요.')
  } else {
    setHint('준비 완료', `${modeMeta[state.mode].prep}. 아래 문제 시작 버튼을 눌러요.`)
  }
}

function createMissionBoard() {
  missionBoard = new THREE.Group()
  missionBoard.position.set(0, 2.3, -12.3)

  const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x8a5528, roughness: 1 })
  const darkWoodMaterial = new THREE.MeshStandardMaterial({ color: 0x6b3c1e, roughness: 1 })

  const leftPost = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9.4, 1.2), woodMaterial)
  leftPost.position.set(-5.1, 4.4, 0)
  missionBoard.add(leftPost)

  const rightPost = leftPost.clone()
  rightPost.position.x = 5.1
  missionBoard.add(rightPost)

  const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(10.5, 10.2, 0.8), darkWoodMaterial)
  boardFrame.position.set(0, 5.1, 0.1)
  missionBoard.add(boardFrame)

  missionBoardSurface = createCanvasSurface(1024, 1120)
  const frontPanel = createBasicTextureMesh(missionBoardSurface, 9.5, 10.35)
  frontPanel.position.set(0, 5.1, 0.52)
  missionBoard.add(frontPanel)

  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0xd34d3f, roughness: 1 })
  const roofLeft = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.8, 2), roofMaterial)
  roofLeft.position.set(-1.5, 9.9, 0)
  roofLeft.rotation.z = Math.PI / 7
  missionBoard.add(roofLeft)

  const roofRight = roofLeft.clone()
  roofRight.position.x = 1.5
  roofRight.rotation.z = -Math.PI / 7
  missionBoard.add(roofRight)

  controlGroup.add(missionBoard)
}

function createDinoGuide() {
  dinoGuide = new THREE.Group()
  dinoGuide.position.set(-10.5, 3.2, -9.6)

  const skin = new THREE.MeshStandardMaterial({ color: 0x67d85b, roughness: 0.86 })
  const skinDark = new THREE.MeshStandardMaterial({ color: 0x42ac49, roughness: 0.92 })
  const cheek = new THREE.MeshStandardMaterial({ color: 0xf7b97f, roughness: 1 })
  const eye = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 })
  const pupil = new THREE.MeshStandardMaterial({ color: 0x1e2e3f, roughness: 1 })

  const body = new THREE.Group()
  body.add(makeVoxel(skin, new THREE.Vector3(4.4, 3.6, 6), new THREE.Vector3(0, 3.4, 0)))
  body.add(makeVoxel(skinDark, new THREE.Vector3(3.2, 3, 2.8), new THREE.Vector3(1.5, 6, 1.5)))
  body.add(makeVoxel(cheek, new THREE.Vector3(2.4, 1.4, 2.2), new THREE.Vector3(1.4, 5.2, 3.1)))
  body.add(makeVoxel(skinDark, new THREE.Vector3(1.1, 4.8, 1.1), new THREE.Vector3(-1.2, 1.8, 1.4)))
  body.add(makeVoxel(skinDark, new THREE.Vector3(1.1, 4.8, 1.1), new THREE.Vector3(1.2, 1.8, 1.4)))
  body.add(makeVoxel(skinDark, new THREE.Vector3(0.9, 3, 0.9), new THREE.Vector3(1.9, 5.2, 0.3)))
  body.add(makeVoxel(skinDark, new THREE.Vector3(0.9, 3, 0.9), new THREE.Vector3(1.9, 5.2, 2.7)))

  const jawPivot = new THREE.Group()
  jawPivot.position.set(2.7, 4.7, 3.4)
  dinoJaw = makeVoxel(cheek, new THREE.Vector3(2.5, 0.8, 2.2), new THREE.Vector3(0, -0.2, 0))
  jawPivot.add(dinoJaw)
  body.add(jawPivot)

  body.add(makeVoxel(eye, new THREE.Vector3(0.9, 0.9, 0.3), new THREE.Vector3(2.3, 6.3, 2.4)))
  body.add(makeVoxel(eye, new THREE.Vector3(0.9, 0.9, 0.3), new THREE.Vector3(2.3, 6.3, 0.7)))
  body.add(makeVoxel(pupil, new THREE.Vector3(0.3, 0.3, 0.4), new THREE.Vector3(2.55, 6.2, 2.4)))
  body.add(makeVoxel(pupil, new THREE.Vector3(0.3, 0.3, 0.4), new THREE.Vector3(2.55, 6.2, 0.7)))

  const tail = new THREE.Group()
  tail.position.set(-2.1, 4.6, 0)
  tail.add(makeVoxel(skinDark, new THREE.Vector3(4.6, 1.4, 1.4), new THREE.Vector3(-2.1, 0, 0)))
  tail.rotation.z = -0.18
  dinoTail = tail
  body.add(tail)

  dinoGuide.add(body)
  controlGroup.add(dinoGuide)
  floaters.push({ mesh: dinoGuide, baseY: dinoGuide.position.y, amplitude: 0.22, speed: 1.3, phase: 0.3 })
}

function drawButtonSurface(surface, { title, subtitle, primary, secondary, text, active }) {
  const { ctx, canvas, texture } = surface
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, primary)
  gradient.addColorStop(1, secondary)
  ctx.fillStyle = gradient
  fillRoundRect(ctx, 16, 16, canvas.width - 32, canvas.height - 32, 34)

  ctx.strokeStyle = active ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)'
  ctx.lineWidth = active ? 12 : 6
  ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56)

  ctx.textAlign = 'center'
  ctx.fillStyle = text
  ctx.font = '900 62px Pretendard, sans-serif'
  ctx.fillText(title, canvas.width / 2, 110)
  ctx.font = '800 34px Pretendard, sans-serif'
  ctx.fillText(subtitle, canvas.width / 2, 170)
  texture.needsUpdate = true
}

function createPedestal(config) {
  const group = new THREE.Group()
  group.position.copy(config.position)
  group.userData.id = config.id

  const rock = new THREE.MeshStandardMaterial({ color: 0x8ea3b8, roughness: 1 })
  const rockDark = new THREE.MeshStandardMaterial({ color: 0x627387, roughness: 1 })
  const glowMat = new THREE.MeshStandardMaterial({ color: config.color, emissive: config.color, emissiveIntensity: 0.55, roughness: 0.45 })

  const base = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.8, 3.6), rock)
  base.position.y = 0.9
  group.add(base)

  const middle = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 2.4), rockDark)
  middle.position.y = 2.6
  group.add(middle)

  const plate = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 3), rock)
  plate.position.y = 4
  group.add(plate)

  const ornament = config.buildTop(glowMat)
  ornament.position.y = 5.4
  group.add(ornament)

  const signSurface = createCanvasSurface(512, 256)
  const sign = createBasicTextureMesh(signSurface, 4.6, 2.3)
  sign.position.set(0, 8.1, 0.2)
  group.add(sign)

  group.add(createHitBox(4.6, 7.8, 4.6, 4))
  group.userData.ornament = ornament
  buttonSurfaces.set(config.id, signSurface)
  pulses.push({ mesh: ornament, scale: 0.08, speed: config.speed ?? 2.2, phase: Math.random() * Math.PI * 2 })
  registerInteractable(group, config.onTap)
  controlGroup.add(group)
  return group
}

function createControls() {
  const eggPedestal = createPedestal({
    id: 'mode-egg',
    position: new THREE.Vector3(-32, 2.2, -18),
    color: 0xffdd74,
    speed: 2.4,
    buildTop(material) {
      const egg = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 24), material)
      egg.scale.y = 1.25
      return egg
    },
    onTap: () => switchMode('egg'),
  })

  const blockPedestal = createPedestal({
    id: 'mode-block',
    position: new THREE.Vector3(32, 2.2, -18),
    color: 0x78d3ff,
    speed: 2.1,
    buildTop(material) {
      const stack = new THREE.Group()
      const a = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.9, 1.9), material)
      const b = a.clone()
      b.scale.set(0.82, 0.82, 0.82)
      b.position.y = 1.45
      stack.add(a, b)
      return stack
    },
    onTap: () => switchMode('block'),
  })

  const startPedestal = createPedestal({
    id: 'start',
    position: new THREE.Vector3(-48, 2.2, 28),
    color: 0x8cff71,
    speed: 2.7,
    buildTop(material) {
      const button = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.1, 2.5), material)
      button.rotation.y = Math.PI / 4
      return button
    },
    onTap: () => startRound(),
  })

  const replayPedestal = createPedestal({
    id: 'replay',
    position: new THREE.Vector3(48, 2.2, 28),
    color: 0xff79c8,
    speed: 2.3,
    buildTop(material) {
      return new THREE.Mesh(new THREE.OctahedronGeometry(1.35, 0), material)
    },
    onTap: () => replayMissionPrompt(),
  })

  controlGroup.userData.pedestals = { egg: eggPedestal, block: blockPedestal, start: startPedestal, replay: replayPedestal }
}

function updateControlLabels() {
  const isEgg = state.mode === 'egg'
  const isBlock = state.mode === 'block'

  drawButtonSurface(buttonSurfaces.get('mode-egg'), {
    title: '알', subtitle: isEgg ? '선택됨' : '고르기', primary: '#ffe479', secondary: '#ffbc4b', text: '#5d3b00', active: isEgg,
  })
  drawButtonSurface(buttonSurfaces.get('mode-block'), {
    title: '블록', subtitle: isBlock ? '선택됨' : '고르기', primary: '#8ce8ff', secondary: '#38afff', text: '#0a4164', active: isBlock,
  })
  drawButtonSurface(buttonSurfaces.get('start'), {
    title: state.stage === 'won' ? '다음 문제' : '시작', subtitle: '문제 보기', primary: '#a6ff88', secondary: '#42cb56', text: '#12401d', active: true,
  })
  drawButtonSurface(buttonSurfaces.get('replay'), {
    title: '다시 듣기', subtitle: '문제 음성', primary: '#ffb5e1', secondary: '#ff6ebd', text: '#6b174e', active: state.stage === 'playing',
  })
}

function clearChoiceGroup() {
  while (choiceGroup.children.length) {
    choiceGroup.remove(choiceGroup.children[0])
  }
  choiceLabelSurfaces.length = 0
}

function drawChoiceLabel(surface, value, theme) {
  const { ctx, canvas, texture } = surface
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, theme.top)
  gradient.addColorStop(1, theme.bottom)
  ctx.fillStyle = gradient
  fillRoundRect(ctx, 18, 18, canvas.width - 36, canvas.height - 36, 36)
  ctx.textAlign = 'center'
  ctx.fillStyle = theme.text
  ctx.font = '900 116px Pretendard, sans-serif'
  ctx.fillText(String(value), canvas.width / 2, 158)
  ctx.font = '800 38px Pretendard, sans-serif'
  ctx.fillText(`${numberWords[value]} 개`, canvas.width / 2, 220)
  texture.needsUpdate = true
}

function buildChoiceLabel(value, mode) {
  const surface = createCanvasSurface(360, 260)
  drawChoiceLabel(surface, value, mode === 'egg'
    ? { top: '#fff2a2', bottom: '#ffd061', text: '#754900' }
    : { top: '#b3ecff', bottom: '#63bfff', text: '#0b476a' })
  choiceLabelSurfaces.push(surface)
  const label = createBasicTextureMesh(surface, 2.85, 2.05)
  label.position.set(0, 6.1, 0.2)
  return label
}

function createNest(value, position) {
  const group = new THREE.Group()
  group.position.copy(position)
  const strawMaterial = new THREE.MeshStandardMaterial({ color: 0xe2af52, roughness: 1 })
  const eggMaterial = new THREE.MeshStandardMaterial({ color: 0xfff6df, roughness: 0.9 })
  const eggShine = new THREE.MeshStandardMaterial({ color: 0xfff0ba, roughness: 0.8 })
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.85, 1.05, 16), strawMaterial)
  base.position.y = 2.9
  group.add(base)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.42, 12, 24), strawMaterial)
  ring.rotation.x = Math.PI / 2
  ring.position.y = 3.15
  group.add(ring)
  const eggOffsets = [[0,0],[-0.72,-0.28],[0.72,0.28],[-0.78,0.78],[0.86,-0.68],[0,0.96]]
  for (let index = 0; index < value; index += 1) {
    const [x, z] = eggOffsets[index]
    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 20), index % 2 === 0 ? eggMaterial : eggShine)
    egg.scale.y = 1.38
    egg.position.set(x, 3.82 + (index % 2) * 0.04, z)
    group.add(egg)
  }
  const label = buildChoiceLabel(value, 'egg')
  label.position.y = 6.55
  group.add(label)
  group.add(createHitBox(5.2, 6.4, 5.2, 4.6))
  group.userData.value = value
  registerInteractable(group, () => handleChoice(group))
  pulses.push({ mesh: group, scale: 0.04, speed: 1.5 + value * 0.12, phase: value * 0.45 })
  choiceGroup.add(group)
}

function createBlockTower(value, position) {
  const group = new THREE.Group()
  group.position.copy(position)
  const palette = [0xff8f70,0xffcd55,0x80dd73,0x5cc8ff,0xc39aff,0xff86cc]
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.95, 3.2), new THREE.MeshStandardMaterial({ color: 0x8a6f52, roughness: 1 }))
  base.position.y = 2.7
  group.add(base)
  for (let index = 0; index < value; index += 1) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.4, 2.1), new THREE.MeshStandardMaterial({ color: palette[index % palette.length], roughness: 0.82 }))
    block.position.y = 3.8 + index * 1.32
    block.rotation.y = (index % 2) * 0.12
    group.add(block)
  }
  const label = buildChoiceLabel(value, 'block')
  label.position.y = 8.1
  group.add(label)
  group.add(createHitBox(5.2, 10.4, 5.2, 6))
  group.userData.value = value
  registerInteractable(group, () => handleChoice(group))
  pulses.push({ mesh: group, scale: 0.04, speed: 1.4 + value * 0.1, phase: value * 0.38 })
  choiceGroup.add(group)
}

function buildChoiceField() {
  clearChoiceGroup()
  const positions = [
    new THREE.Vector3(-13.5, 0, -0.4), new THREE.Vector3(-8.1, 0, 1.2), new THREE.Vector3(-2.7, 0, -0.3),
    new THREE.Vector3(2.7, 0, -0.3), new THREE.Vector3(8.1, 0, 1.2), new THREE.Vector3(13.5, 0, -0.4),
  ]
  positions.forEach((position, index) => {
    const value = index + 1
    if (state.mode === 'egg') createNest(value, position)
    else createBlockTower(value, position)
  })
}

function prepareMission() {
  clearChoiceGroup()
  state.locked = false
  state.stage = 'ready'
  state.target = pickTarget()
  drawMissionBoard()
  updateControlLabels()
  updateHUD()
}

function switchMode(mode) {
  if (!gameModes.includes(mode)) return
  state.mode = mode
  stopVoicePlayback()
  prepareMission()
  queueVoice([{ src: missionClip() }], { replace: true })
}

function replayMissionPrompt() {
  if (state.stage !== 'playing') {
    queueVoice([{ src: missionClip() }], { replace: true })
    return
  }
  queueVoice([{ src: missionClip() }], { replace: true })
}

function startRound() {
  stopVoicePlayback()
  if (state.stage === 'won' || state.stage === 'playing') state.target = pickTarget()
  state.stage = 'playing'
  state.locked = false
  buildChoiceField()
  drawMissionBoard()
  updateControlLabels()
  updateHUD()
  const promptEntries = []
  if (state.mode === 'egg' && state.reward === 0 && state.streak === 0) {
    promptEntries.push({ src: audioClips.introEgg })
  }
  promptEntries.push({ src: missionClip() })
  queueVoice(promptEntries, { replace: true })
}

function spawnBurst(position, color, amount = 20) {
  for (let index = 0; index < amount; index += 1) {
    const particle = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 0.28),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.5 }),
    )
    particle.position.copy(position)
    particle.position.y += 1 + Math.random() * 1.5
    bursts.push({ mesh: particle, velocity: new THREE.Vector3((Math.random() - 0.5) * 6, 3.5 + Math.random() * 4, (Math.random() - 0.5) * 4), spin: new THREE.Vector3(Math.random() * 4, Math.random() * 4, Math.random() * 4), age: 0, life: 0.9 + Math.random() * 0.5 })
    effectGroup.add(particle)
  }
}

function schedule(fn, delayMs) {
  scheduled.push({ fn, delayMs, elapsed: 0 })
}

function handleCorrect(choice) {
  state.locked = true
  state.stage = 'won'
  state.reward += state.target
  state.streak += 1
  spawnBurst(choice.getWorldPosition(new THREE.Vector3()), state.mode === 'egg' ? 0xffd85d : 0x86d9ff, 26)
  queueVoice([{ src: audioClips.success }], { replace: true })
  drawMissionBoard()
  updateControlLabels()
  updateHUD()
  schedule(() => clearChoiceGroup(), 520)
}

function handleWrong(choice) {
  state.locked = false
  state.streak = 0
  spawnBurst(choice.getWorldPosition(new THREE.Vector3()), 0xff7f6a, 10)
  queueVoice([{ src: audioClips.retry }], { replace: true })
  drawMissionBoard()
  updateHUD()
}

function handleChoice(choice) {
  if (state.stage !== 'playing' || state.locked) return
  const value = choice.userData.value
  if (value === state.target) handleCorrect(choice)
  else handleWrong(choice)
}

function handleTap(clientX, clientY) {
  ensureInteractionReady()
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const intersections = raycaster.intersectObjects(interactables, true)
  if (!intersections.length) return
  const root = resolveTapTarget(intersections[0].object)
  root?.userData?.onTap?.()
}

function onPointerDown(event) {
  handleTap(event.clientX, event.clientY)
}

function onTouchStart(event) {
  const touch = event.changedTouches?.[0]
  if (!touch) return
  event.preventDefault()
  handleTap(touch.clientX, touch.clientY)
}

function onClick(event) {
  handleTap(event.clientX, event.clientY)
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

function animate() {
  requestAnimationFrame(animate)
  const delta = Math.min(clock.getDelta(), 0.033)
  const elapsed = clock.elapsedTime
  camera.lookAt(cameraTarget)

  floaters.forEach((item) => {
    item.mesh.position.y = item.baseY + Math.sin(elapsed * item.speed + item.phase) * item.amplitude
    if (item.drift) item.mesh.position.x = item.mesh.userData.baseX + Math.sin(elapsed * item.mesh.userData.drift + item.phase) * 1.6
  })

  pulses.forEach((item) => {
    if (!item.mesh.parent) return
    const factor = 1 + Math.sin(elapsed * item.speed + item.phase) * item.scale
    item.mesh.scale.setScalar(factor)
  })

  if (dinoJaw) dinoJaw.rotation.z = Math.sin(elapsed * 5.8) * 0.05
  if (dinoTail) dinoTail.rotation.z = -0.22 + Math.sin(elapsed * 2.2) * 0.16

  for (let index = scheduled.length - 1; index >= 0; index -= 1) {
    const item = scheduled[index]
    item.elapsed += delta * 1000
    if (item.elapsed >= item.delayMs) {
      item.fn()
      scheduled.splice(index, 1)
    }
  }

  for (let index = bursts.length - 1; index >= 0; index -= 1) {
    const burst = bursts[index]
    burst.age += delta
    if (burst.age >= burst.life) {
      effectGroup.remove(burst.mesh)
      burst.mesh.geometry.dispose()
      burst.mesh.material.dispose()
      bursts.splice(index, 1)
      continue
    }
    burst.velocity.y -= 8.2 * delta
    burst.mesh.position.addScaledVector(burst.velocity, delta)
    burst.mesh.rotation.x += burst.spin.x * delta
    burst.mesh.rotation.y += burst.spin.y * delta
    burst.mesh.rotation.z += burst.spin.z * delta
    const fade = 1 - burst.age / burst.life
    burst.mesh.scale.setScalar(Math.max(0.2, fade))
    burst.mesh.material.opacity = fade
    burst.mesh.material.transparent = true
  }

  renderer.render(scene, camera)
}

function setupScene() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  elements.stage.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 200)
  camera.position.set(0, 18, 11.5)

  raycaster = new THREE.Raycaster()
  pointer = new THREE.Vector2()
  clock = new THREE.Clock()

  decoGroup = new THREE.Group()
  controlGroup = new THREE.Group()
  choiceGroup = new THREE.Group()
  effectGroup = new THREE.Group()
  scene.add(decoGroup, controlGroup, choiceGroup, effectGroup)

  createLights()
  createTerrain()
  createMissionBoard()
  createControls()
  updateControlLabels()
  drawMissionBoard()

  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false })
  renderer.domElement.addEventListener('click', onClick)
  window.addEventListener('resize', onResize)
}

elements.uiModeEgg.addEventListener('click', () => {
  ensureInteractionReady()
  switchMode('egg')
})

elements.uiModeBlock.addEventListener('click', () => {
  ensureInteractionReady()
  switchMode('block')
})

elements.uiStart.addEventListener('click', () => {
  ensureInteractionReady()
  startRound()
})

elements.uiReplay.addEventListener('click', () => {
  ensureInteractionReady()
  replayMissionPrompt()
})

updateHUD()
setupScene()
prepareMission()
animate()
