// SPDX-License-Identifier: GPL-3.0-or-later
// Optional Yanyun display adapter. The original ACT path remains available.
window.YANYUN_MODE = new URLSearchParams(location.search).get('yanyun') === '1' || !!window.yanyunDesktop
if (window.YANYUN_MODE) {
  CONFIG_DEFAULT.lang = 'cn'
  CONFIG_DEFAULT.filter.jobless = false
  CONFIG_DEFAULT.format.merge_pet = false
  CONFIG_DEFAULT.format.use_short_name = 0
  CONFIG_DEFAULT.style['body-font'] = 'Microsoft YaHei UI, sans-serif'
  CONFIG_DEFAULT.style['color-accent'] = '#78d6bd'
  CONFIG_DEFAULT.style['gauge-default'] = '#35796b'
  CONFIG_DEFAULT.footer = { rank: false, rdps: false, rhps: false }
  CONFIG_DEFAULT.tabs = [
    { id: 0, label: '观测输出', width: 1, sort: 'deal.total', col: ['i.name', 'deal.total', 'deal.per_second', 'deal.swing'] },
    { id: 1, label: '受到伤害', width: 1, sort: 'tank.damage', col: ['i.name', 'tank.damage', 'tank.heal'] },
    { id: 2, label: '观测治疗', width: 1, sort: 'heal.total', col: ['i.name', 'heal.total', 'heal.per_second', 'heal.swing'] },
    { id: 3, label: '动作与增益', width: 1, sort: 'yanyun.actions', col: ['i.name', 'yanyun.actions', 'yanyun.buffs'] }
  ]
  CONFIG_DEFAULT.colwidth['_i-name'] = 14
  CONFIG_DEFAULT.colwidth['_deal-total'] = 6
  CONFIG_DEFAULT.colwidth['_deal-per_second'] = 6
  COLUMN_INDEX.yanyun = { actions: { v: 'yanyunActions' }, buffs: { v: 'yanyunBuffs' } }
  COLUMN_SORTABLE.push('yanyun.actions', 'yanyun.buffs')
}
window.applyYanyunConfig = function () {
  if (!localStorage.getItem('yanyun-kagerou-config-v1')) {
    config.init()
    config.set('lang', 'cn')
    config.save()
    localStorage.setItem('yanyun-kagerou-config-v1', '1')
  }
  // Actor names are identifiers here. FF14 pet merging would conflate players.
  config.set('format.merge_pet', false)
  config.set('filter.jobless', false)
}
window.localizeYanyun = function (locale) {
  const col = locale.L[locale.current].col
  col.deal.total = ['观测伤害', '日志实际记录的对外伤害']
  col.deal.per_second = ['区间每秒', '观测伤害除以分析区间，不是完整 DPS']
  col.deal.swing = ['记录次数', '伤害记录条数，未推断未记录的命中']
  col.heal.total = ['观测治疗', '日志实际记录的治疗量']
  col.heal.per_second = ['区间每秒', '观测治疗除以分析区间']
  col.heal.swing = ['记录次数', '治疗记录条数']
  col.yanyun = { actions: ['施放次数', '已确认技能开始的次数'], buffs: ['外部 Buff 添加', '向其他对象添加 Buff 的记录次数'] }
}
window.startYanyunFeed = function () {
  document.body.classList.add('yanyun-mode')
  const style = document.createElement('style')
  style.textContent = `body.yanyun-mode {background:#14201f!important;color:#e7f0ef;font-family:Microsoft YaHei UI,sans-serif;}
  #yanyun-status {padding:10px 14px;background:#22352f;color:#a8dacb;font-size:12px;line-height:1.6;white-space:normal;}
  .yanyun-mode main {height:calc(100% - 100px)!important;} .yanyun-mode nav{height:40px;}
  .yanyun-mode #table > li {cursor:pointer;min-height:44px;} .yanyun-mode #header{min-height:38px;}
  .yanyun-mode .flex-column-yanyun-actions,.yanyun-mode .flex-column-yanyun-buffs {width:140px;}
  .yanyun-mode [data-button="merge-pet"],.yanyun-mode [data-button="donate"],.yanyun-mode .supports-end{display:none!important;}
  .yanyun-mode #table .gauge {background:#377c69;} .yanyun-mode .tabs span {padding:10px 14px;}
  .yanyun-mode #header .flex-column {white-space:normal;}`
  document.head.appendChild(style)
  const status = document.createElement('div')
  status.id = 'yanyun-status'
  status.textContent = '等待选择战斗。请在复盘窗口打开一份日志。'
  document.body.prepend(status)
  let previous = '', busy = false
  async function poll() {
    if (busy) return
    busy = true
    try {
      const response = await fetch('/api/overlay-view')
      if (!response.ok) throw Error('读取统计失败')
      const data = await response.json()
      if (data.waiting) { status.textContent = '等待选择战斗。请在复盘窗口打开一份日志。'; return }
      status.textContent = data.meta.notice + `  区间 ${data.meta.from.toFixed(3)}–${data.meta.to.toFixed(3)} 秒。`
      const key = JSON.stringify(data)
      if (key !== previous) {
        previous = key
        document.dispatchEvent(new CustomEvent('onOverlayDataUpdate', { detail: data }))
        // Upstream ACT fields used null as zero in a few columns. Preserve absence.
        for (const row of document.querySelectorAll('#table > li')) {
          for (const cell of row.querySelectorAll('.flex-column')) if (cell.textContent === 'null' || cell.textContent === 'undefined' || cell.textContent === '---') cell.textContent = '—'
        }
      }
    } catch { status.textContent = '统计连接已中断；下方保留上一次观测数据。' }
    finally { busy = false }
  }
  window.addEventListener('storage', event => { if (event.key === 'kagerou_config') location.reload() })
  poll()
  setInterval(poll, 1000)
}
