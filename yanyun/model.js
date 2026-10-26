/* Yanyun-specific Kagerou derivative. GPL-3.0-or-later; see COPYING and LICENSE.md.
 * Ranked combatants and history; no ACT/FFXIV field assumptions in the live model.
 */
;(function (root) {
  const finite = v => typeof v === 'number' && Number.isFinite(v)
  const number = value => finite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) : '—'
  function ranked(rows, field) {
    return [...rows].sort((a, b) => {
      const av = a[field], bv = b[field]
      if (!finite(av)) return finite(bv) ? 1 : 0
      if (!finite(bv)) return -1
      return bv - av
    })
  }
  function live(data, running, now = Date.now()) {
    const s = data.latest || {}, h = s.health || {}, observed = Date.parse(s.observedAt)
    const recorded = s.source?.mode === 'replay'
    const fresh = !recorded && !!running && h.session === 'valid' && !h.stale && !h.gap && now - observed >= 0 && now - observed < 3500
    const clock = s.encounterClock, start = Date.parse(clock?.startObservedAt)
    let duration = finite(s.timeCostSeconds) && s.timeCostSeconds > 0 ? s.timeCostSeconds : null
    if (duration === null && Number.isFinite(start) && s.npcNo === clock.npcNo && observed >= start) {
      const end = clock.endObservedAt ? Date.parse(clock.endObservedAt) : fresh ? now : observed
      if (end > start) duration = (end - start) / 1000
    }
    const rows = (s.actors || []).filter(a => typeof a.idHash === 'string').map(a => ({ id: a.idHash,
      name: a.name || '玩家 · ' + a.idHash.slice(-6), damage: a.damage, healed: a.heal, taken: a.absorbDmg,
      dps: duration > 0 && finite(a.damage) ? a.damage / duration : null,
      hps: duration > 0 && finite(a.heal) ? a.heal / duration : null }))
    return { rows, duration, key: s.source?.sessionId || '', title: s.npcNo ? '战斗目标 ' + s.npcNo : '等待战斗统计',
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
  const api = { finite, number, ranked, live, review, History }
  if (typeof module !== 'undefined') module.exports = api
  else root.YanyunModel = api
})(typeof window === 'undefined' ? globalThis : window)
