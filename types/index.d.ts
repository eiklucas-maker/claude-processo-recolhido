export type TurnInfo = { first: string; count: number; isDone: boolean }

declare module 'claude-code' {
  interface PluginState {
    'processo-recolhido': {
      currentTurn: string | null
      rowTurn: StateFamily<string | null>
      turnInfo: StateFamily<TurnInfo | null>
      isOpen: StateFamily<boolean>
    }
  }
}
