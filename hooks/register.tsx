import { atom, memberOf, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderInput } from 'claude-code'

import type { TurnInfo } from '../types'

// The turn the main loop runs now, so a tool call can be filed under it.
const currentTurn = atom({ plugin: 'processo-recolhido', key: 'currentTurn' } as const, null)
// Which turn a process row belongs to: a tool_use_id, or the key of a text.
const rowTurn = atom({ plugin: 'processo-recolhido', key: 'rowTurn' } as const, null)
// Per turn: the row that carries the header, how many steps, whether it ended.
const turnInfo = atom({ plugin: 'processo-recolhido', key: 'turnInfo' } as const, null)
// Per turn: whether the person opened its process. Closed by default.
const isOpen = atom({ plugin: 'processo-recolhido', key: 'isOpen' } as const, false)

// A text row and the step's answer are matched by their opening words.
const textKey = (text: string) => {
  const s = text.replace(/\s+/g, ' ').trim().slice(0, 200)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }

  return `t:${(h >>> 0).toString(36)}:${s.length}`
}

const addTool = async ($: EngineInterface, turnId: string, toolId: string) => {
  if (await read($, memberOf(rowTurn, { requestId: toolId }))) {
    return
  }
  await update($, memberOf(rowTurn, { requestId: toolId }), () => turnId)
  await update($, memberOf(turnInfo, { requestId: turnId }), (info): TurnInfo =>
    info
      ? { ...info, count: info.count + 1 }
      : { first: toolId, count: 1, isDone: false },
  )
}

// Files the turns already in the transcript, so a resumed session and the
// rows from before the mod loaded fold the same way.
const fileHistory = async ($: EngineInterface) => {
  type Entry = { kind: 'text' | 'tool'; key: string }
  const turns: Entry[][] = []
  let turn: Entry[] | null = null

  for (const message of await $.session.messages()) {
    if (message.role === 'user') {
      if (!message.toolResults?.length) {
        turn = []
        turns.push(turn)
      }
      continue
    }
    if (!turn) {
      continue
    }
    if (message.text.trim()) {
      turn.push({ kind: 'text', key: textKey(message.text) })
    }
    for (const use of message.toolUses) {
      turn.push({ kind: 'tool', key: use.tool_use_id })
    }
  }

  for (const entries of turns) {
    const tools = entries.filter(entry => entry.kind === 'tool')
    const first = tools[0]
    if (!first || (await read($, memberOf(rowTurn, { requestId: first.key })))) {
      continue
    }
    const turnId = `h:${first.key}`
    const last = entries.lastIndexOf(tools[tools.length - 1]!)
    for (const entry of entries.slice(0, last)) {
      if (entry.kind === 'text') {
        await update($, memberOf(rowTurn, { requestId: entry.key }), () => turnId)
      }
    }
    for (const tool of tools) {
      await update($, memberOf(rowTurn, { requestId: tool.key }), () => turnId)
    }
    await update($, memberOf(turnInfo, { requestId: turnId }), (): TurnInfo => ({
      first: first.key,
      count: tools.length,
      isDone: true,
    }))
  }
}

// Draws a process row: the header with the toggle where the turn's process
// starts, nothing elsewhere while closed, the engine's own row while open.
const fold = async (
  $: EngineInterface,
  e: RenderInput,
  drawn: () => Promise<RenderElement>,
  keys: readonly string[],
  canLead: boolean,
): Promise<RenderElement> => {
  let turnId: string | null = null
  for (const key of keys) {
    turnId = await read($, memberOf(rowTurn, { requestId: key }))
    if (turnId) {
      break
    }
  }
  if (!turnId) {
    return drawn()
  }
  const info = await read($, memberOf(turnInfo, { requestId: turnId }))
  if (!info) {
    return drawn()
  }
  const open = await read($, memberOf(isOpen, { requestId: turnId }))
  const { Box, Text, Button } = $.ui.resolve(e)

  if (!canLead || !keys.includes(info.first)) {
    return open ? drawn() : <Box display="none" />
  }

  const id = turnId
  const steps = info.count === 1 ? '1 etapa' : `${info.count} etapas`
  const header = (
    <Box flexDirection="row" justifyContent="space-between" width="100%">
      <Text dimColor>
        ⚙ Processo · {steps}
        {info.isDone ? '' : ' · em andamento…'}
      </Text>
      <Button
        key="toggle"
        plain
        label={open ? '▲' : '▼'}
        onPress={() => void update($, memberOf(isOpen, { requestId: id }), was => !was)}
      />
    </Box>
  )

  if (!open) {
    return header
  }

  return (
    <Box flexDirection="column">
      {header}
      {await drawn()}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await fileHistory($)

    return started
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, currentTurn, () => e.turnId)
    }

    return next(e)
  })

  // A step that asked for tools wrote its text on the way: that is process.
  on('turn.step', async function* ($, e, next) {
    const response = yield* next(e)
    if (
      e.agentId === undefined &&
      response.toolUses.length > 0 &&
      response.answer.trim()
    ) {
      await update($, memberOf(rowTurn, { requestId: textKey(response.answer) }), () => e.turnId)
    }

    return response
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined && e.tool_use_id) {
      const turnId = await read($, currentTurn)
      if (turnId) {
        await addTool($, turnId, e.tool_use_id)
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e)) // the bookkeeping never holds up a tool

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, memberOf(turnInfo, { requestId: e.turnId }), info => info && { ...info, isDone: true })
    }

    return next(e)
  })

  on('ui.render', { component: 'ToolUse' }, ($, e, next) =>
    e.surface === 'terminal' && e.props.isExpanded
      ? next(e)
      : fold($, e, () => next(e), [e.requestId], true),
  )

  on('ui.render', { component: 'ToolResult' }, ($, e, next) =>
    e.surface === 'terminal' && e.props.isExpanded
      ? next(e)
      : fold($, e, () => next(e), [e.props.tool_use_id], false),
  )

  on('ui.render', { component: 'ToolGroup' }, ($, e, next) => {
    if (e.surface === 'terminal' && e.props.isExpanded) {
      return next(e)
    }
    const keys = e.props.calls.flatMap(call => (call.tool_use_id ? [call.tool_use_id] : []))

    return fold($, e, () => next(e), keys, true)
  })

  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) =>
    e.props.isSummary
      ? next(e)
      : fold($, e, () => next(e), [textKey(e.props.text)], false),
  )
}
