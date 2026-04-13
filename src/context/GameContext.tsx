import { createContext, useContext, useReducer, type ReactNode } from 'react'
import { DEFAULT_ROUNDS, type AppView, type GameState } from '@/types/game'
import { SESSION_KEY } from '@/context/MultiplayerContext'

type GameAction =
  | { type: 'SET_VIEW'; view: AppView }
  | { type: 'SET_TOTAL_ROUNDS'; totalRounds: number }
  | { type: 'RESET_GAME' }

function getInitialView(): AppView {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) {
      const { roomCode } = JSON.parse(raw)
      if (roomCode) return 'waitingRoom'
    }
  } catch {}
  return 'start'
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, view: action.view }
    case 'SET_TOTAL_ROUNDS':
      return { ...state, totalRounds: action.totalRounds }
    case 'RESET_GAME':
      return { view: 'start', totalRounds: DEFAULT_ROUNDS }
    default:
      return state
  }
}

interface GameContextValue {
  state: GameState
  dispatch: React.Dispatch<GameAction>
  goTo: (view: AppView) => void
  setTotalRounds: (n: number) => void
  resetGame: () => void
}

const GameContext = createContext<GameContextValue | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => ({
    view: getInitialView(),
    totalRounds: DEFAULT_ROUNDS,
  }))

  const value: GameContextValue = {
    state,
    dispatch,
    goTo: (view) => dispatch({ type: 'SET_VIEW', view }),
    setTotalRounds: (totalRounds) => dispatch({ type: 'SET_TOTAL_ROUNDS', totalRounds }),
    resetGame: () => dispatch({ type: 'RESET_GAME' }),
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used within a GameProvider')
  return ctx
}
