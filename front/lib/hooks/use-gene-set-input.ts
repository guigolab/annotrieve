"use client"

import { useCallback, useReducer } from "react"
import { toast } from "sonner"

import { planOpenPrefix } from "@/lib/genes/gene-set"
import {
  initialPrefixSheet,
  namesToCommitFromSheet,
  sheetReducer,
} from "@/lib/genes/prefix-sheet"
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
import { toastUndo } from "@/lib/genes/toast-undo"

export function useGeneSetInput() {
  const queryText = useGenesStore((s) => s.queryText)
  const queryNames = useGenesStore((s) => s.queryNames)
  const setQueryText = useGenesStore((s) => s.setQueryText)
  const setQueryNames = useGenesStore((s) => s.setQueryNames)
  const setExcluded = useGenesStore((s) => s.setExcluded)
  const clearGeneSet = useGenesStore((s) => s.clearGeneSet)

  const [sheet, dispatch] = useReducer(sheetReducer, initialPrefixSheet)

  const restoreGeneSet = useCallback(
    (names: string[], text: string) => {
      setQueryNames(names)
      setQueryText(text)
      const excluded = useGenesStore.getState().excluded
      const pruned = pruneExcludedToNames(excluded, names)
      if (pruned !== excluded) setExcluded(pruned)
    },
    [setQueryNames, setQueryText, setExcluded],
  )

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
      if (!next.length && !opts.replace) return false

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
      if (beforePrefix.length) {
        commitNames(beforePrefix, {
          leaveQueryText: prefixTokensOnly(queryText),
        })
      } else {
        setQueryText(prefixTokensOnly(queryText))
      }
      dispatch({
        type: "open",
        seed: prefixes[0]!.replace(/\*+$/, "").trim(),
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
    (explicitSeed?: string) => {
      if (explicitSeed != null && explicitSeed !== "") {
        const stem = explicitSeed.replace(/\*+$/, "").trim()
        dispatch({
          type: "open",
          seed: stem,
          exact: uniqueNames(queryNames, MAX_NAMES_GET),
        })
        return
      }

      const plan = planOpenPrefix(queryText)
      if (plan.mode === "prefix-token") {
        if (plan.exactToCommit.length) {
          commitNames(plan.exactToCommit, {
            leaveQueryText: plan.leaveQueryText,
          })
        } else {
          setQueryText(plan.leaveQueryText)
        }
        dispatch({
          type: "open",
          seed: plan.seed,
          exact: plan.exactToCommit.length
            ? mergeGeneNames(queryNames, plan.exactToCommit, MAX_NAMES_GET)
            : uniqueNames(queryNames, MAX_NAMES_GET),
        })
        return
      }

      // bare-stem or empty: never commit; seed the sheet only.
      dispatch({
        type: "open",
        seed: plan.seed,
        exact: uniqueNames(queryNames, MAX_NAMES_GET),
      })
    },
    [queryText, queryNames, commitNames, setQueryText],
  )

  const cancelPrefix = useCallback(() => {
    dispatch({ type: "close" })
  }, [])

  const applyPrefix = useCallback(
    (names: string[]) => {
      const next = namesToCommitFromSheet(names, sheet.removed)
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
          seed: prefixes[0]!.replace(/\*+$/, "").trim(),
          exact: beforePrefix,
        })
        return
      }
      commitNames(uniqueNames(names, MAX_NAMES_GET), { replace: true })
    },
    [commitNames, setQueryText],
  )

  const removeNames = useCallback(
    (names: string[]) => {
      if (!names.length) return
      const drop = new Set(names.map((n) => n.toLowerCase()))
      const prevNames = useGenesStore.getState().queryNames
      const prevText = useGenesStore.getState().queryText
      const next = prevNames.filter((n) => !drop.has(n.toLowerCase()))
      setQueryNames(next)
      const excluded = useGenesStore.getState().excluded
      const pruned = pruneExcludedToNames(excluded, next)
      if (pruned !== excluded) setExcluded(pruned)
      const label =
        names.length === 1
          ? `Removed ${names[0]}`
          : `Removed ${names.length} genes`
      toastUndo(`${label} · Undo`, () => restoreGeneSet(prevNames, prevText))
    },
    [setQueryNames, setExcluded, restoreGeneSet],
  )

  const removeName = useCallback(
    (name: string) => {
      removeNames([name])
    },
    [removeNames],
  )

  const clearAll = useCallback(() => {
    const prevNames = useGenesStore.getState().queryNames
    const prevText = useGenesStore.getState().queryText
    if (!prevNames.length && !prevText.trim()) {
      clearGeneSet()
      return
    }
    clearGeneSet()
    toastUndo("Cleared gene set · Undo", () =>
      restoreGeneSet(prevNames, prevText),
    )
  }, [clearGeneSet, restoreGeneSet])

  const removeZeroHitNames = useCallback(
    (zeroHitNames: string[]) => {
      if (!zeroHitNames.length) return
      removeNames(zeroHitNames)
    },
    [removeNames],
  )

  /** Paste handler: 2+ exact tokens commit immediately with Undo. */
  const commitPaste = useCallback(
    (pasted: string) => {
      const exact = uniqueNames(
        partitionTokens(tokenizeGeneQuery(pasted)).exact,
        MAX_NAMES_GET,
      )
      if (exact.length < 2) return false
      const prevNames = useGenesStore.getState().queryNames
      const prevText = useGenesStore.getState().queryText
      const before = prevNames.length
      commitNames(exact)
      const added = useGenesStore.getState().queryNames.length - before
      if (added > 0) {
        toastUndo(`Added ${added} genes · Undo`, () =>
          restoreGeneSet(prevNames, prevText),
        )
      }
      return true
    },
    [commitNames, restoreGeneSet],
  )

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
    removeNames,
    removeZeroHitNames,
    clearAll,
    commitNames,
    commitPaste,
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
