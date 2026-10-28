/* Yanyun-specific Kagerou derivative. GPL-3.0-or-later; see COPYING and LICENSE.md.
 * Ranked combatants and history; no ACT/FFXIV field assumptions in the live model.
 */
;(function (root) {
  const finite = v => typeof v === 'number' && Number.isFinite(v)
  const number = value => finite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) : '—'
  const formatTime = seconds => {
    if (!finite(seconds) || seconds < 0) return '—'
    const tenths = Math.floor(seconds * 10 + 1e-7)
    return Math.floor(tenths / 600).toString().padStart(2, '0') + ':' +
      Math.floor(tenths % 600 / 10).toString().padStart(2, '0') + '.' + tenths % 10
  }
  function timerView(s, running, now) {
    const t = s.battleTimer, h = s.health || {}
    if (!t) return null
    if (t.phase === 'finalized' && finite(t.durationSeconds) && t.durationSeconds > 0) {
      return { duration: t.durationSeconds, state: 'finalized', label: '服务器结算', estimated: false,
        detail: '已按服务器时长校准：' + t.durationSeconds.toFixed(3) + ' 秒；每秒统计使用同一时长。' }
    }
    const start = Date.parse(t.startObservedAt), end = Date.parse(t.endObservedAt)
    if (!Number.isFinite(start)) return { duration: null, state: t.phase,
      label: t.phase === 'unknown' ? '开战时间未知' : '等待开战', estimated: false,
      detail: t.phase === 'unknown' ? '本次未收到开战信息，收到服务器结算后显示正式时长。' : '收到开战状态或累计值重置后自动计时。' }
    const pulse = Date.parse(s.lastPacketObservedAt || s.observedAt)
    const healthy = s.source?.mode !== 'replay' && !!running && h.session === 'valid' && !h.gap && !['invalid', 'stopped'].includes(h.status)
    const advancing = healthy && now >= pulse && now - pulse < 3500 && t.phase === 'active'
    const stop = Number.isFinite(end) ? end : healthy ? Math.min(now, pulse + 3500) : pulse
    const duration = Number.isFinite(stop) ? Math.max(0, (stop - start) / 1000) : null
    const estimated = t.basis !== 'server-battle-state'
    return { duration, estimated, state: advancing ? 'active' : t.phase === 'active' ? 'paused' : t.phase,
      label: t.phase === 'ended' ? t.endReason === 'server-dungeon-finish' ? '已胜利 · 待校准' : '已结束 · 待结算' : t.phase === 'interrupted' ? '计时中断' :
        advancing ? estimated ? '估算计时' : '战斗计时' : '计时已暂停',
      detail: (estimated ? '依据服务器累计值的重置或首次变化估算开战时间。' : '依据收到的服务器开战状态计时。') +
        (t.endReason === 'server-dungeon-finish' ? '已按服务器副本完成通知停表；' : '') +
        '收到结算后自动校准时长和每秒统计。' }
  }
  function ranked(rows, field) {
    return [...rows].sort((a, b) => {
      const av = a[field], bv = b[field]
      if (!finite(av)) return finite(bv) ? 1 : 0
      if (!finite(bv)) return -1
      return bv - av
    })
  }
  function bossView(s, running, now) {
    const pulse = Date.parse(s.lastPacketObservedAt), h = s.health || {}
    const live = s.source?.mode !== 'replay' && !!running && h.session === 'valid' && !h.gap &&
      !['invalid', 'stopped'].includes(h.status) && now >= pulse && now - pulse < 3500
    const rows = (s.bossHealth?.rows || []).map(r => {
      const valid = r.available && finite(r.currentHp) && r.currentHp >= 0 && finite(r.maxHp) && r.maxHp > 0
      return { ...r, available: !!valid, percent: valid ? Math.max(0, Math.min(100, r.currentHp / r.maxHp * 100)) : null }
    })
    const body = rows.find(r => r.group === 'choulingke' && r.role === 'body' && r.available)
    const soul = rows.find(r => r.group === 'choulingke' && r.role === 'soul' && r.available)
    return { rows, live, label: live ? 'Boss 实时血量' : s.source?.mode === 'replay' ? 'Boss 记录血量' : 'Boss 血量 · 已暂停',
      difference: body && soul ? Math.abs(body.percent - soul.percent) : null }
  }
  function live(data, running, now = Date.now()) {
    const s = data.latest || {}, h = s.health || {}, observed = Date.parse(s.observedAt)
    const recorded = s.source?.mode === 'replay'
    const fresh = !recorded && !!running && h.session === 'valid' && !h.stale && !h.gap && now - observed >= 0 && now - observed < 3500
    const timer = timerView(s, running, now), clock = s.encounterClock, start = Date.parse(clock?.startObservedAt)
    let duration = timer ? timer.duration : finite(s.timeCostSeconds) && s.timeCostSeconds > 0 ? s.timeCostSeconds : null
    if (!timer && duration === null && Number.isFinite(start) && s.npcNo === clock.npcNo && observed >= start) {
      const end = clock.endObservedAt ? Date.parse(clock.endObservedAt) : fresh ? now : observed
      if (end > start) duration = (end - start) / 1000
    }
    const actors = s.battleTimer?.phase === 'finalized' ? s.battleTimer.finalActors || s.actors : s.actors
    const rows = (actors || []).filter(a => typeof a.idHash === 'string').map(a => ({ id: a.idHash,
      name: a.name || '玩家 · ' + a.idHash.slice(-6), damage: a.damage, healed: a.heal, taken: a.absorbDmg,
      dps: duration > 0 && finite(a.damage) ? a.damage / duration : null,
      hps: duration > 0 && finite(a.heal) ? a.heal / duration : null }))
    return { rows, duration, bossHealth: bossView(s, running, now), timer: timer || { label: duration === null ? '等待开战' : s.timeCostSeconds > 0 ? '服务器时长' : '战斗计时', state: 'legacy' },
      key: s.battleTimer?.key || (s.source?.sessionId || '') + (clock?.startObservedAt ? ':' + clock.startObservedAt : ''), title: s.npcNo ? '战斗目标 ' + s.npcNo : '等待战斗统计',
      status: recorded ? '离线回放 · 非实时采集' : !running ? '采集未运行 · 保留末次记录' : fresh ? '实时观测' : h.gap || h.status === 'invalid' ? '采集有缺口 · 数据已冻结' : '等待服务器更新',
      fresh, note: '服务器累计统计；完整队友动作与 Buff 覆盖尚未验证。承伤沿用服务器字段。' }
  }
  function review(data) {
    const e = data.Encounter || {}, rows = Object.entries(data.Combatant || {}).map(([id, a]) => ({ id,
      name: a.name, damage: a.damage, healed: a.healed, taken: a.damagetaken, dps: a.encdps, hps: a.enchps }))
    return { rows, duration: e.DURATION, key: e.yanyunReportKey, title: e.title || 'CLv2 战斗复盘',
      status: '本地 CLv2 · 已保存日志', fresh: false, note: data.meta?.notice || '部分观测，每秒数值不代表完整输出。' }
  }
  class History {
    constructor() { this.current = null; this.entries = new Map() }
    push(value) { if (this.current?.key && this.current.key !== value.key) this.entries.set(this.current.key, this.current); this.current = value; if (this.entries.size > 50) this.entries.delete(this.entries.keys().next().value) }
  }
  const api = { finite, number, formatTime, ranked, live, review, History, bossView }
  if (typeof module !== 'undefined') module.exports = api
  else root.YanyunModel = api
})(typeof window === 'undefined' ? globalThis : window)
