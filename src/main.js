import './style.css'
import * as THREE from 'three'

const numbers = Array.from({ length: 11 }, (_, value) => ({
  value,
  word: ['영', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'][value],
  dino: ['알 없음', '아기 티라노', '트리케라톱스', '브라키오', '랩터', '스테고', '안킬로', '파라사우롤로푸스', '프테라노돈', '티라노 대장', '공룡 퍼레이드'][value],
}))

const state = {
  current: 0,
  reward: 0,
  streak: 0,
  quiz: null,
}

const app = document.querySelector('#app')

app.innerHTML = `
  <div class="page-shell">
    <header class="hero card">
      <div class="hero-copy">
        <span class="eyebrow">공룡 x 블록 숫자 모험</span>
        <h1>숫자 탐험대</h1>
        <p class="hero-text">0부터 10까지 숫자를 보고, 듣고, 눌러 보면서 익혀요. 정답을 맞히면 공룡 알과 블록 배지가 쌓여요.</p>
        <div class="hero-actions">
          <button class="primary-btn" id="speak-current">지금 숫자 읽어주기</button>
          <button class="ghost-btn" id="start-quiz">미션 시작</button>
        </div>
        <div class="hero-stats">
          <div><strong id="reward-count">0</strong><span>획득 배지</span></div>
          <div><strong id="streak-count">0</strong><span>연속 정답</span></div>
          <div><strong>0~10</strong><span>학습 범위</span></div>
        </div>
      </div>
      <div class="scene-panel">
        <div id="three-scene" aria-label="공룡 보상 장면"></div>
        <p class="scene-caption">정답을 맞히면 공룡 친구가 더 신나게 춤춰요.</p>
      </div>
    </header>

    <main>
      <section class="card lesson-card" aria-labelledby="lesson-title">
        <div class="section-head">
          <div>
            <span class="section-kicker">1. 숫자 익히기</span>
            <h2 id="lesson-title">오늘의 숫자 카드</h2>
          </div>
          <div class="nav-buttons">
            <button class="ghost-btn small" id="prev-number">이전</button>
            <button class="ghost-btn small" id="next-number">다음</button>
          </div>
        </div>
        <div class="lesson-grid">
          <div class="number-stage">
            <div class="big-number" id="big-number">0</div>
            <p class="number-word" id="number-word">영</p>
            <p class="number-story" id="number-story">알이 없는 시작 숫자예요.</p>
            <button class="primary-btn small" id="listen-number">숫자 소리 듣기</button>
          </div>
          <div>
            <div class="item-cloud" id="item-cloud"></div>
            <div class="mini-tip" id="mini-tip"></div>
          </div>
        </div>
        <div class="number-strip" id="number-strip"></div>
      </section>

      <section class="card quiz-card" aria-labelledby="quiz-title">
        <div class="section-head">
          <div>
            <span class="section-kicker">2. 미션 풀기</span>
            <h2 id="quiz-title">공룡 미션 퀴즈</h2>
          </div>
          <button class="ghost-btn small" id="refresh-quiz">새 문제</button>
        </div>
        <p class="quiz-prompt" id="quiz-prompt"></p>
        <div class="quiz-options" id="quiz-options"></div>
        <div class="quiz-result" id="quiz-result" aria-live="polite"></div>
      </section>

      <section class="bottom-grid">
        <section class="card reward-card">
          <span class="section-kicker">3. 보상</span>
          <h2>탐험 기록</h2>
          <div class="reward-track" id="reward-track"></div>
          <p class="reward-note">정답을 맞힐 때마다 배지가 하나씩 생겨요. 5개가 되면 공룡 대장이 등장해요.</p>
        </section>

        <section class="card parent-card">
          <span class="section-kicker">부모님 안내</span>
          <h2>왜 이렇게 만들었나요?</h2>
          <ul>
            <li>숫자 기호, 수량, 음성을 동시에 보여줘 숫자 인지를 돕습니다.</li>
            <li>문제는 짧고 반복 가능하게 설계해 5살 아이도 부담 없이 반복 학습할 수 있습니다.</li>
            <li>Three.js는 조작이 아닌 보상 연출에 써서 재미는 살리고 난이도는 낮췄습니다.</li>
          </ul>
        </section>
      </section>
    </main>
  </div>
`

const elements = {
  bigNumber: document.querySelector('#big-number'),
  numberWord: document.querySelector('#number-word'),
  numberStory: document.querySelector('#number-story'),
  itemCloud: document.querySelector('#item-cloud'),
  miniTip: document.querySelector('#mini-tip'),
  numberStrip: document.querySelector('#number-strip'),
  quizPrompt: document.querySelector('#quiz-prompt'),
  quizOptions: document.querySelector('#quiz-options'),
  quizResult: document.querySelector('#quiz-result'),
  rewardTrack: document.querySelector('#reward-track'),
  rewardCount: document.querySelector('#reward-count'),
  streakCount: document.querySelector('#streak-count'),
}

function speak(text) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'ko-KR'
  utterance.rate = 0.9
  window.speechSynthesis.speak(utterance)
}

function getIcons(count) {
  if (count === 0) return '<div class="zero-badge">0개</div>'
  const icon = state.current % 2 === 0 ? '🧱' : '🦕'
  return Array.from({ length: count }, () => `<span class="count-icon">${icon}</span>`).join('')
}

function renderNumberStrip() {
  elements.numberStrip.innerHTML = numbers
    .map(({ value }) => `<button class="strip-btn ${value === state.current ? 'active' : ''}" data-value="${value}">${value}</button>`)
    .join('')
}

function renderLesson() {
  const entry = numbers[state.current]
  elements.bigNumber.textContent = entry.value
  elements.numberWord.textContent = entry.word
  elements.numberStory.textContent = entry.value === 0
    ? '아직 공룡 친구가 나오기 전, 준비하는 숫자예요.'
    : `${entry.word}, 공룡 친구 ${entry.value}마리와 블록 ${entry.value}개를 세어봐요.`
  elements.itemCloud.innerHTML = getIcons(entry.value)
  elements.miniTip.textContent = `포인트: 숫자 ${entry.value}는 '${entry.word}'라고 읽어요. ${entry.dino}`
  renderNumberStrip()
}

function makeQuiz() {
  const answer = Math.floor(Math.random() * 11)
  const type = Math.random() > 0.5 ? 'count' : 'number'
  const options = new Set([answer])
  while (options.size < 4) options.add(Math.floor(Math.random() * 11))
  state.quiz = {
    answer,
    type,
    options: Array.from(options).sort(() => Math.random() - 0.5),
  }
  renderQuiz()
}

function celebrate(success) {
  if (success) {
    state.reward += 1
    state.streak += 1
  } else {
    state.streak = 0
  }
  elements.rewardCount.textContent = state.reward
  elements.streakCount.textContent = state.streak
  renderRewards()
  pulseScene(success)
}

function renderQuiz() {
  const { answer, type, options } = state.quiz
  elements.quizPrompt.textContent = type === 'count'
    ? `공룡 알이 ${answer}개가 되려면 어떤 숫자를 눌러야 할까?`
    : `숫자 ${answer}와 같은 개수의 블록을 찾는다고 생각하고 정답 숫자를 골라봐!`
  elements.quizOptions.innerHTML = options
    .map((value) => `<button class="quiz-btn" data-answer="${value}">${value}</button>`)
    .join('')
}

function renderRewards() {
  const count = Math.min(state.reward, 10)
  elements.rewardTrack.innerHTML = Array.from({ length: 10 }, (_, index) => {
    const filled = index < count
    return `<div class="reward-chip ${filled ? 'filled' : ''}">${filled ? (index < 5 ? '🥚' : '🦖') : '⬜'}</div>`
  }).join('')
}

function bindEvents() {
  document.querySelector('#prev-number').addEventListener('click', () => {
    state.current = state.current === 0 ? 10 : state.current - 1
    renderLesson()
  })
  document.querySelector('#next-number').addEventListener('click', () => {
    state.current = state.current === 10 ? 0 : state.current + 1
    renderLesson()
  })
  document.querySelector('#listen-number').addEventListener('click', () => speak(`${state.current}, ${numbers[state.current].word}`))
  document.querySelector('#speak-current').addEventListener('click', () => speak(`지금 숫자는 ${state.current}, ${numbers[state.current].word}`))
  document.querySelector('#start-quiz').addEventListener('click', () => {
    document.querySelector('.quiz-card').scrollIntoView({ behavior: 'smooth', block: 'start' })
    speak('미션을 시작해 볼까?')
  })
  document.querySelector('#refresh-quiz').addEventListener('click', makeQuiz)

  elements.numberStrip.addEventListener('click', (event) => {
    const button = event.target.closest('.strip-btn')
    if (!button) return
    state.current = Number(button.dataset.value)
    renderLesson()
  })

  elements.quizOptions.addEventListener('click', (event) => {
    const button = event.target.closest('.quiz-btn')
    if (!button) return
    const selected = Number(button.dataset.answer)
    const correct = selected === state.quiz.answer
    if (correct) {
      elements.quizResult.textContent = `정답! 숫자 ${selected} 찾기 성공! 공룡 배지를 얻었어요.`
      speak(`정답! ${selected}`)
      celebrate(true)
      setTimeout(makeQuiz, 900)
    } else {
      elements.quizResult.textContent = `아쉬워! 다시 해보자. 정답은 ${state.quiz.answer}였어.`
      speak(`다시 해보자. 정답은 ${state.quiz.answer}`)
      celebrate(false)
    }
  })
}

let renderer
let scene
let camera
let dino
let blocks = []
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
  camera.position.set(0, 1.8, 6)

  const ambient = new THREE.AmbientLight(0xffffff, 1.8)
  const directional = new THREE.DirectionalLight(0xffffff, 1.4)
  directional.position.set(3, 5, 4)
  scene.add(ambient, directional)

  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 3, 0.4, 32),
    new THREE.MeshStandardMaterial({ color: 0xf4d35e })
  )
  floor.position.y = -1.5
  scene.add(floor)

  dino = new THREE.Group()
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.1, 32, 32), new THREE.MeshStandardMaterial({ color: 0x53c56b }))
  body.scale.set(1.2, 0.9, 1.6)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 32), new THREE.MeshStandardMaterial({ color: 0x63d87c }))
  head.position.set(1.1, 0.55, 0)
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
  const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), eyeMaterial)
  const eye2 = eye1.clone()
  eye1.position.set(1.35, 0.72, 0.18)
  eye2.position.set(1.35, 0.72, -0.18)
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.8, 20), new THREE.MeshStandardMaterial({ color: 0x41a85a }))
  tail.rotation.z = -1.2
  tail.position.set(-1.55, -0.05, 0)
  const legGeometry = new THREE.CylinderGeometry(0.14, 0.14, 0.9, 16)
  const legMaterial = new THREE.MeshStandardMaterial({ color: 0x3c8f4f })
  ;[-0.45, 0.35].forEach((z) => {
    const frontLeg = new THREE.Mesh(legGeometry, legMaterial)
    frontLeg.position.set(0.3, -1, z)
    const backLeg = new THREE.Mesh(legGeometry, legMaterial)
    backLeg.position.set(-0.5, -1, z)
    dino.add(frontLeg, backLeg)
  })
  dino.add(body, head, eye1, eye2, tail)
  scene.add(dino)

  const blockColors = [0xff6b6b, 0x5f6af2, 0xffb703, 0x8ac926]
  blocks = blockColors.map((color, index) => {
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.72, 0.72),
      new THREE.MeshStandardMaterial({ color, metalness: 0.15, roughness: 0.5 })
    )
    block.position.set(-1.4 + index * 0.95, 1.2 + (index % 2) * 0.2, index % 2 === 0 ? -0.8 : 0.8)
    scene.add(block)
    return block
  })

  animate()

  window.addEventListener('resize', () => {
    const nextWidth = container.clientWidth
    const nextHeight = container.clientHeight
    camera.aspect = nextWidth / nextHeight
    camera.updateProjectionMatrix()
    renderer.setSize(nextWidth, nextHeight)
  })
}

function pulseScene(success) {
  glow = success ? 1 : -0.6
}

function animate(time = 0) {
  requestAnimationFrame(animate)
  const t = time * 0.001
  dino.rotation.y = Math.sin(t * 0.9) * 0.35
  dino.position.y = Math.sin(t * 2) * 0.12
  blocks.forEach((block, index) => {
    block.rotation.x = t + index * 0.2
    block.rotation.y = t * 0.6 + index
    block.position.y = 1 + Math.sin(t * 1.7 + index) * 0.15
  })
  if (glow !== 0) {
    dino.scale.setScalar(1 + glow * 0.06)
    glow *= 0.88
  } else {
    dino.scale.setScalar(1)
  }
  renderer.render(scene, camera)
}

renderLesson()
makeQuiz()
renderRewards()
bindEvents()
setupScene()
