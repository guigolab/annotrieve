import { MAX_NAMES_GET } from "@/lib/genes/prefix"
import { uniqueNames } from "@/lib/genes/tokenize"

export interface PrefixSheetState {
  open: boolean
  seed: string
  names: string[]
  removed: Set<string>
}

export type PrefixSheetAction =
  | { type: "open"; seed: string; exact: string[] }
  | { type: "close" }
  | { type: "add"; names: string[] }
  | { type: "drop"; names: string[] }

export const initialPrefixSheet: PrefixSheetState = {
  open: false,
  seed: "",
  names: [],
  removed: new Set(),
}

export function sheetReducer(
  state: PrefixSheetState,
  action: PrefixSheetAction,
): PrefixSheetState {
  switch (action.type) {
    case "open":
      return {
        open: true,
        seed: action.seed,
        names: [...action.exact],
        removed: new Set(),
      }
    case "close":
      return { ...state, open: false }
    case "add": {
      const next = uniqueNames([...state.names, ...action.names], MAX_NAMES_GET)
      const removed = new Set(state.removed)
      for (const name of action.names) removed.delete(name.toLowerCase())
      return { ...state, names: next, removed }
    }
    case "drop": {
      const drop = new Set(action.names.map((n) => n.toLowerCase()))
      const removed = new Set(state.removed)
      for (const id of drop) removed.add(id)
      return {
        ...state,
        names: state.names.filter((n) => !drop.has(n.toLowerCase())),
        removed,
      }
    }
    default:
      return state
  }
}

/**
 * Names that Apply should commit: sheet selection minus the removed set.
 * Pure helper so the acceptance path can be unit-tested without React.
 */
export function namesToCommitFromSheet(
  names: string[],
  removed: Set<string>,
  limit = MAX_NAMES_GET,
): string[] {
  return uniqueNames(
    names.filter((n) => !removed.has(n.toLowerCase())),
    limit,
  )
}
