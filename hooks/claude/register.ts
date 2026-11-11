import type { Register } from 'claude-code'

import {
  fullBlock,
  type InjectionState,
  nextInjection,
  reminderBlock,
  spawnAppendix,
} from './rules.ts'

export const register: Register = (on) => {
  // Registration owns its state; a reload only means an extra full block.
  const injections = new Map<string, InjectionState>()
  const current = (root: string) => injections.get(root) ?? { shown: false, compacted: false }
  // Plugins a user installs cannot change the system prompt or first-message context, so rules ride on each prompt
  on('prompt.submit', async ($, e, next) => {
    // Preserve host command dispatch; task skills carry the common contract through their own supported entry path.
    if (e.command) return next(e)
    const root = await $.session.root()
    const step = nextInjection(current(root))
    injections.set(root, step.state)
    const pluginRoot = $.plugin.root
    const text =
      step.mode === 'full'
        ? fullBlock({ template: String(await $.fs.read(`${pluginRoot}/hooks/rules.md`)), pluginRoot })
        : reminderBlock(pluginRoot)
    return next({ ...e, context: [...(e.context ?? []), text] })
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    const root = await $.session.root()
    injections.set(root, { ...current(root), compacted: true })
    return result
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') injections.clear()
    return next(e)
  })

  // prompt.submit context does not reach subagents; their task message is the only way in
  on('agent.spawn', async ($, e, next) => {
    return next({ ...e, prompt: `${e.prompt}\n\n${spawnAppendix($.plugin.root)}` })
  })
}
