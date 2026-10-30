import type { EngineInterface, Register } from 'claude-code'

import {
  fullBlock,
  type InjectionState,
  nextInjection,
  parseSettings,
  reminderBlock,
  spawnAppendix,
} from './rules.ts'

// A reload starts this over, which only means one extra full block
let injection: InjectionState = { shown: false, compacted: false }

const readText = ($: EngineInterface, path: string) => $.fs.read(path).then(String).catch(() => undefined)

const load = async ($: EngineInterface) => {
  const root = await $.session.root()
  return parseSettings(await readText($, `${root}/.haechi.json`))
}

export const register: Register = (on) => {
  // Plugins a user installs cannot change the system prompt or first-message context, so rules ride on each prompt
  on('prompt.submit', async ($, e, next) => {
    if (e.command) return next(e)
    const loaded = await load($)
    const step = nextInjection(injection)
    injection = step.state
    const pluginRoot = $.plugin.root
    const text =
      step.mode === 'full'
        ? fullBlock({ template: String(await $.fs.read(`${pluginRoot}/hooks/rules.md`)), loaded, pluginRoot })
        : reminderBlock({ loaded, pluginRoot })
    return next({ ...e, context: [...(e.context ?? []), text] })
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    injection = { ...injection, compacted: true }
    return result
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') injection = { shown: false, compacted: false }
    return next(e)
  })

  // prompt.submit context does not reach subagents; their task message is the only way in
  on('agent.spawn', async ($, e, next) => {
    const loaded = await load($)
    return next({ ...e, prompt: `${e.prompt}\n\n${spawnAppendix(loaded, $.plugin.root)}` })
  })
}
