"use client"

import { useCallback, useReducer } from "react"

import {
  exactNamesBeforePrefixSheet,
  mergeGeneNames,
  partitionTokens,
  prefixTokensOnly,
  pruneExcludedToNames,
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
  const clearGeneSet = useGenesStore((s) => s.clearGeneSet)

  const [sheet, dispatch] = useReducer(sheetReducer, initialSheet)

  /**
   * Merge exact names into the committed gene set and clear the draft input.
   * Keeps existing exclusions for names that remain in the set.
   */
  const commitNames = useCallback(
    (
      names: string[],
      opts: {
        /** Replace the set instead of appending (examples). */
        replace?: boolean
        /** Leave this text in the input (prefix tokens while the sheet is open). */
        leaveQueryText?: string
      } = {},
    ) => {
      const incoming = uniqueNames(names, MAX_NAMES_GET)
      if (!incoming.length && !opts.replace) return false

      const existing = useGenesStore.getState().queryNames
      const next = opts.replace
        ? uniqueNames(incoming, MAX_NAMES_GET)
        : mergeGeneNames(existing, incoming, MAX_NAMES_GET)
      if (!next.length) return false

      setQueryNames(next)
      setQueryText(opts.leaveQueryText ?? "")

      const excluded = useGenesStore.getState().excluded
      const pruned = pruneExcludedToNames(excluded, next)
      if (pruned !== excluded) setExcluded(pruned)
      return true
    },
    [setQueryNames, setQueryText, setExcluded],
  )

  const runSearch = useCallback(() => {
    const beforePrefix = exactNamesBeforePrefixSheet(queryText)
    if (beforePrefix) {
      const tokens = tokenizeGeneQuery(queryText)
      const { prefixes } = partitionTokens(tokens)
      // Commit exact names now so Cancel only abandons unchecked prefix picks.
      // Leave prefix tokens in the input until Apply / Cancel.
      if (beforePrefix.length) {
        commitNames(beforePrefix, {
          leaveQueryText: prefixTokensOnly(queryText),
        })
      } else {
        setQueryText(prefixTokensOnly(queryText))
      }
      dispatch({
        type: "open",
        seed: prefixes[0]!,
        exact: beforePrefix.length
          ? mergeGeneNames(queryNames, beforePrefix, MAX_NAMES_GET)
          : uniqueNames(queryNames, MAX_NAMES_GET),
      })
      return { openedPrefix: true as const }
    }
    const exact = uniqueNames(
      partitionTokens(tokenizeGeneQuery(queryText)).exact,
      MAX_NAMES_GET,
    )
    const ok = commitNames(exact)
    return { openedPrefix: false as const, committed: ok }
  }, [queryText, queryNames, commitNames, setQueryText])

  const openPrefix = useCallback(
    (seed?: string) => {
      const tokens = tokenizeGeneQuery(queryText)
      const { exact, prefixes } = partitionTokens(tokens)
      const exactNames = uniqueNames(exact, MAX_NAMES_GET)
      // Keep any exact tokens already typed when opening the sheet manually.
      if (exactNames.length) {
        commitNames(exactNames, {
          leaveQueryText: prefixTokensOnly(queryText) || queryText,
        })
      }
      dispatch({
        type: "open",
        seed: seed ?? prefixes[0] ?? "",
        exact: exactNames.length
          ? mergeGeneNames(queryNames, exactNames, MAX_NAMES_GET)
          : uniqueNames(queryNames, MAX_NAMES_GET),
      })
    },
    [queryText, queryNames, commitNames],
  )

  /** Discard sheet draft without committing. */
  const cancelPrefix = useCallback(() => {
    dispatch({ type: "close" })
  }, [])

  /** Commit selected sheet names into the gene set and clear the input. */
  const applyPrefix = useCallback(
    (names: string[]) => {
      const next = uniqueNames(
        names.filter((n) => !sheet.removed.has(n.toLowerCase())),
        MAX_NAMES_GET,
      )
      dispatch({ type: "close" })
      if (next.length) commitNames(next)
      else setQueryText("")
    },
    [sheet.removed, commitNames, setQueryText],
  )

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
      const beforePrefix = exactNamesBeforePrefixSheet(names.join(", "))
      if (beforePrefix) {
        const { prefixes } = partitionTokens(names)
        if (beforePrefix.length) {
          commitNames(beforePrefix, {
            replace: true,
            leaveQueryText: prefixes.join(", "),
          })
        } else {
          setQueryText(prefixes.join(", "))
        }
        dispatch({
          type: "open",
          seed: prefixes[0]!,
          exact: beforePrefix,
        })
        return
      }
      commitNames(uniqueNames(names, MAX_NAMES_GET), { replace: true })
    },
    [commitNames, setQueryText],
  )

  const removeName = useCallback(
    (name: string) => {
      const id = name.toLowerCase()
      const next = queryNames.filter((n) => n.toLowerCase() !== id)
      setQueryNames(next)
      // Drop any view-exclusion keyed by this name (input or accession id).
      const excluded = useGenesStore.getState().excluded
      if (excluded.has(id)) {
        const nextExcluded = new Set(excluded)
        nextExcluded.delete(id)
        setExcluded(nextExcluded)
      }
    },
    [queryNames, setQueryNames, setExcluded],
  )

  const clearAll = useCallback(() => {
    clearGeneSet()
  }, [clearGeneSet])

  const draftExact = partitionTokens(tokenizeGeneQuery(queryText)).exact
  const nameCount = mergeGeneNames(queryNames, draftExact, MAX_NAMES_GET).length

  return {
    queryText,
    setQueryText,
    queryNames,
    nameCount,
    runSearch,
    openPrefix,
    cancelPrefix,
    applyPrefix,
    applyExample,
    removeName,
    clearAll,
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
