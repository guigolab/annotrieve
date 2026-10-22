"use client"

import { useCallback, useReducer } from "react"

import {
  partitionTokens,
  tokenizeGeneQuery,
  uniqueNames,
} from "@/lib/genes/tokenize"
import { MAX_NAMES_GET } from "@/lib/genes/prefix"
import { useGenesStore } from "@/lib/genes/store"

interface PrefixSheetState {
  open: boolean
  seed: string
  names: string[]
  removed: Set<string>
}

type PrefixSheetAction =
  | { type: "open"; seed: string; exact: string[] }
  | { type: "close" }
  | { type: "add"; names: string[] }
  | { type: "drop"; names: string[] }

const initialSheet: PrefixSheetState = {
  open: false,
  seed: "",
  names: [],
  removed: new Set(),
}

function sheetReducer(
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

export function useGeneSetInput() {
  const queryText = useGenesStore((s) => s.queryText)
  const queryNames = useGenesStore((s) => s.queryNames)
  const setQueryText = useGenesStore((s) => s.setQueryText)
  const setQueryNames = useGenesStore((s) => s.setQueryNames)
  const setExcluded = useGenesStore((s) => s.setExcluded)

  const [sheet, dispatch] = useReducer(sheetReducer, initialSheet)

  const commitNames = useCallback(
    (names: string[]) => {
      const next = uniqueNames(names, MAX_NAMES_GET)
      if (!next.length) return false
      setQueryNames(next)
      setQueryText(next.join(", "))
      setExcluded(new Set())
      return true
    },
    [setQueryNames, setQueryText, setExcluded],
  )

  const runSearch = useCallback(() => {
    const tokens = tokenizeGeneQuery(queryText)
    const { exact, prefixes } = partitionTokens(tokens)
    if (prefixes.length) {
      dispatch({
        type: "open",
        seed: prefixes[0]!,
        exact: uniqueNames(exact, MAX_NAMES_GET),
      })
      return { openedPrefix: true as const }
    }
    const ok = commitNames(exact)
    return { openedPrefix: false as const, committed: ok }
  }, [queryText, commitNames])

  const openPrefix = useCallback(
    (seed?: string) => {
      const tokens = tokenizeGeneQuery(queryText)
      const { exact, prefixes } = partitionTokens(tokens)
      dispatch({
        type: "open",
        seed: seed ?? prefixes[0] ?? "",
        exact: uniqueNames(exact, MAX_NAMES_GET),
      })
    },
    [queryText],
  )

  const closePrefix = useCallback(() => {
    const next = uniqueNames(
      sheet.names.filter((n) => !sheet.removed.has(n.toLowerCase())),
      MAX_NAMES_GET,
    )
    dispatch({ type: "close" })
    if (next.length) commitNames(next)
  }, [sheet.names, sheet.removed, commitNames])

  const addSheetNames = useCallback((names: string[]) => {
    dispatch({ type: "add", names })
  }, [])

  const dropSheetNames = useCallback((names: string[]) => {
    dispatch({ type: "drop", names })
  }, [])

  const toggleSheetName = useCallback((name: string, checked: boolean) => {
    if (checked) dispatch({ type: "add", names: [name] })
    else dispatch({ type: "drop", names: [name] })
  }, [])

  const applyExample = useCallback(
    (names: string[]) => {
      const { exact, prefixes } = partitionTokens(names)
      if (prefixes.length) {
        setQueryText(names.join(", "))
        dispatch({
          type: "open",
          seed: prefixes[0]!,
          exact: uniqueNames(exact, MAX_NAMES_GET),
        })
        return
      }
      commitNames(exact)
    },
    [commitNames, setQueryText],
  )

  const removeQueryName = useCallback(
    (name: string) => {
      const id = name.toLowerCase()
      const next = queryNames.filter((n) => n.toLowerCase() !== id)
      setQueryNames(next)
      setQueryText(next.join(", "))
    },
    [queryNames, setQueryNames, setQueryText],
  )

  return {
    queryText,
    setQueryText,
    queryNames,
    runSearch,
    openPrefix,
    closePrefix,
    applyExample,
    removeQueryName,
    prefixSheet: {
      open: sheet.open,
      seed: sheet.seed,
      names: sheet.names,
      onToggle: toggleSheetName,
      onIncludeShown: addSheetNames,
      onExcludeShown: dropSheetNames,
    },
  }
}
