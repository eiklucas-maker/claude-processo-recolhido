import { expect, test } from 'claude-code/testing'

const toolRow = (id: string) =>
  ({
    plugin: 'processo-recolhido',
    component: 'ToolUse',
    requestId: id,
    props: {
      tool_use_id: id,
      tool: 'Bash',
      input: { command: 'ls' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
    },
  }) as const

const textRow = (id: string, text: string) =>
  ({
    plugin: 'processo-recolhido',
    component: 'AssistantMessage',
    requestId: id,
    props: { text, isFirstOfReply: false },
  }) as const

const NARRATION = 'Vou listar os arquivos primeiro.'
const ANSWER = 'Pronto: são 3 arquivos.'

test('a turn folds its process under one header, and opens on a press', async ($, on) => {
  // Each hook here stands for the engine beneath the mod.
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: e.index === 0 ? NARRATION : ANSWER,
      toolUses: e.index === 0 ? [{ name: 'Bash', input: { command: 'ls' } }] : [],
      stopReason: e.index === 0 ? 'tool_use' : 'end_turn',
      usage: null,
    } as const
  })
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.turn.start({ text: 'lista', turnId: 'turn-1' })
  for await (const _ of $.turn.step({ turnId: 'turn-1', index: 0, model: 'm', messageCount: 1 })) {
  }
  await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'tu-1' })
  await $.tool.call({ tool: 'Bash', command: 'ls -la', tool_use_id: 'tu-2' })
  for await (const _ of $.turn.step({ turnId: 'turn-1', index: 1, model: 'm', messageCount: 3 })) {
  }
  await $.turn.complete({
    turnId: 'turn-1',
    answer: ANSWER,
    durationMs: 1000,
    isAborted: false,
    reason: 'answer',
  })

  for (const surface of ['desktop', 'mobile', 'terminal'] as const) {
    const head = await $.ui.mount({ ...toolRow('tu-1'), surface })
    const second = await $.ui.mount({ ...toolRow('tu-2'), surface })
    const narration = await $.ui.mount({ ...textRow('m-1', NARRATION), surface })
    const answer = await $.ui.mount({ ...textRow('m-2', ANSWER), surface })

    // Closed: one header with ▼, the rest of the process drawn as nothing.
    expect((await head.find({ type: 'Text', text: /Processo/ }))?.text).toBe(
      '⚙ Processo · 2 etapas',
    )
    expect((await head.find({ key: 'toggle' }))?.props.label).toBe('▼')
    expect(await second.find({ type: 'Text' })).toBeUndefined()
    expect(await narration.find({ type: 'Text' })).toBeUndefined()
    // The answer itself is left to the engine.
    expect((await answer.find({ type: 'Text' }))?.text).toBe('engine')

    // Open: the engine's rows come back and the toggle points up.
    await head.press({ key: 'toggle' })
    expect((await head.find({ key: 'toggle' }))?.props.label).toBe('▲')
    expect((await head.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
    expect((await second.find({ type: 'Text' }))?.text).toBe('engine')
    expect((await narration.find({ type: 'Text' }))?.text).toBe('engine')

    // Closed again for the next surface.
    await head.press({ key: 'toggle' })
    for (const ui of [head, second, narration, answer]) {
      await ui.unmount()
    }
  }
})

test('rows of no known turn are left to the engine', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...toolRow('unknown'), surface: 'desktop' })

  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})
