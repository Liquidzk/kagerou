'use strict'
const model = window.YanyunModel, $ = id => document.getElementById(id), desktop = window.yanyunDesktop
let source = 'live', tab = 'damage', value = null, busy = false, locked = false
let names = {}
let lastLiveData = null, pollFailed = false
fetch('/api/names').then(r => r.json()).then(v => { names = v }).catch(() => {})
const history = new model.History()
let preferences
try { preferences = JSON.parse(localStorage.getItem('yanyun-overlay-v2')) || {} } catch { preferences = {} }
function style() {
  const opacity = Math.max(25, Math.min(100, Number(preferences.opacity) || 92)), font = Math.max(11, Math.min(21, Number(preferences.font) || 14))
  document.documentElement.style.setProperty('--opacity', opacity / 100); document.documentElement.style.setProperty('--font', font + 'px')
  $('opacity').value = opacity; $('font').value = font
}
style()
for (const field of ['opacity', 'font']) $(field).oninput = () => { preferences[field] = Number($(field).value); localStorage.setItem('yanyun-overlay-v2', JSON.stringify(preferences)); style() }
$('reset').onclick = () => { preferences = {}; localStorage.setItem('yanyun-overlay-v2', '{}'); style() }
$('settings').onclick = () => { $('preferences').hidden = !$('preferences').hidden }
$('lock').onclick = () => desktop?.overlayCommand('lock')
$('hide').onclick = () => desktop?.overlayCommand('hide')
$('review').onclick = () => desktop?.overlayCommand('review')
function state(s) { source = s.source || 'live'; lastLiveData = null; locked = !!s.locked; $('lock').textContent = locked ? '◆' : '◇'; poll() }
desktop?.overlayState().then(state)
desktop?.onOverlayState(state)
desktop?.onOverlaySettings(() => { $('preferences').hidden = false })
document.querySelectorAll('[data-tab]').forEach(button => { button.onclick = () => { tab = button.dataset.tab; document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b === button)); render() } })
function render() {
  if (!value) return
  $('title').textContent = value.title; $('status').textContent = value.status + (locked ? ' · 鼠标穿透' : '')
  renderTime(value)
  renderBoss(value)
  $('dot').classList.toggle('active', value.fresh); $('notice').textContent = value.note
  $('total-label').textContent = { damage: '累计输出', healed: '累计治疗', taken: '累计承伤字段' }[tab]
  $('rate-label').textContent = tab === 'damage' ? source === 'review' ? '观测每秒' : '每秒输出' : tab === 'healed' ? '每秒治疗' : ''
  const rows = model.ranked(value.rows, tab), max = Math.max(1, ...rows.map(r => model.finite(r[tab]) ? r[tab] : 0)), fragment = document.createDocumentFragment()
  for (const row of rows) {
    const li = document.createElement('li'), name = document.createElement('span'), total = document.createElement('span'), rate = document.createElement('span')
    name.className = 'name'; name.textContent = row.name; name.title = row.name
    total.className = 'number'; total.textContent = model.number(row[tab])
    rate.className = 'number rate'; rate.textContent = tab === 'taken' ? '' : model.number(row[tab === 'damage' ? 'dps' : 'hps'])
    li.style.setProperty('--width', (model.finite(row[tab]) ? Math.max(0, row[tab] / max * 100) : 0) + '%')
    li.append(name, total, rate); fragment.append(li)
    if (source === 'review') li.onclick = () => desktop?.selectActor(row.id)
  }
  $('rows').replaceChildren(fragment); $('empty').hidden = rows.length > 0; $('count').textContent = rows.length ? rows.length + ' 位已观测角色' : ''
}
function renderTime(view) {
  $('time').textContent = model.formatTime(view.duration)
  $('timer-label').textContent = view.timer?.label || '复盘时长'
  $('battle-timer').dataset.state = view.timer?.state || 'review'
  $('battle-timer').title = view.timer?.detail || ''
}
function bossName(row) {
  return row.group === 'choulingke' ? '愁铃客 · ' + (row.role === 'body' ? '肉体' : '灵魂') : names.npcs?.[String(row.npcTemplateNo)] || 'Boss · ' + row.npcTemplateNo
}
function renderBoss(view) {
  const hp = view.bossHealth, rows = hp?.rows || []
  $('boss-health').hidden = !rows.length
  $('boss-health').classList.toggle('paused', !hp?.live)
  $('boss-label').textContent = hp?.label || ''
  $('boss-difference').textContent = model.finite(hp?.difference) ? '双条差 ' + hp.difference.toFixed(1) + '%' : ''
  const fragment = document.createDocumentFragment()
  for (const row of rows) {
    const bar = document.createElement('div'), fill = document.createElement('div'), name = document.createElement('span'), number = document.createElement('span')
    bar.className = 'boss-bar'; bar.dataset.role = row.role || 'boss'; bar.dataset.available = row.available
    fill.className = 'boss-fill'; fill.style.width = (row.percent ?? 0) + '%'
    name.className = 'boss-name'; name.textContent = bossName(row)
    number.className = 'boss-number'; number.textContent = row.available ? row.percent.toFixed(1) + '%' : '等待血量快照'
    bar.title = row.available ? name.textContent + '：' + model.number(row.currentHp) + ' / ' + model.number(row.maxHp) + (hp.live ? '' : '（末次记录）') : name.textContent + '：尚未收到完整血量，不视为满血或零血'
    const amount = document.createElement('span'); amount.className = 'boss-amount'
    amount.textContent = row.available ? model.number(row.currentHp) + ' / ' + model.number(row.maxHp) : '—'
    bar.setAttribute('role', 'meter'); bar.setAttribute('aria-label', name.textContent); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100')
    if (row.available) bar.setAttribute('aria-valuenow', row.percent.toFixed(3))
    bar.append(fill, name, amount, number); fragment.append(bar)
  }
  $('boss-bars').replaceChildren(fragment)
}
async function poll() {
  if (busy) return
  busy = true
  const requested = source
  try {
    const response = await fetch(requested === 'live' ? '/api/capture/status' : '/api/overlay-view')
    if (!response.ok) throw Error('offline')
    const data = await response.json()
    if (requested !== source) return
    pollFailed = false; lastLiveData = requested === 'live' ? data : null
    value = requested === 'live' ? model.live(data, data.control?.running) : model.review(data)
    if (requested === 'live' && value.bossHealth.rows.length) value.title = [...new Set(value.bossHealth.rows.map(bossName))].join(' / ')
    if (requested === 'review' && data.waiting) value.status = '请在 CLv2 复盘中选择战斗'
    history.push(value); render()
  } catch { pollFailed = true; $('status').textContent = '连接中断 · 保留末次记录'; $('dot').classList.remove('active') }
  finally { busy = false }
}
// This reads only our local engine. No new requests are sent to the game.
poll(); setInterval(poll, 250)
// Smooth local display; this does not increase requests to the game or engine.
setInterval(() => {
  if (source === 'live' && lastLiveData) {
    const current = model.live(lastLiveData, !pollFailed && lastLiveData.control?.running)
    renderTime(current)
    if (pollFailed) renderBoss(current)
  }
}, 100)
