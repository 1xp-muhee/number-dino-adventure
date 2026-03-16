import './style.css'
import * as THREE from 'three'

const numberWords = ['영', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열']
const themes = [
  { icon: '🥚', item: '공룡 알' },
  { icon: '🦕', item: '아기 공룡' },
  { icon: '🧱', item: '블록' },
]

const state = {
  current: 1,
  reward: 0,
  streak: 0,
  mode: 'learn',
  quiz: null,
  audioReady: false,
}

const app = document.querySelector('#app')
app.innerHTML = `
  <div class="page-shell">
    <header class="hero card">
      <div class="hero-copy">
        <div class="hero-badge">🦖 숫자 놀이터</div>
        <h1>보고<br/>듣고<br/>눌러요</h1>
        <p class="subcopy">글을 몰라도 괜찮아요. 큰 숫자와 그림을 누르면 바로 소리가 나와요.</p>
        <div class="hero-buttons">
          <button class="big-pill primary" id="play-voice">▶️ 시작</button>
          <button class="big-pill soft" id="go-mission">🎯 미션</button>
        </div>
        <div class="hero-stats">
          <div><span>🥚</span><strong id="reward-count">0</strong></div>
          <div><span>🔥</span><strong id="streak-count">0</strong></div>
          <div><span>🔊</span><strong>ON</strong></div>
        </div>
      </div>
      <div class="scene-panel">
        <div id="three-scene"></div>
        <div class="scene-hint">맞히면 공룡이 춤춰요</div>
      </div>
    </header>

    <main>
      <section class="card learn-card">
        <div class="section-top">
          <div class="section-chip">1. 숫자 보기</div>
          <div class="simple-nav">
            <button class="circle-btn" id="prev-number" aria-label="이전 숫자">◀</button>
            <button class="circle-btn" id="next-number" aria-label="다음 숫자">▶</button>
          </div>
        </div>

        <button class="number-stage" id="number-stage" aria-label="현재 숫자 듣기">
          <div class="number-face" id="big-number">1</div>
          <div class="number-dots" id="number-dots"></div>
          <div class="sound-bubble">🔊 눌러서 듣기</div>
        </button>

        <div class="choice-strip" id="number-strip"></div>
      </section>

      <section class="card mission-card" id="mission-card">
        <div class="section-top">
          <div class="section-chip orange">2. 미션</div>
          <button class="big-pill soft small-pill" id="new-mission">🔄 새 미션</button>
        </div>

        <div class="voice-card">
          <div class="voice-icon">🎧</div>
          <div>
            <div class="voice-title">들어보고 맞혀요</div>
            <button class="big-pill primary small-pill" id="repeat-mission">🔊 다시 듣기</button>
          </div>
        </div>

        <div class="mission-prompt" id="mission-visual"></div>
        <div class="mission-grid" id="mission-grid"></div>
        <div class="result-badge" id="mission-result" aria-live="polite"></div>
      </section>

      <section class="bottom-grid">
        <section class="card reward-card">
          <div class="section-chip green">3. 보상</div>
          <div class="reward-track" id="reward-track"></div>
        </section>
        <section class="card parent-card">
          <div class="section-chip blue">부모님</div>
          <ul>
            <li>문장을 읽지 않아도 되도록 음성과 그림 중심으로 바꿨습니다.</li>
            <li>한 화면에 한 과제만 보여줘 집중을 유지하게 했습니다.</li>
            <li>정답/오답은 글보다 애니메이션과 짧은 음성으로 전달합니다.</li>
          </ul>
        </section>
      </section>
    </main>
  </div>
`

const elements = {
  bigNumber: document.querySelector('#big-number'),
  numberDots: document.querySelector('#number-dots'),
  numberStrip: document.querySelector('#number-strip'),
  missionVisual: document.querySelector('#mission-visual'),
  missionGrid: document.querySelector('#mission-grid'),
  missionResult: document.querySelector('#mission-result'),
  rewardTrack: document.querySelector('#reward-track'),
  rewardCount: document.querySelector('#reward-count'),
  streakCount: document.querySelector('#streak-count'),
}

function speak(text) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'ko-KR'
  utterance.rate = 0.92
  utterance.pitch = 1.05
  window.speechSynthesis.speak(utterance)
}

function warmupAudio() {
  if (state.audioReady) return
  state.audioReady = true
  speak('안녕! 숫자 놀이를 시작해 보자!')
}

function makeDots(count, icon = '🟡') {
  if (count === 0) {
    return '<div class="empty-state">0</div>'
  }
  return Array.from({ length: count }, () => `<span class="dot-item">${icon}</span>`).join('')
}

function renderLearn() {
  const value = state.current
  elements.bigNumber.textContent = value
  elements.numberDots.innerHTML = makeDots(value, value % 2 === 0 ? '🧱' : '🥚')
  elements.numberStrip.innerHTML = Array.from({ length: 11 }, (_, valueIndex) => `
    <button class="strip-choice ${valueIndex === value ? 'active' : ''}" data-value="${valueIndex}">
      <span class="strip-num">${valueIndex}</span>
      <span class="strip-mini">${valueIndex === 0 ? '⬜' : '●'.repeat(Math.min(valueIndex, 5))}</span>
    </button>
  `).join('')
}

function shuffled(arr) {
  return [...arr].sort(() => Math.random() - 0.5)
}

function makeMission() {
  const answer = Math.floor(Math.random() * 11)
  const theme = themes[Math.floor(Math.random() * themes.length)]
  const options = new Set([answer])
  while (options.size < 3) options.add(Math.floor(Math.random() * 11))
  state.quiz = { answer, theme, options: shuffled([...options]) }
  renderMission()
  speakMission()
}

function speakMission() {
  if (!state.quiz) return
  speak(`${numberWords[state.quiz.answer]}! 찾아볼까?`)
}

function renderMission() {
  const { answer, options, theme } = state.quiz
  elements.missionVisual.innerHTML = `
    <div class="target-bubble">${answer}</div>
    <div class="target-sound">🔊 ${numberWords[answer]}</div>
  `
  elements.missionGrid.innerHTML = options.map((value) => `
    <button class="mission-option" data-value="${value}" aria-label="선택지 ${value}">
      <div class="option-count">${makeDots(value, theme.icon)}</div>
      <div class="option-number">${value}</div>
    </button>
  `).join('')
  elements.missionResult.textContent = ''
  elements.missionResult.className = 'result-badge'
}

function renderRewards() {
  const filled = Math.min(state.reward, 10)
  elements.rewardTrack.innerHTML = Array.from({ length: 10 }, (_, i) => `
    <div class="reward-egg ${i < filled ? 'filled' : ''}">${i < filled ? (i < 5 ? '🥚' : '🦖') : '▫️'}</div>
  `).join('')
  elements.rewardCount.textContent = state.reward
  elements.streakCount.textContent = state.streak
}

function onCorrect() {
  state.reward += 1
  state.streak += 1
  renderRewards()
  elements.missionResult.textContent = '딩동댕!'
  elements.missionResult.className = 'result-badge success'
  speak('맞았어!')
  pulseScene(true)
  setTimeout(makeMission, 900)
}

function onWrong() {
  state.streak = 0
  renderRewards()
  elements.missionResult.textContent = '한 번 더!'
  elements.missionResult.className = 'result-badge retry'
  speak('한 번 더!')
  pulseScene(false)
}

function bindEvents() {
  document.querySelector('#play-voice').addEventListener('click', () => {
    warmupAudio()
    speak(`숫자 ${state.current}. ${numberWords[state.current]}`)
  })
  document.querySelector('#go-mission').addEventListener('click', () => {
    document.querySelector('#mission-card').scrollIntoView({ behavior: 'smooth', block: 'start' })
    warmupAudio()
    speakMission()
  })
  document.querySelector('#number-stage').addEventListener('click', () => {
    warmupAudio()
    speak(`${state.current}. ${numberWords[state.current]}`)
  })
  document.querySelector('#prev-number').addEventListener('click', () => {
    state.current = state.current === 0 ? 10 : state.current - 1
    renderLearn()
    speak(`${state.current}. ${numberWords[state.current]}`)
  })
  document.querySelector('#next-number').addEventListener('click', () => {
    state.current = state.current === 10 ? 0 : state.current + 1
    renderLearn()
    speak(`${state.current}. ${numberWords[state.current]}`)
  })
  document.querySelector('#new-mission').addEventListener('click', () => {
    warmupAudio()
    makeMission()
  })
  document.querySelector('#repeat-mission').addEventListener('click', () => {
    warmupAudio()
    speakMission()
  })
  elements.numberStrip.addEventListener('click', (event) => {
    const btn = event.target.closest('.strip-choice')
    if (!btn) return
    state.current = Number(btn.dataset.value)
    renderLearn()
    speak(`${state.current}. ${numberWords[state.current]}`)
  })
  elements.missionGrid.addEventListener('click', (event) => {
    const btn = event.target.closest('.mission-option')
    if (!btn) return
    const selected = Number(btn.dataset.value)
    if (selected === state.quiz.answer) onCorrect()
    else onWrong()
  })
}

let renderer
let scene
let camera
let dino
let stars = []
let glow = 0

function setupScene() {
  const container = document.querySelector('#three-scene')
  const width = container.clientWidth
  const height = container.clientHeight

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height)
  container.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
  camera.position.set(0, 1.6, 6)

  scene.add(new THREE.AmbientLight(0xffffff, 2))
  const light = new THREE.DirectionalLight(0xffffff, 1.5)
  light.position.set(3, 4, 5)
  scene.add(light)

  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(2.7, 3, 0.45, 32),
    new THREE.MeshStandardMaterial({ color: 0xffdd77 })
  )
  floor.position.y = -1.6
  scene.add(floor)

  dino = new THREE.Group()
  const material1 = new THREE.MeshStandardMaterial({ color: 0x5fd36d })
  const material2 = new THREE.MeshStandardMaterial({ color: 0x43b85a })
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.1, 32, 32), material1)
  body.scale.set(1.3, 0.95, 1.7)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.72, 32, 32), material1)
  head.position.set(1.2, 0.55, 0)
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.8, 20), material2)
  tail.rotation.z = -1.15
  tail.position.set(-1.55, -0.05, 0)
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), new THREE.MeshStandardMaterial({ color: 0x101010 }))
  const eye2 = eye.clone()
  eye.position.set(1.42, 0.75, 0.18)
  eye2.position.set(1.42, 0.75, -0.18)
  dino.add(body, head, tail, eye, eye2)
  ;[-0.4, 0.35].forEach((z) => {
    const front = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.9, 16), material2)
    front.position.set(0.3, -1, z)
    const back = front.clone()
    back.position.set(-0.5, -1, z)
    dino.add(front, back)
  })
  scene.add(dino)

  stars = Array.from({ length: 6 }, (_, i) => {
    const star = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.45, 0.45),
      new THREE.MeshStandardMaterial({ color: [0xff6b6b, 0x4d96ff, 0xffc300][i % 3] })
    )
    star.position.set(-1.6 + i * 0.65, 1.2 + (i % 2) * 0.35, i % 2 ? 1 : -1)
    scene.add(star)
    return star
  })

  const onResize = () => {
    const w = container.clientWidth
    const h = container.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  window.addEventListener('resize', onResize)
  animate()
}

function pulseScene(success) {
  glow = success ? 1 : -0.7
}

function animate(time = 0) {
  requestAnimationFrame(animate)
  const t = time * 0.001
  dino.rotation.y = Math.sin(t) * 0.28
  dino.position.y = Math.sin(t * 2.1) * 0.12
  stars.forEach((star, i) => {
    star.rotation.x = t + i
    star.rotation.y = t * 0.7 + i
    star.position.y = 1.05 + Math.sin(t * 1.5 + i) * 0.2 + (i % 2) * 0.25
  })
  if (glow !== 0) {
    dino.scale.setScalar(1 + glow * 0.08)
    glow *= 0.85
  } else {
    dino.scale.setScalar(1)
  }
  renderer.render(scene, camera)
}

renderLearn()
makeMission()
renderRewards()
bindEvents()
setupScene()
setTimeout(() => speak('안녕! 숫자 놀이를 시작해 보자!'), 500)
